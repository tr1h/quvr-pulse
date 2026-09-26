import type {
  Confidence,
  LocalizedText,
  MomentumLevel,
  RiskLevel,
  ScoreComponent,
  ScoreKey,
  ScoreReason,
  ScoreResult,
} from "@quvr/shared";

export const t = (ru: string, en: string): LocalizedText => ({ ru, en });

export const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

/** Piecewise-linear interpolation over sorted [x, y] points (x ascending). */
export function interpolate(x: number, points: Array<[number, number]>): number {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

export function riskLevel(value: number | null, coverage: number): RiskLevel {
  if (value === null || coverage < 0.5) return "insufficient";
  if (value >= 75) return "low";
  if (value >= 50) return "elevated";
  return "high";
}

export function momentumLevel(value: number | null, coverage: number): MomentumLevel {
  if (value === null || coverage < 0.5) return "insufficient";
  if (value >= 70) return "strong";
  if (value >= 40) return "moderate";
  return "weak";
}

type BuildArgs = {
  key: ScoreKey;
  components: ScoreComponent[];
  penalties?: Array<{ label: LocalizedText; points: number }>;
  reasons: ScoreReason[];
  /** Minimum coverage required to publish a number at all. */
  minCoverage?: number;
  /** Confidence cap from input quality (e.g. heuristic-only data). */
  inputConfidence?: Confidence;
  cap?: number | null;
  now?: Date;
};

/**
 * Total = evaluated points rescaled to 0..100, minus penalties, clamped.
 * Components that could not be evaluated (points === null) are excluded and reduce
 * coverage → confidence; below minCoverage the score is "insufficient data" (null).
 */
export function buildScore(args: BuildArgs): ScoreResult {
  const maxTotal = args.components.reduce((s, c) => s + c.max, 0);
  const evaluated = args.components.filter((c) => c.points !== null);
  const evalMax = evaluated.reduce((s, c) => s + c.max, 0);
  const coverage = maxTotal > 0 ? evalMax / maxTotal : 0;
  const penalties = (args.penalties ?? []).filter((p) => p.points > 0);

  let value: number | null = null;
  if (evalMax > 0 && coverage >= (args.minCoverage ?? 0.5)) {
    const raw = (evaluated.reduce((s, c) => s + (c.points ?? 0), 0) / evalMax) * 100;
    value = clamp(Math.round(raw - penalties.reduce((s, p) => s + p.points, 0)));
    if (args.cap !== undefined && args.cap !== null) value = Math.min(value, args.cap);
  }

  let confidence: Confidence = coverage >= 0.9 ? "high" : coverage >= 0.65 ? "medium" : "low";
  if (args.inputConfidence === "low") confidence = "low";
  else if (args.inputConfidence === "medium" && confidence === "high") confidence = "medium";

  const level =
    args.key === "socialMomentum" ? momentumLevel(value, coverage) : riskLevel(value, coverage);

  // Most informative reasons first: negatives, then positives; 3–5 items.
  const sorted = [...args.reasons].sort((a, b) => rank(a) - rank(b));
  return {
    key: args.key,
    value,
    confidence,
    level,
    reasons: sorted.slice(0, 5),
    components: args.components,
    penalties,
    coverage: Math.round(coverage * 100) / 100,
    updatedAt: (args.now ?? new Date()).toISOString(),
  };
}

const rank = (r: ScoreReason) => (r.impact === "negative" ? 0 : r.impact === "positive" ? 1 : 2);
