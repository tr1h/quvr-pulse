import { getDb } from "@quvr/db";
import { getProviders, metricsSnapshot, type MetricsSnapshot } from "@quvr/providers";
import { appMode, serverEnv, type AppMode } from "@quvr/shared";
import { cacheGet, cacheSet } from "./cache";
import { dbAvailable, safeDb } from "./persistence";
import { fomoCreditUsage } from "./fomo-credits";
import { getRedis, redisReady } from "./redis";

export type SystemStatus = {
  mode: AppMode;
  chainId: number;
  rpc: "public" | "alchemy";
  database: "ok" | "down" | "not-configured";
  redis: "ok" | "down" | "not-configured";
  worker: { lastHeartbeat: string | null; alive: boolean };
  fomoCredits: Awaited<ReturnType<typeof fomoCreditUsage>> | null;
  sources: Array<MetricsSnapshot & { reporter: string; configured: boolean; note: string | null }>;
  generatedAt: string;
};

export async function workerHeartbeat() {
  await cacheSet("worker:heartbeat", new Date().toISOString(), 300);
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const env = serverEnv();
  const p = getProviders();
  const database = !env.DATABASE_URL
    ? "not-configured"
    : (await safeDb("status:ping", async () => (await getDb().$queryRaw`SELECT 1`, true), false))
      ? "ok"
      : "down";
  if (env.REDIS_URL && !redisReady()) {
    try {
      await getRedis()?.ping();
    } catch {
      /* reported as down */
    }
  }
  const hb = await cacheGet<string>("worker:heartbeat");
  const configured: Record<string, { configured: boolean; note: string | null }> = {
    rpc: { configured: true, note: "public Robinhood RPC" },
    alchemy: { configured: !!env.ALCHEMY_API_KEY, note: null },
    dexscreener: { configured: true, note: null },
    blockscout: {
      configured: p.explorer.isConfigured(),
      note: p.explorer.isConfigured()
        ? null
        : "BLOCKSCOUT_API_KEY not set — public API is bot-protected",
    },
    fomoapi: {
      configured: p.social.isEnabled(),
      note: p.social.isEnabled() ? null : "FOMO_API_KEY not set — onchain-only mode",
    },
    telegram: {
      configured: !!env.TELEGRAM_BOT_TOKEN,
      note: env.TELEGRAM_BOT_TOKEN ? null : "TELEGRAM_BOT_TOKEN not set",
    },
  };

  // Local process metrics + those reported by the worker/bot into the database.
  const local = metricsSnapshot().map((m) => ({
    ...m,
    reporter: "web",
    ...(configured[m.source] ?? { configured: true, note: null }),
  }));
  const remote = dbAvailable()
    ? await safeDb(
        "status:sources",
        () => getDb().dataSourceStatus.findMany({ orderBy: { source: "asc" } }),
        [],
      )
    : [];
  const remoteRows = remote
    .filter((r) => r.calls > 0)
    .map((r) => {
      const source = r.source.split(":").slice(1).join(":");
      return {
        source,
        calls: r.calls,
        successes: r.calls - r.failures,
        failures: r.failures,
        successRate: r.successRate,
        p50LatencyMs: r.p50LatencyMs,
        p95LatencyMs: r.p95LatencyMs,
        lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
        lastErrorAt: r.lastErrorAt?.toISOString() ?? null,
        lastError: r.lastError,
        circuit: (r.status === "down" ? "open" : "closed") as MetricsSnapshot["circuit"],
        reporter: r.reporter,
        ...(configured[source] ?? { configured: true, note: r.note }),
      };
    });
  const seen = new Set([...local, ...remoteRows].map((r) => r.source));
  const idle = Object.entries(configured)
    .filter(([s]) => !seen.has(s) && s !== "alchemy")
    .map(([source, c]) => ({
      source,
      calls: 0,
      successes: 0,
      failures: 0,
      successRate: null,
      p50LatencyMs: null,
      p95LatencyMs: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastError: null,
      circuit: "closed" as const,
      reporter: "-",
      ...c,
    }));

  return {
    mode: appMode(env),
    chainId: env.ROBINHOOD_CHAIN_ID,
    rpc: env.ALCHEMY_API_KEY ? "alchemy" : "public",
    database,
    redis: !env.REDIS_URL ? "not-configured" : redisReady() ? "ok" : "down",
    worker: { lastHeartbeat: hb?.value ?? null, alive: !!hb && hb.ageMs < 120_000 },
    fomoCredits: p.social.isEnabled() ? await fomoCreditUsage().catch(() => null) : null,
    sources: [...local, ...remoteRows, ...idle],
    generatedAt: new Date().toISOString(),
  };
}
