import { getDb } from "@quvr/db";
import { getProviders } from "@quvr/providers";
import { earlyDiscovery, verdictLevel, type EarlyDiscoveryResult } from "@quvr/scoring";
import { chainSlug, type PairInfo, type RiskLevel, type TokenReport } from "@quvr/shared";
import { swr } from "./cache";
import { safeDb } from "./persistence";

export type RadarRow = {
  address: string;
  symbol: string | null;
  name: string | null;
  chain: string;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  socialMomentum: number | null;
  contractSafety: number | null;
  liquidityHealth: number | null;
  distributionHealth: number | null;
  qualityAuthors: number | null;
  signalAgeMinutes: number | null;
  holderGrowth1h: number | null;
  holderGrowth24h: number | null;
  newWallets24h: number | null;
  change5m: number | null;
  change1h: number | null;
  change6h: number | null;
  change24h: number | null;
  priceUsd: number | null;
  volume24hUsd: number | null;
  buys24h: number | null;
  sells24h: number | null;
  /** Main pool creation time (ISO), for the "age" column. */
  pairCreatedAt: string | null;
  /** Overall label from contract / liquidity / distribution (never "safe"). */
  verdict: RiskLevel;
  /** Early traction ranking, kept strictly separate from the risk verdict. */
  discovery: EarlyDiscoveryResult;
  /** Chain slug for filters: robinhood | base | solana. */
  chainKey: "robinhood" | "base" | "solana";
  /** Market columns come from a fresh Dexscreener call (true) or the stored report (false). */
  live: boolean;
  updatedAt: string;
  stale: boolean;
};

function discoveryFor(
  r: Pick<
    RadarRow,
    | "verdict"
    | "liquidityUsd"
    | "marketCapUsd"
    | "volume24hUsd"
    | "buys24h"
    | "sells24h"
    | "pairCreatedAt"
    | "socialMomentum"
    | "qualityAuthors"
    | "signalAgeMinutes"
    | "holderGrowth1h"
    | "holderGrowth24h"
    | "newWallets24h"
    | "change1h"
    | "change24h"
  >,
): EarlyDiscoveryResult {
  return earlyDiscovery({
    risk: r.verdict,
    liquidityUsd: r.liquidityUsd,
    marketCapUsd: r.marketCapUsd,
    volume24hUsd: r.volume24hUsd,
    buys24h: r.buys24h,
    sells24h: r.sells24h,
    pairCreatedAt: r.pairCreatedAt,
    socialMomentum: r.socialMomentum,
    qualityAuthors: r.qualityAuthors,
    signalAgeMinutes: r.signalAgeMinutes,
    holderGrowth1h: r.holderGrowth1h,
    holderGrowth24h: r.holderGrowth24h,
    newWallets24h: r.newWallets24h,
    change1h: r.change1h,
    change24h: r.change24h,
  });
}

