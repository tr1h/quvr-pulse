import type { RiskLevel, TokenReport } from "@quvr/shared";
import { clamp, interpolate } from "./builder";
import { verdictLevel } from "./verdict";

export type DiscoveryStatus = "candidate" | "watch" | "excluded" | "insufficient";
export type DiscoveryConfidence = "high" | "medium" | "low";

export type DiscoveryFactorId =
  | "liquidity"
  | "liquidityRatio"
  | "valuation"
  | "turnover"
  | "trades"
  | "flow"
  | "freshness"
  | "holders"
  | "social"
  | "priceAction";

export type DiscoveryFactor = {
  id: DiscoveryFactorId;
  points: number | null;
  max: number;
};

export type DiscoveryGateReason =
  "high-risk" | "risk-data-missing" | "elevated-risk" | "liquidity-missing" | "thin-liquidity";

export type EarlyDiscoveryResult = {
  /** Momentum/early-discovery ranking. It is deliberately not part of the risk verdict. */
  score: number | null;
  status: DiscoveryStatus;
  confidence: DiscoveryConfidence;
  coverage: number;
  factors: DiscoveryFactor[];
  gate: {
    passed: boolean;
    reasons: DiscoveryGateReason[];
  };
  /** Consumers must present this score as an observation, never a return forecast. */
  notPricePrediction: true;
};

export type EarlyDiscoveryInput = {
  risk: RiskLevel;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  buys24h: number | null;
  sells24h: number | null;
  pairCreatedAt: string | null;
  socialMomentum: number | null;
  qualityAuthors: number | null;
  signalAgeMinutes: number | null;
  holderGrowth1h: number | null;
  holderGrowth24h: number | null;
  newWallets24h: number | null;
  change1h: number | null;
  change24h: number | null;
  now?: Date;
};

const MIN_LIQUIDITY_USD = 5_000;
const MIN_COVERAGE = 0.7;

/**
 * Ranks observable early traction. This is not a return prediction.
 *
 * Risk is a gate, not an ingredient: market excitement can never compensate for a high-risk
 * contract, weak liquidity controls, concentrated distribution, or missing risk data.
 */
