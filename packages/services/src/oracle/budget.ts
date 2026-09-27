import { getDb } from "@quvr/db";
import { getRedis } from "../redis";
import { dailyLimit } from "./journal";
import { oracleWindow, ORACLE_INTERVAL_MS, ORACLE_WINDOWS_PER_DAY } from "./pacing";

/** Read-only view of the same global UTC-day reservation budget used by the publisher.
 * Throw on unavailable data: the public page must never turn an outage into "0 used".
 */
export async function oraclePublicationBudget(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const limit = dailyLimit();
  const budget = await getDb().oracleDayBudget.findUnique({ where: { day } });
  let used = budget?.used;
  if (used === undefined) {
    const redis = getRedis();
    if (!redis || redis.status !== "ready") throw new Error("Oracle budget unavailable");
    const raw = await redis.get(`quvr:oracle:day:${day}`);
    used = raw ? Number(JSON.parse(raw).value) : 0;
  }
  if (!Number.isSafeInteger(used) || used < 0) throw new Error("Invalid oracle budget");
  const window = oracleWindow(limit, now);
  const slot = await getDb().oraclePublication.aggregate({
    where: { day, createdAt: { gte: window.start, lt: window.end } },
    _sum: { labelCount: true },
  });
  const windowUsed = slot._sum.labelCount ?? 0;
  if (!Number.isSafeInteger(windowUsed) || windowUsed < 0)
    throw new Error("Invalid oracle window budget");
  return {
    day,
    limit,
    intervalMinutes: ORACLE_INTERVAL_MS / 60_000,
    windowsPerDay: ORACLE_WINDOWS_PER_DAY,
    used,
    remaining: Math.max(0, limit - used),
    windowAllowance: window.allowance,
    windowRemaining: Math.max(0, Math.min(limit - used, window.allowance - windowUsed)),
    nextWindowAt: window.end.toISOString(),
    resetsAt: new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString(),
  };
}
