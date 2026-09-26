import { getDb } from "@quvr/db";
import { safeDb } from "./persistence";

/**
 * Keeps the database small on a 40 GB VPS: 15-second market/liquidity points are only needed for
 * recent charts, so they are dropped after SNAPSHOT_RETENTION_DAYS (default 30). Score snapshots
 * and findings are kept — they are the history for future outcome statistics.
 */
export async function pruneOldSnapshots(): Promise<{ market: number; liquidity: number }> {
  const days = Math.max(3, Number(process.env.SNAPSHOT_RETENTION_DAYS ?? "30"));
  const before = new Date(Date.now() - days * 86_400_000);
  return safeDb(
    "prune snapshots",
    async () => {
      const db = getDb();
      const [m, l] = await Promise.all([
        db.marketSnapshot.deleteMany({ where: { timestamp: { lt: before } } }),
        db.liquiditySnapshot.deleteMany({ where: { timestamp: { lt: before } } }),
      ]);
      return { market: m.count, liquidity: l.count };
    },
    { market: 0, liquidity: 0 },
  );
}
