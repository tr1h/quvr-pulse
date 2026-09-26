import { FomoApiSocialProvider, getProviders } from "@quvr/providers";
import { logger } from "@quvr/shared";
import { getRedis, redisReady } from "./redis";

/**
 * Daily FomoAPI credit budget shared by web, worker and bot (Redis).
 * FOMO_DAILY_CREDIT_CAP (default 6 000 ≈ 180 000/month, under the free 250 000).
 * Without Redis nothing paid is sent: there would be no shared counter.
 */
const day = () => new Date().toISOString().slice(0, 10);
export const creditCap = () => Math.max(0, Number(process.env.FOMO_DAILY_CREDIT_CAP ?? "6000"));

export function installFomoCreditGuard() {
  const social = getProviders().social;
  if (!(social instanceof FomoApiSocialProvider) || social.creditGuard) return;
  social.creditGuard = {
    async reserve(estimate, endpoint) {
      if (!redisReady()) {
        // Freshly started process: give the shared connection a moment before refusing.
        const r0 = getRedis();
        if (r0 && r0.status !== "end") {
          await new Promise<void>((res) => {
            r0.once("ready", () => res());
            setTimeout(res, 3_000);
          });
        }
        if (!redisReady()) {
          logger.warn("fomoapi call skipped: Redis unavailable, no shared credit counter", {
            endpoint,
          });
          return false;
        }
      }
      const r = getRedis()!;
      const spent = Number((await r.get(`quvr:fomo:credits:${day()}`)) ?? "0");
      if (spent + estimate > creditCap()) {
        logger.warn("fomoapi credit budget reached", { endpoint, spent, cap: creditCap() });
        return false;
      }
      return true;
    },
    async record(cost, remaining, endpoint) {
      if (!redisReady() || cost <= 0) return;
      const r = getRedis()!;
      const key = `quvr:fomo:credits:${day()}`;
      await r.incrby(key, cost);
      await r.expire(key, 3 * 86_400);
      await r.hincrby(`quvr:fomo:credits-by-endpoint:${day()}`, endpoint, cost);
      await r.expire(`quvr:fomo:credits-by-endpoint:${day()}`, 3 * 86_400);
      if (remaining !== null) await r.set("quvr:fomo:credits-remaining", String(remaining));
    },
  };
}

export async function fomoCreditUsage(): Promise<{
  today: number | null;
  cap: number;
  remainingMonth: number | null;
  byEndpoint: Record<string, number>;
}> {
  if (!redisReady()) return { today: null, cap: creditCap(), remainingMonth: null, byEndpoint: {} };
  const r = getRedis()!;
  const [today, remaining, by] = await Promise.all([
    r.get(`quvr:fomo:credits:${day()}`),
    r.get("quvr:fomo:credits-remaining"),
    r.hgetall(`quvr:fomo:credits-by-endpoint:${day()}`),
  ]);
  return {
    today: Number(today ?? "0"),
    cap: creditCap(),
    remainingMonth: remaining === null ? null : Number(remaining),
    byEndpoint: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Number(v)])),
  };
}
