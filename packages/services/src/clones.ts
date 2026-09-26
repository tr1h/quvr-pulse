import { getDb } from "@quvr/db";
import { getProviders } from "@quvr/providers";
import {
  summarizeClones,
  verdictLevel,
  type CloneCandidate,
  type CloneSummary,
} from "@quvr/scoring";
import { chainSlug, type RiskLevel, type TokenReport } from "@quvr/shared";
import { swr } from "./cache";
import { safeDb } from "./persistence";

const LEVELS = new Set(["low", "elevated", "high", "insufficient"]);
const lvl = (v: string | null): RiskLevel =>
  v && LEVELS.has(v) ? (v as RiskLevel) : "insufficient";
const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

type DbRow = {
  address: string;
  symbol: string | null;
  name: string | null;
  cs: string | null;
  lh: string | null;
  dh: string | null;
  liq: string | null;
  mcap: string | null;
};

/** Candidates for one ticker on one chain: Dexscreener search + tokens we already checked. */
async function candidates(
  slug: "robinhood" | "base" | "solana",
  chainId: number,
  symbol: string,
  name: string | null,
): Promise<CloneCandidate[]> {
  const queries = [...new Set([symbol, name].filter((q): q is string => !!q && q.length >= 2))];
  const pairs = (
    await Promise.all(
      queries.map((q) =>
        getProviders()
          .market.searchPairs(slug, q)
          .catch(() => []),
      ),
    )
  ).flat();
  const fromSearch: CloneCandidate[] = pairs.map((p) => ({
    address: p.baseToken.address,
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    liquidityUsd: p.liquidityUsd,
    marketCapUsd: p.marketCapUsd ?? p.fdvUsd,
    pairCreatedAt: p.pairCreatedAt,
    level: null,
  }));
  const rows = await safeDb(
    "clones:db",
    () =>
      getDb().$queryRaw<DbRow[]>`
        SELECT t.address, t.symbol, t.name,
          t."lastReport"->'scores'->'contractSafety'->>'level' AS cs,
          t."lastReport"->'scores'->'liquidityHealth'->>'level' AS lh,
          t."lastReport"->'scores'->'distributionHealth'->>'level' AS dh,
          t."lastReport"->'market'->'liquidityUsd'->>'value' AS liq,
          t."lastReport"->'market'->'marketCapUsd'->>'value' AS mcap
        FROM "Token" t
        WHERE t."chainId" = ${chainId} AND t."lastReport" IS NOT NULL
          AND (lower(t.symbol) = lower(${symbol}) OR (${name}::text IS NOT NULL AND lower(t.name) = lower(${name})))
        LIMIT 100`,
    [] as DbRow[],
  );
  const fromDb: CloneCandidate[] = rows.map((r) => ({
    address: r.address,
    symbol: r.symbol,
    name: r.name,
    liquidityUsd: num(r.liq),
    marketCapUsd: num(r.mcap),
    pairCreatedAt: null,
    level: verdictLevel([lvl(r.cs), lvl(r.lh), lvl(r.dh)]),
  }));
  return [...fromSearch, ...fromDb];
}

/** Other tokens using this report's ticker; null when none (or no ticker). Cached 10 minutes. */
export async function tickerClones(report: TokenReport): Promise<CloneSummary | null> {
  const symbol = report.token.symbol.value;
  if (!symbol) return null;
  const solana = report.chainFamily === "solana";
  const slug = chainSlug(report.chainId);
  const name = report.token.name.value;
  const list = await swr(
    `clones:${slug}:${symbol.toLowerCase()}:${(name ?? "").toLowerCase()}`,
    { freshSeconds: 600, keepSeconds: 86_400 },
    () => candidates(slug, report.chainId, symbol, name),
  ).then((r) => r.value);
  const same = solana
    ? (a: string, b: string) => a === b
    : (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return summarizeClones(
    {
      address: report.address,
      symbol,
      name,
      liquidityUsd: report.market.liquidityUsd.value,
      marketCapUsd: report.market.marketCapUsd.value,
      pairCreatedAt: report.liquidity.mainPair.value?.pairCreatedAt ?? null,
      level: null,
    },
    list,
    same,
  );
}