export function earlyDiscovery(i: EarlyDiscoveryInput): EarlyDiscoveryResult {
  const now = (i.now ?? new Date()).getTime();
  const trades = i.buys24h !== null && i.sells24h !== null ? i.buys24h + i.sells24h : null;
  const buyShare = trades && i.buys24h !== null ? i.buys24h / trades : null;
  const liquidityRatio =
    i.liquidityUsd !== null && i.marketCapUsd !== null && i.marketCapUsd > 0
      ? i.liquidityUsd / i.marketCapUsd
      : null;
  const turnover =
    i.volume24hUsd !== null && i.liquidityUsd !== null && i.liquidityUsd > 0
      ? i.volume24hUsd / i.liquidityUsd
      : null;
  const ageHours = i.pairCreatedAt
    ? Math.max(0, (now - Date.parse(i.pairCreatedAt)) / 3_600_000)
    : null;

  const socialPoints =
    i.socialMomentum === null && i.qualityAuthors === null && i.signalAgeMinutes === null
      ? null
      : clamp(
          (i.socialMomentum === null ? 0 : (clamp(i.socialMomentum) / 100) * 10) +
            (i.qualityAuthors === null
              ? 0
              : interpolate(i.qualityAuthors, [
                  [0, 0],
                  [1, 2],
                  [3, 4],
                  [5, 5],
                ])) +
            (i.signalAgeMinutes === null
              ? 0
              : interpolate(i.signalAgeMinutes, [
                  [0, 2],
                  [360, 2],
                  [1_440, 1],
                  [4_320, 0],
                ])),
          0,
          15,
        );
  const change = i.change1h ?? i.change24h;
  const holderGrowth = i.holderGrowth1h ?? i.holderGrowth24h;
  const holderPoints =
    holderGrowth === null && i.newWallets24h === null
      ? null
      : clamp(
          (holderGrowth === null
            ? 0
            : interpolate(holderGrowth, [
                [-0.1, 0],
                [0, 2],
                [0.05, 5],
                [0.2, 8],
                [0.5, 10],
                [2, 6],
              ])) +
            (i.newWallets24h === null
              ? 0
              : interpolate(i.newWallets24h, [
                  [0, 0],
                  [10, 1],
                  [100, 2],
                ])),
          0,
          10,
        );

  const factors: DiscoveryFactor[] = [
    {
      id: "liquidity",
      points:
        i.liquidityUsd === null
          ? null
          : interpolate(i.liquidityUsd, [
              [0, 0],
              [5_000, 2],
              [10_000, 5],
              [25_000, 10],
              [100_000, 15],
            ]),
      max: 15,
    },
    {
      id: "liquidityRatio",
      points:
        liquidityRatio === null
          ? null
          : interpolate(liquidityRatio, [
              [0.01, 0],
              [0.03, 2],
              [0.1, 5],
              [0.3, 4],
              [1, 2],
            ]),
      max: 5,
    },
    {
      id: "valuation",
      points:
        i.marketCapUsd === null
          ? null
          : interpolate(i.marketCapUsd, [
              [0, 2],
              [50_000, 4],
              [100_000, 5],
              [1_000_000, 4],
              [5_000_000, 1],
              [25_000_000, 0],
            ]),
      max: 5,
    },
    {
      id: "turnover",
      points:
        turnover === null
          ? null
          : interpolate(turnover, [
              [0, 0],
              [0.1, 3],
              [0.5, 9],
              [1, 13],
              [3, 15],
              [10, 10],
              [30, 2],
            ]),
      max: 15,
    },
    {
      id: "trades",
      points:
        trades === null
          ? null
          : interpolate(trades, [
              [0, 0],
              [20, 2],
              [100, 5],
              [500, 8],
              [2_000, 10],
            ]),
      max: 10,
    },
    {
      id: "flow",
      points:
        buyShare === null
          ? null
          : interpolate(buyShare, [
              [0.3, 0],
              [0.5, 5],
              [0.6, 9],
              [0.7, 10],
              [0.85, 5],
              [0.95, 0],
            ]),
      max: 10,
    },
    {
      id: "freshness",
      points:
        ageHours === null || !Number.isFinite(ageHours)
          ? null
          : interpolate(ageHours, [
              [0, 2],
              [1, 6],
              [6, 10],
              [24, 10],
              [168, 7],
              [720, 2],
              [2_160, 0],
            ]),
      max: 10,
    },
    { id: "holders", points: holderPoints, max: 10 },
    { id: "social", points: socialPoints, max: 15 },
    {
      id: "priceAction",
      points:
        change === null
          ? null
          : interpolate(change, [
              [-50, 0],
              [-10, 2],
              [0, 3.5],
              [20, 5],
              [75, 2.5],
              [150, 0],
            ]),
      max: 5,
    },
  ];

  const known = factors.filter((f) => f.points !== null);
  const knownMax = known.reduce((sum, f) => sum + f.max, 0);
  const totalMax = factors.reduce((sum, f) => sum + f.max, 0);
  const coverage = totalMax ? knownMax / totalMax : 0;
  const score =
    coverage >= MIN_COVERAGE && knownMax > 0
      ? Math.round((known.reduce((sum, f) => sum + f.points!, 0) / knownMax) * 100)
      : null;

  const reasons: DiscoveryGateReason[] = [];
  if (i.risk === "high") reasons.push("high-risk");
  else if (i.risk === "insufficient") reasons.push("risk-data-missing");
  else if (i.risk === "elevated") reasons.push("elevated-risk");
  if (i.liquidityUsd === null) reasons.push("liquidity-missing");
  else if (i.liquidityUsd < MIN_LIQUIDITY_USD) reasons.push("thin-liquidity");

  const hardFail = reasons.includes("high-risk") || reasons.includes("thin-liquidity");
  const unknownGate =
    reasons.includes("risk-data-missing") || reasons.includes("liquidity-missing");
  const passed = reasons.length === 0;
  const status: DiscoveryStatus = hardFail
    ? "excluded"
    : unknownGate || score === null
      ? "insufficient"
      : passed && score >= 70
        ? "candidate"
        : "watch";

  return {
    score,
    status,
    confidence: coverage >= 0.9 ? "high" : coverage >= MIN_COVERAGE ? "medium" : "low",
    coverage: Math.round(coverage * 100) / 100,
    factors: factors.map((f) => ({
      ...f,
      points: f.points === null ? null : Math.round(f.points * 10) / 10,
    })),
    gate: { passed, reasons },
    notPricePrediction: true,
  };
}

/** Snapshot the same discovery inputs directly from a report before future outcomes are known. */
export function earlyDiscoveryFromReport(r: TokenReport): EarlyDiscoveryResult {
  const authors = r.social.authors.value;
  const theses = r.social.theses.value;
  const latestThesis = theses?.length
    ? Math.max(...theses.map((thesis) => Date.parse(thesis.createdAt)))
    : null;
  const generatedAt = Date.parse(r.generatedAt);
  const levels = [
    r.scores.contractSafety.level,
    r.scores.liquidityHealth.level,
    r.scores.distributionHealth.level,
  ] as RiskLevel[];

  return earlyDiscovery({
    risk: verdictLevel(levels),
    liquidityUsd: r.market.liquidityUsd.value,
    marketCapUsd: r.market.marketCapUsd.value ?? r.market.fdvUsd.value,
    volume24hUsd: r.market.volume.value?.h24 ?? null,
    buys24h: r.market.txns.value?.h24?.buys ?? null,
    sells24h: r.market.txns.value?.h24?.sells ?? null,
    pairCreatedAt: r.liquidity.mainPair.value?.pairCreatedAt ?? null,
    socialMomentum: r.scores.socialMomentum.value,
    qualityAuthors: authors
      ? new Set(
          authors.filter((author) => author.qualityTier === "high").map((author) => author.handle),
        ).size
      : null,
    signalAgeMinutes:
      latestThesis === null || !Number.isFinite(generatedAt)
        ? null
        : Math.max(0, Math.round((generatedAt - latestThesis) / 60_000)),
    holderGrowth1h: r.distribution.holderGrowth.value?.h1 ?? null,
    holderGrowth24h: r.distribution.holderGrowth.value?.h24 ?? null,
    newWallets24h: r.distribution.newWallets24h.value,
    change1h: r.market.priceChange.value?.h1 ?? null,
    change24h: r.market.priceChange.value?.h24 ?? null,
    now: Number.isFinite(generatedAt) ? new Date(generatedAt) : undefined,
  });
}
