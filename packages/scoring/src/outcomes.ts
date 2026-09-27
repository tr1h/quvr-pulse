import {
  chainSlug,
  type RiskFinding,
  type RiskLevel,
  type Severity,
  type TokenReport,
} from "@quvr/shared";
import { rowFlags, type RugFlagId } from "./rug-report";
import { verdictLevel } from "./verdict";
import { earlyDiscoveryFromReport, type DiscoveryStatus } from "./early-discovery";

/**
 * Outcome tracking: what a token looked like when we first checked it (baseline) and what
 * happened 1h / 24h / 7d later. This is the data behind honest "survival odds" — base rates
 * of real outcomes for similar tokens, never a price prediction.
 */
export const OUTCOME_HORIZONS = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
} as const;
export type OutcomeHorizon = keyof typeof OUTCOME_HORIZONS;
export type OutcomeStatus = "alive" | "dead" | "no_market";

/** A token counts as dead after losing ≥ 90% of its price or ≥ 90% of its liquidity. */
export const DEATH_RATIO = 0.1;

export type BaselineFeatures = {
  chain: "robinhood" | "base" | "solana";
  levels: { contract: RiskLevel; liquidity: RiskLevel; distribution: RiskLevel };
  verdict: RiskLevel;
  flags: RugFlagId[];
  top10: number | null;
  deployerShare: number | null;
  liquidityToMcap: number | null;
  clusters: number | null;
  priceChange1h: number | null;
  /** Discovery snapshot captured before outcomes; used for forward-only validation. */
  discovery: {
    score: number | null;
    status: DiscoveryStatus;
    coverage: number;
    gateReasons: string[];
  };
};

export type Baseline = {
  chain: "robinhood" | "base" | "solana";
  priceUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  poolAgeHours: number | null;
  features: BaselineFeatures;
};

export function flagsFromFindings(
  findings: Array<Pick<RiskFinding, "code" | "severity">>,
): RugFlagId[] {
  return rowFlags({
    address: "",
    chain: "",
    symbol: null,
    name: null,
    levels: [],
    findings: findings.map((f) => ({ code: f.code, severity: f.severity as Severity })),
    marketCapUsd: null,
    liquidityUsd: null,
    volume24hUsd: null,
    top10: null,
  });
}

/** Risk features of a report, independent of whether it currently has a price. */
export function reportFeatures(r: TokenReport): BaselineFeatures {
  const chain = chainSlug(r.chainId);
  const levels = {
    contract: r.scores.contractSafety.level as RiskLevel,
    liquidity: r.scores.liquidityHealth.level as RiskLevel,
    distribution: r.scores.distributionHealth.level as RiskLevel,
  };
  const discovery = earlyDiscoveryFromReport(r);
  return {
    chain,
    levels,
    verdict: verdictLevel([levels.contract, levels.liquidity, levels.distribution]),
    flags: flagsFromFindings(r.findings),
    top10: r.distribution.concentration.value?.top10 ?? null,
    deployerShare: r.distribution.deployerShare.value,
    liquidityToMcap: r.liquidity.liquidityToMcap.value,
    clusters: r.distribution.clusters.value?.length ?? null,
    priceChange1h: r.market.priceChange.value?.h1 ?? null,
    discovery: {
      score: discovery.score,
      status: discovery.status,
      coverage: discovery.coverage,
      gateReasons: discovery.gate.reasons,
    },
  };
}

/** Baseline from a report; null when there is no price yet (nothing to compare against later). */
export function baselineFromReport(r: TokenReport): Baseline | null {
  const price = r.market.priceUsd.value;
  if (price === null || !(price > 0)) return null;
  const chain = chainSlug(r.chainId);
  const features = reportFeatures(r);
  return {
    chain,
    priceUsd: price,
    liquidityUsd: r.market.liquidityUsd.value,
    marketCapUsd: r.market.marketCapUsd.value ?? r.market.fdvUsd.value,
    poolAgeHours: r.liquidity.poolAgeHours.value,
    features,
  };
}

/** Horizons whose time has come and which are not recorded yet. */
export function dueHorizons(
  capturedAt: Date,
  recorded: OutcomeHorizon[],
  now: Date,
): OutcomeHorizon[] {
  return (Object.keys(OUTCOME_HORIZONS) as OutcomeHorizon[]).filter(
    (h) => !recorded.includes(h) && now.getTime() >= capturedAt.getTime() + OUTCOME_HORIZONS[h],
  );
}

export type Observation = { found: boolean; priceUsd: number | null; liquidityUsd: number | null };

export function classifyOutcome(
  base: Pick<Baseline, "priceUsd" | "liquidityUsd">,
  now: Observation,
): { status: OutcomeStatus; priceRatio: number | null; liquidityRatio: number | null } {
  const priceRatio =
    base.priceUsd && now.priceUsd !== null && base.priceUsd > 0
      ? now.priceUsd / base.priceUsd
      : null;
  const liquidityRatio =
    base.liquidityUsd && now.liquidityUsd !== null && base.liquidityUsd > 0
      ? now.liquidityUsd / base.liquidityUsd
      : null;
  if (!now.found) return { status: "no_market", priceRatio, liquidityRatio };
  const dead =
    (priceRatio !== null && priceRatio <= DEATH_RATIO) ||
    (liquidityRatio !== null && liquidityRatio <= DEATH_RATIO);
  return { status: dead ? "dead" : "alive", priceRatio, liquidityRatio };
}
