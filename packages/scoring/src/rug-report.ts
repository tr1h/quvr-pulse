import type { RiskLevel, Severity } from "@quvr/shared";
import { verdictLevel } from "./verdict";

/**
 * Weekly "Rug Report": aggregate statistics over the tokens QUVR Pulse checked in a window.
 * Only counts what the reports actually found; a token without data is "insufficient", never low.
 */
export type RugRow = {
  address: string;
  chain: string;
  symbol: string | null;
  name: string | null;
  levels: RiskLevel[];
  findings: Array<{ code: string; severity: Severity }>;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  top10: number | null;
};

export type RugFlagId =
  | "contract-control"
  | "concentrated"
  | "deployer-share"
  | "deployer-selling"
  | "clusters"
  | "thin-liquidity"
  | "price-impact"
  | "mass-transfers";

/** Finding codes that make up each flag. Only medium+ severity counts, so info notes don't. */
const FLAG_RULES: Array<{ id: RugFlagId; match: (code: string) => boolean }> = [
  {
    id: "contract-control",
    match: (c) =>
      /^contract\.(mint|pause|blacklist|whitelist|fee-change|balance-modify|transfer-restriction|max-wallet-tx|trading-toggle|upgrade|selfdestruct|proxy|sell-simulation-failed)/.test(
        c,
      ) ||
      /^solana\.(mint-authority|freeze-authority|permanent-delegate|transfer-hook|transfer-fee|pausable|default-frozen|fee-authority)$/.test(
        c,
      ),
  },
  { id: "concentrated", match: (c) => c === "distribution.concentrated" },
  { id: "deployer-share", match: (c) => c === "distribution.deployer-share" },
  { id: "deployer-selling", match: (c) => c === "distribution.deployer-selling" },
  { id: "clusters", match: (c) => c.startsWith("distribution.cluster.") },
  { id: "thin-liquidity", match: (c) => c === "liquidity.low" },
  { id: "price-impact", match: (c) => c === "liquidity.impact" },
  { id: "mass-transfers", match: (c) => c === "distribution.mass-transfers" },
];

const COUNTED: ReadonlySet<Severity> = new Set(["medium", "high", "critical"]);

export function rowFlags(row: RugRow): RugFlagId[] {
  const out = new Set<RugFlagId>();
  for (const f of row.findings) {
    if (!COUNTED.has(f.severity)) continue;
    for (const r of FLAG_RULES) if (r.match(f.code)) out.add(r.id);
  }
  return [...out];
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export type RugReportSummary = {
  total: number;
  byChain: Record<string, number>;
  verdicts: Record<RiskLevel, number>;
  flags: Array<{ id: RugFlagId; count: number; share: number }>;
  medianTop10: number | null;
  medianLiquidityToMcap: number | null;
  topTraded: Array<{
    address: string;
    chain: string;
    symbol: string | null;
    name: string | null;
    volume24hUsd: number;
    marketCapUsd: number | null;
    level: RiskLevel;
    flags: RugFlagId[];
  }>;
};

export function summarizeRugReport(rows: RugRow[], topN = 10): RugReportSummary {
  const verdicts: Record<RiskLevel, number> = { low: 0, elevated: 0, high: 0, insufficient: 0 };
  const byChain: Record<string, number> = {};
  const flagCounts = new Map<RugFlagId, number>();
  const top10s: number[] = [];
  const liqRatios: number[] = [];
  const enriched = rows.map((r) => {
    const level = verdictLevel(r.levels);
    const flags = rowFlags(r);
    verdicts[level]++;
    byChain[r.chain] = (byChain[r.chain] ?? 0) + 1;
    for (const f of flags) flagCounts.set(f, (flagCounts.get(f) ?? 0) + 1);
    if (r.top10 !== null && Number.isFinite(r.top10)) top10s.push(r.top10);
    if (r.liquidityUsd !== null && r.marketCapUsd && r.marketCapUsd > 0)
      liqRatios.push(r.liquidityUsd / r.marketCapUsd);
    return { ...r, level, flags };
  });
  const total = rows.length;
  return {
    total,
    byChain,
    verdicts,
    flags: FLAG_RULES.map((r) => {
      const count = flagCounts.get(r.id) ?? 0;
      return { id: r.id, count, share: total ? count / total : 0 };
    }).sort((a, b) => b.count - a.count),
    medianTop10: median(top10s),
    medianLiquidityToMcap: median(liqRatios),
    topTraded: enriched
      .filter((r) => r.volume24hUsd !== null && r.volume24hUsd > 0)
      .sort((a, b) => b.volume24hUsd! - a.volume24hUsd!)
      .slice(0, topN)
      .map((r) => ({
        address: r.address,
        chain: r.chain,
        symbol: r.symbol,
        name: r.name,
        volume24hUsd: r.volume24hUsd!,
        marketCapUsd: r.marketCapUsd,
        level: r.level,
        flags: r.flags,
      })),
  };
}
