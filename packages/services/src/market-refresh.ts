import { getDb, toJson } from "@quvr/db";
import { getProviders } from "@quvr/providers";
import { chainSlug, type PairInfo } from "@quvr/shared";
import { resolveTokenChain } from "./chain-resolve";
import { safeDb } from "./persistence";

/**
 * Light 15-second refresh: one batched Dexscreener call per 30 tokens → market and
 * liquidity snapshots. Heavy on-chain analysis runs on the slower holders cadence.
 * Returns liquidity per token (null when unknown — never 0 for missing data).
 */
export async function refreshMarketSnapshots(
  tokens: string[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const p = getProviders();
  if (tokens.length === 0) return out;
  // One batched Dexscreener call per chain (Robinhood 0x…, Solana base58).
  const byChain = new Map<string, string[]>();
  for (const t of tokens) {
    const slug = chainSlug(await resolveTokenChain(t));
    byChain.set(slug, [...(byChain.get(slug) ?? []), t]);
  }
  const pairs: PairInfo[] = [];
  for (const [slug, list] of byChain) pairs.push(...(await p.market.getTokensPairs(slug, list)));
  const byToken = new Map<string, PairInfo[]>();
  for (const pair of pairs)
    byToken.set(pair.baseToken.address, [...(byToken.get(pair.baseToken.address) ?? []), pair]);
  await safeDb(
    "refreshMarketSnapshots",
    async () => {
      const db = getDb();
      for (const token of tokens) {
        const own = (byToken.get(token) ?? []).sort(
          (a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0),
        );
        const main = own[0];
        if (!main) {
          out.set(token, null);
          continue;
        }
        const liquidity = own.some((x) => x.liquidityUsd !== null)
          ? own.reduce((s, x) => s + (x.liquidityUsd ?? 0), 0)
          : null;
        out.set(token, liquidity);
        const known = await db.tradingPair.findUnique({
          where: { pairAddress: main.pairAddress },
          select: { pairAddress: true },
        });
        await db.marketSnapshot.create({
          data: {
            tokenAddress: token,
            pairAddress: known ? main.pairAddress : null,
            priceUsd: main.priceUsd,
            priceNative: main.priceNative,
            marketCapUsd: main.marketCapUsd,
            fdvUsd: main.fdvUsd,
            liquidityUsd: liquidity,
            volumeH24: main.volume.h24,
            volumeH1: main.volume.h1,
            buysH24: main.txns.h24?.buys ?? null,
            sellsH24: main.txns.h24?.sells ?? null,
            source: "dexscreener",
            confidence: "high",
          },
        });
        await db.liquiditySnapshot.create({
          data: {
            tokenAddress: token,
            pairAddress: known ? main.pairAddress : null,
            liquidityUsd: liquidity,
            source: "dexscreener",
          },
        });
      }
    },
    undefined,
  );
  return out;
}

/** 6-hourly refresh of official project links from Dexscreener (sanitized in the adapter). */
export async function refreshSocialLinks(tokens: string[]) {
  const p = getProviders();
  for (const token of tokens) {
    const slug = chainSlug(await resolveTokenChain(token));
    try {
      const r = await p.market.getTokenPairs(slug, token);
      await safeDb(
        "refreshSocialLinks",
        () =>
          getDb().token.update({
            where: { address: token },
            data: { links: toJson(r.links), imageUrl: r.imageUrl, socialLinksAt: new Date() },
          }),
        undefined,
      );
    } catch {
      /* next cycle */
    }
  }
}

export async function tokensNeedingLinks(maxAgeHours = 6): Promise<string[]> {
  return safeDb(
    "tokensNeedingLinks",
    async () =>
      (
        await getDb().token.findMany({
          where: {
            OR: [
              { socialLinksAt: null },
              { socialLinksAt: { lt: new Date(Date.now() - maxAgeHours * 3_600_000) } },
            ],
          },
          select: { address: true },
          take: 50,
        })
      ).map((t) => t.address),
    [],
  );
}

/** Stores a realtime social alert (WebSocket) as a TradeSignal. */
export async function storeTradeSignal(s: {
  eventId: string;
  handle: string | null;
  tokenAddress: string | null;
  kind: string;
  tradeUsd: number | null;
  at: string;
  source: string;
}) {
  await safeDb(
    "storeTradeSignal",
    async () => {
      const db = getDb();
      let traderId: string | null = null;
      if (s.handle)
        traderId = (
          await db.trader.upsert({
            where: { handle: s.handle },
            create: { handle: s.handle },
            update: {},
          })
        ).id;
      await db.tradeSignal.upsert({
        where: { id: s.eventId },
        create: {
          id: s.eventId,
          traderId,
          tokenAddress: s.tokenAddress,
          kind: s.kind,
          tradeUsd: s.tradeUsd,
          timestamp: new Date(s.at),
          source: s.source,
        },
        update: {},
      });
    },
    undefined,
  );
}

/**
 * Stores one realtime social alert (FomoAPI /ws/alerts, no credit cost):
 *  - buy/sell → TradeSignal (used for "confirmed by a real buy" and "author exited");
 *  - thesis   → Thesis row keyed by the provider event id (deduplicated).
 * Returns true when it was a new thesis.
 */
/** Concurrent events of one author can race on the unique handle: retry once on conflict. */
async function upsertTrader(handle: string) {
  const db = getDb();
  try {
    return await db.trader.upsert({ where: { handle }, create: { handle }, update: {} });
  } catch {
    return db.trader.findUniqueOrThrow({ where: { handle } });
  }
}

export async function storeSocialAlert(a: {
  eventId: string;
  type: "buy" | "sell" | "thesis" | "other";
  handle: string | null;
  tokenAddress: string | null;
  tradeUsd: number | null;
  realizedPnlUsd: number | null;
  tradeId?: string | null;
  text: string | null;
  tokenSymbol: string | null;
  at: string;
}): Promise<boolean> {
  if (!a.handle || !a.tokenAddress) return false;
  return safeDb(
    "storeSocialAlert",
    async () => {
      const db = getDb();
      const trader = await upsertTrader(a.handle!);
      await db.token.upsert({
        where: { address: a.tokenAddress! },
        create: { address: a.tokenAddress!, symbol: a.tokenSymbol },
        update: {},
      });
      await db.tradeSignal.upsert({
        where: { id: a.eventId },
        create: {
          id: a.eventId,
          traderId: trader.id,
          tokenAddress: a.tokenAddress,
          kind: a.type,
          tradeUsd: a.tradeUsd,
          timestamp: new Date(a.at),
          source: "fomoapi-ws",
          raw: a.realizedPnlUsd !== null ? { realizedPnlUsd: a.realizedPnlUsd } : undefined,
        },
        update: a.realizedPnlUsd !== null ? { raw: { realizedPnlUsd: a.realizedPnlUsd } } : {},
      });
      if (a.type !== "thesis" || !a.text) return false;
      const existing = await db.thesis.findUnique({
        where: { id: a.eventId },
        select: { id: true },
      });
      if (existing) {
        // Same event from feed and stream: keep the cleanest text and any trade link.
        await db.thesis.update({
          where: { id: a.eventId },
          data: { text: a.text, ...(a.tradeId ? { tradeId: a.tradeId } : {}) },
        });
        return false;
      }
      await db.thesis.create({
        data: {
          id: a.eventId,
          traderId: trader.id,
          tokenAddress: a.tokenAddress!,
          text: a.text,
          tradeId: a.tradeId ?? null,
          publishedAt: new Date(a.at),
          source: "fomoapi-ws",
        },
      });
      return true;
    },
    false,
  );
}
