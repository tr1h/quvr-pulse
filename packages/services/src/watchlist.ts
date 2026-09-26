import { getDb } from "@quvr/db";
import { normalizeTokenAddress } from "@quvr/shared";
import { safeDb } from "./persistence";

export type OwnerType = "web" | "telegram";

export const DEFAULT_RULES: Array<{ kind: string; threshold: number | null }> = [
  { kind: "deployer-sell", threshold: null },
  { kind: "liquidity-drop", threshold: 20 }, // percent within 1h
  { kind: "large-sell", threshold: 1_000 }, // USD
  { kind: "privilege-change", threshold: null },
  { kind: "quality-thesis", threshold: null },
  { kind: "quality-cluster", threshold: 2 }, // quality authors within 1h
  { kind: "author-exit", threshold: null },
  { kind: "sell-sim-failed", threshold: null },
];

export async function addToWatchlist(
  ownerType: OwnerType,
  ownerId: string,
  address: string,
): Promise<boolean> {
  const token = normalizeTokenAddress(address);
  return safeDb(
    "addToWatchlist",
    async () => {
      const db = getDb();
      await db.token.upsert({ where: { address: token }, create: { address: token }, update: {} });
      const wl = await db.watchlist.upsert({
        where: { ownerType_ownerId_tokenAddress: { ownerType, ownerId, tokenAddress: token } },
        create: { ownerType, ownerId, tokenAddress: token },
        update: {},
      });
      for (const r of DEFAULT_RULES) {
        await db.alertRule.upsert({
          where: { watchlistId_kind: { watchlistId: wl.id, kind: r.kind } },
          create: { watchlistId: wl.id, kind: r.kind, threshold: r.threshold },
          update: {},
        });
      }
      return true;
    },
    false,
  );
}

export async function removeFromWatchlist(
  ownerType: OwnerType,
  ownerId: string,
  address: string,
): Promise<boolean> {
  const token = normalizeTokenAddress(address);
  return safeDb(
    "removeFromWatchlist",
    async () => {
      const res = await getDb().watchlist.deleteMany({
        where: { ownerType, ownerId, tokenAddress: token },
      });
      return res.count > 0;
    },
    false,
  );
}

export async function listWatchlist(ownerType: OwnerType, ownerId: string) {
  return safeDb(
    "listWatchlist",
    () =>
      getDb().watchlist.findMany({
        where: { ownerType, ownerId },
        orderBy: { createdAt: "desc" },
        include: { token: { select: { symbol: true, name: true, lastScannedAt: true } } },
      }),
    [],
  );
}

export async function isWatched(ownerType: OwnerType, ownerId: string, address: string) {
  return safeDb(
    "isWatched",
    async () =>
      !!(await getDb().watchlist.findFirst({
        where: { ownerType, ownerId, tokenAddress: normalizeTokenAddress(address) },
      })),
    false,
  );
}

/** Tokens the worker keeps fresh: everything on any watchlist plus recently scanned tokens. */
export async function activeTokens(recentHours = 6, limit = 100): Promise<string[]> {
  return safeDb(
    "activeTokens",
    async () => {
      const db = getDb();
      const watched = await db.watchlist.findMany({
        select: { tokenAddress: true },
        distinct: ["tokenAddress"],
      });
      const recent = await db.token.findMany({
        where: { lastScannedAt: { gte: new Date(Date.now() - recentHours * 3_600_000) } },
        select: { address: true },
        orderBy: { lastScannedAt: "desc" },
        take: limit,
      });
      return [
        ...new Set([...watched.map((w) => w.tokenAddress), ...recent.map((r) => r.address)]),
      ].slice(0, limit);
    },
    [],
  );
}

export async function alertEventsForOwner(ownerType: OwnerType, ownerId: string, limit = 30) {
  return safeDb(
    "alertEventsForOwner",
    () =>
      getDb().alertEvent.findMany({
        where: { rule: { watchlist: { ownerType, ownerId } } },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { token: { select: { symbol: true } } },
      }),
    [],
  );
}