/** Radar rows from the latest stored reports (scanned or watched tokens). */
export async function radarRows(limit = 100): Promise<RadarRow[]> {
  return safeDb(
    "radarRows",
    async () => {
      const tokens = await getDb().$queryRaw<
        Array<{
          report: Pick<TokenReport, "address" | "chainId" | "chainName" | "generatedAt"> & {
            token: Pick<TokenReport["token"], "symbol" | "name">;
            market: Omit<TokenReport["market"], "pairs">;
            liquidity: { mainPair: { value: { pairCreatedAt: string | null } | null } };
            distribution: {
              holderGrowth: TokenReport["distribution"]["holderGrowth"] | null;
              newWallets24h: TokenReport["distribution"]["newWallets24h"] | null;
            };
            scores: TokenReport["scores"];
          };
          qualityAuthors: number | null;
          latestThesis: string | null;
        }>
      >`
        SELECT jsonb_build_object(
          'address', address, 'chainId', "chainId",
          'chainName', "lastReport"->'chainName', 'generatedAt', "lastReport"->'generatedAt',
          'token', jsonb_build_object('symbol', "lastReport"->'token'->'symbol', 'name', "lastReport"->'token'->'name'),
          'market', ("lastReport"->'market') - 'pairs',
          'liquidity', jsonb_build_object('mainPair', jsonb_build_object('value', jsonb_build_object(
            'pairCreatedAt', "lastReport"->'liquidity'->'mainPair'->'value'->'pairCreatedAt'))),
          'distribution', jsonb_build_object(
            'holderGrowth', "lastReport"->'distribution'->'holderGrowth',
            'newWallets24h', "lastReport"->'distribution'->'newWallets24h'),
          'scores', (SELECT jsonb_object_agg(key, jsonb_build_object('value', value->'value', 'level', value->'level'))
            FROM jsonb_each("lastReport"->'scores'))
        ) AS report,
        CASE WHEN "lastReport"->'social'->>'available' = 'true' THEN
          (SELECT count(DISTINCT lower(a->>'handle'))::int FROM jsonb_array_elements(
            COALESCE(NULLIF("lastReport"->'social'->'authors'->'value', 'null'::jsonb), '[]'::jsonb)) a
            WHERE a->>'qualityTier' = 'high') ELSE NULL END AS "qualityAuthors",
        (SELECT max(t->>'createdAt') FROM jsonb_array_elements(
          COALESCE(NULLIF("lastReport"->'social'->'theses'->'value', 'null'::jsonb), '[]'::jsonb)) t) AS "latestThesis"
        FROM "Token"
        WHERE "lastScannedAt" IS NOT NULL AND jsonb_typeof("lastReport"->'scores') = 'object'
        ORDER BY "lastScannedAt" DESC LIMIT ${limit}
      `;
      const now = Date.now();
      return tokens.map(({ report: r, qualityAuthors, latestThesis }) => {
        const latest = latestThesis ? Date.parse(latestThesis) : null;
        const row = {
          address: r.address,
          symbol: r.token.symbol.value,
          name: r.token.name.value,
          chain: r.chainName,
          marketCapUsd: r.market.marketCapUsd.value,
          liquidityUsd: r.market.liquidityUsd.value,
          socialMomentum: r.scores.socialMomentum.value,
          contractSafety: r.scores.contractSafety.value,
          liquidityHealth: r.scores.liquidityHealth.value,
          distributionHealth: r.scores.distributionHealth.value,
          qualityAuthors,
          signalAgeMinutes: latest ? Math.round((now - latest) / 60_000) : null,
          holderGrowth1h: r.distribution.holderGrowth?.value?.h1 ?? null,
          holderGrowth24h: r.distribution.holderGrowth?.value?.h24 ?? null,
          newWallets24h: r.distribution.newWallets24h?.value ?? null,
          change5m: r.market.priceChange.value?.m5 ?? null,
          change1h: r.market.priceChange.value?.h1 ?? null,
          change6h: r.market.priceChange?.value?.h6 ?? null,
          change24h: r.market.priceChange?.value?.h24 ?? null,
          priceUsd: r.market.priceUsd?.value ?? null,
          volume24hUsd: r.market.volume?.value?.h24 ?? null,
          buys24h: r.market.txns?.value?.h24?.buys ?? null,
          sells24h: r.market.txns?.value?.h24?.sells ?? null,
          pairCreatedAt: r.liquidity?.mainPair?.value?.pairCreatedAt ?? null,
          verdict: verdictLevel([
            r.scores.contractSafety.level,
            r.scores.liquidityHealth.level,
            r.scores.distributionHealth.level,
          ] as RiskLevel[]),
          chainKey: chainSlug(r.chainId),
          live: false,
          updatedAt: r.generatedAt,
          stale: now - Date.parse(r.generatedAt) > 10 * 60_000,
        };
        return { ...row, discovery: discoveryFor(row) };
      });
    },
    [],
  );
}

/** Scanned tokens for sitemap.xml (address + last scan only; cheap query). */
export async function sitemapTokens(limit = 5000): Promise<Array<{ address: string; at: Date }>> {
  return safeDb(
    "sitemapTokens",
    async () =>
      (
        await getDb().token.findMany({
          where: { lastScannedAt: { not: null } },
          orderBy: { lastScannedAt: "desc" },
          take: limit,
          select: { address: true, lastScannedAt: true },
        })
      ).map((t) => ({ address: t.address, at: t.lastScannedAt! })),
    [],
  );
}

/**
 * Radar with live market columns: stored reports give the risk side, one batched Dexscreener
 * call per 30 tokens refreshes price, % changes, volume and liquidity. Cached 20 s for all viewers.
 */
export async function radarLive(limit = 150): Promise<RadarRow[]> {
  const load = async (): Promise<RadarRow[]> => {
    const rows = await radarRows(limit);
    const market = getProviders().market;
    const pairs = new Map<string, PairInfo>();
    for (const chain of ["robinhood", "base", "solana"] as const) {
      const tokens = rows.filter((r) => r.chainKey === chain).map((r) => r.address);
      if (!tokens.length) continue;
      const got = await market.getTokensPairs(chain, tokens).catch(() => [] as PairInfo[]);
      const same = (a: string, b: string) =>
        chain === "solana" ? a === b : a.toLowerCase() === b.toLowerCase();
      for (const t of tokens) {
        const own = got.filter((p) => same(p.baseToken.address, t));
        const main = own.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))[0];
        if (main) pairs.set(t, main);
      }
    }
    return rows.map((r) => {
      const p = pairs.get(r.address);
      if (!p) return { ...r, discovery: discoveryFor(r) };
      const live = {
        ...r,
        priceUsd: p.priceUsd,
        change5m: p.priceChange.m5,
        change1h: p.priceChange.h1,
        change6h: p.priceChange.h6,
        change24h: p.priceChange.h24,
        volume24hUsd: p.volume.h24,
        buys24h: p.txns.h24?.buys ?? null,
        sells24h: p.txns.h24?.sells ?? null,
        liquidityUsd: p.liquidityUsd ?? r.liquidityUsd,
        marketCapUsd: p.marketCapUsd ?? p.fdvUsd ?? r.marketCapUsd,
        pairCreatedAt: p.pairCreatedAt ?? r.pairCreatedAt,
        live: true,
      };
      return { ...live, discovery: discoveryFor(live) };
    });
  };
  return (await swr(`radar:live:v2:${limit}`, { freshSeconds: 20, keepSeconds: 600 }, load)).value;
}
