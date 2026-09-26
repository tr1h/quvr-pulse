import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@quvr/db";
import { getRedis, redisReady } from "./redis";
import { safeDb } from "./persistence";

/**
 * Private, cookieless site statistics kept in Redis (daily keys, 400 days).
 * Visitors are counted as sha256(daily random salt + IP + user agent) in a HyperLogLog: the salt
 * rotates every day and is never exposed, so raw IPs are never stored and days cannot be linked.
 */
const TTL = 400 * 86_400;
const BOT_UA =
  /bot|crawl|spider|slurp|headless|curl|wget|python|go-http|httpclient|monitor|preview|scanner|facebookexternalhit|embedly|axios|node-fetch|okhttp|java\//i;
export const STAT_EVENTS = ["share_x", "copy_post", "watch", "trade_out"] as const;
export type StatEvent = (typeof STAT_EVENTS)[number];
export const BOT_STATS = [
  "card_group",
  "card_private",
  "inline",
  "scan_cmd",
  "group_joined",
] as const;
export type BotStat = (typeof BOT_STATS)[number];

const day = (d = new Date()) => d.toISOString().slice(0, 10);
const k = (name: string, d = day()) => `quvr:stats:${name}:${d}`;

async function daySalt(d: string): Promise<string> {
  const r = getRedis()!;
  const key = k("salt", d);
  const existing = await r.get(key);
  if (existing) return existing;
  const fresh = randomBytes(16).toString("hex");
  // NX: concurrent requests agree on one salt; it expires two days later.
  await r.set(key, fresh, "EX", 2 * 86_400, "NX");
  return (await r.get(key)) ?? fresh;
}

export function isBotAgent(ua: string): boolean {
  return !ua || BOT_UA.test(ua);
}

/** Groups pages so the dashboard stays readable (token reports are one bucket + a top list). */
export function pageGroup(path: string): string {
  if (path.startsWith("/token/")) return "/token/*";
  if (path.startsWith("/learn/")) return "/learn/*";
  if (path.startsWith("/trader/")) return "/trader/*";
  return path.slice(0, 80) || "/";
}

export async function recordHit(hit: {
  path: string;
  referrer: string;
  locale: string;
  ip: string;
  ua: string;
}): Promise<void> {
  if (!redisReady() || isBotAgent(hit.ua) || hit.path.startsWith("/admin")) return;
  const r = getRedis()!;
  const d = day();
  const visitor = createHash("sha256")
    .update(`${await daySalt(d)}|${hit.ip}|${hit.ua}`)
    .digest("hex")
    .slice(0, 24);
  let ref = "(direct)";
  try {
    if (hit.referrer) ref = new URL(hit.referrer).host.replace(/^www\./, "").slice(0, 60);
  } catch {
    // keep "(direct)"
  }
  const m = r.multi();
  m.pfadd(k("uv", d), visitor);
  m.incr(k("pv", d));
  m.hincrby(k("pages", d), pageGroup(hit.path), 1);
  if (ref !== "quvrpulse.com") m.hincrby(k("ref", d), ref, 1);
  m.hincrby(k("lang", d), hit.locale.slice(0, 5) || "?", 1);
  const token = /^\/token\/([^/?#]{32,66})/.exec(hit.path)?.[1];
  if (token) m.zincrby(k("tokens", d), 1, token.slice(0, 66));
  for (const name of ["uv", "pv", "pages", "ref", "lang", "tokens"]) m.expire(k(name, d), TTL);
  await m.exec();
}

export async function recordEvent(name: StatEvent): Promise<void> {
  if (!redisReady()) return;
  const r = getRedis()!;
  await r.multi().hincrby(k("events"), name, 1).expire(k("events"), TTL).exec();
}

export async function recordBot(name: BotStat, groupId?: number): Promise<void> {
  if (!redisReady()) return;
  const r = getRedis()!;
  const m = r.multi().hincrby(k("bot"), name, 1).expire(k("bot"), TTL);
  if (groupId !== undefined) m.sadd("quvr:stats:bot-groups", String(groupId));
  await m.exec();
}

export type DayStats = {
  day: string;
  visitors: number;
  views: number;
  pages: Record<string, number>;
  referrers: Record<string, number>;
  languages: Record<string, number>;
  events: Record<string, number>;
  bot: Record<string, number>;
  topTokens: Array<{ address: string; views: number }>;
};

const toNum = (h: Record<string, string>) =>
  Object.fromEntries(Object.entries(h).map(([a, b]) => [a, Number(b)]));

export async function getSiteStats(days = 14): Promise<{
  days: DayStats[];
  botGroups: number;
  db: {
    tokens: number;
    tokensToday: number;
    baselines: number;
    outcomes: number;
    watchlists: number;
  };
  redis: boolean;
}> {
  const out: DayStats[] = [];
  if (redisReady()) {
    const r = getRedis()!;
    for (let i = 0; i < days; i++) {
      const d = day(new Date(Date.now() - i * 86_400_000));
      const [uv, pv, pages, ref, lang, events, bot, tokens] = await Promise.all([
        r.pfcount(k("uv", d)),
        r.get(k("pv", d)),
        r.hgetall(k("pages", d)),
        r.hgetall(k("ref", d)),
        r.hgetall(k("lang", d)),
        r.hgetall(k("events", d)),
        r.hgetall(k("bot", d)),
        r.zrevrange(k("tokens", d), 0, 9, "WITHSCORES"),
      ]);
      const top: DayStats["topTokens"] = [];
      for (let j = 0; j < tokens.length; j += 2)
        top.push({ address: tokens[j]!, views: Number(tokens[j + 1]) });
      out.push({
        day: d,
        visitors: uv,
        views: Number(pv ?? 0),
        pages: toNum(pages),
        referrers: toNum(ref),
        languages: toNum(lang),
        events: toNum(events),
        bot: toNum(bot),
        topTokens: top,
      });
    }
  }
  const botGroups = redisReady() ? await getRedis()!.scard("quvr:stats:bot-groups") : 0;
  const db = await safeDb(
    "stats:db",
    async () => {
      const x = getDb();
      const since = new Date(Date.now() - 86_400_000);
      const [tokens, tokensToday, baselines, outcomes, watchlists] = await Promise.all([
        x.token.count(),
        x.token.count({ where: { firstSeenAt: { gte: since } } }),
        x.tokenBaseline.count(),
        x.tokenOutcome.count(),
        x.watchlist.count(),
      ]);
      return { tokens, tokensToday, baselines, outcomes, watchlists };
    },
    { tokens: 0, tokensToday: 0, baselines: 0, outcomes: 0, watchlists: 0 },
  );
  return { days: out, botGroups, db, redis: redisReady() };
}
