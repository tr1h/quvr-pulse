import type { PairInfo, RiskFinding, ScoreComponent, ScoreReason, ScoreResult } from "@quvr/shared";
import { buildScore, interpolate, t } from "./builder";

const Q96 = 2 ** 96;

/** x*y=k impact for selling `amountIn` of the input reserve, with LP fee. Only valid for v2-style pools. */
export function constantProductImpact(
  reserveIn: number,
  reserveOut: number,
  amountIn: number,
  feeFrac = 0.003,
): number | null {
  if (!(reserveIn > 0 && reserveOut > 0 && amountIn > 0)) return null;
  const inAfterFee = amountIn * (1 - feeFrac);
  const out = (reserveOut * inAfterFee) / (reserveIn + inAfterFee);
  const spot = reserveOut / reserveIn;
  return 1 - out / amountIn / spot;
}

/**
 * Concentrated-liquidity impact assuming the swap stays within the active tick range
 * (active liquidity L is constant). Ticks crossed and hook fees are NOT modeled, so the
 * result is labeled approximate. Amounts are raw integer units as floats.
 */
export function concentratedImpact(opts: {
  sqrtPriceX96: bigint;
  liquidity: bigint;
  amountInRaw: number;
  zeroForOne: boolean; // true = selling currency0
  feePpm?: number | null;
}): number | null {
  const L = Number(opts.liquidity);
  const sp = Number(opts.sqrtPriceX96) / Q96;
  const dx = opts.amountInRaw;
  if (!(L > 0 && sp > 0 && dx > 0)) return null;
  const fee = (opts.feePpm ?? 0) / 1e6;
  const inEff = dx * (1 - fee);
  let execVsSpot: number;
  if (opts.zeroForOne) {
    const spNew = (L * sp) / (L + inEff * sp);
    const out1 = L * (sp - spNew);
    execVsSpot = out1 / dx / (sp * sp);
  } else {
    const spNew = sp + inEff / L;
    const out0 = L * (1 / sp - 1 / spNew);
    execVsSpot = out0 / dx / (1 / (sp * sp));
  }
  if (!Number.isFinite(execVsSpot)) return null;
  return Math.min(1, Math.max(0, 1 - execVsSpot));
}

/** Price of `token` in the other currency, from sqrtPriceX96 (human units). */
export function priceFromSqrt(
  sqrtPriceX96: bigint,
  tokenIsCurrency0: boolean,
  dec0: number,
  dec1: number,
): number {
  const sp = Number(sqrtPriceX96) / Q96;
  const p1per0 = sp * sp * 10 ** (dec0 - dec1); // currency1 per currency0, human
  return tokenIsCurrency0 ? p1per0 : 1 / p1per0;
}

export type SwapLike = {
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  timestamp: number | null;
  blockNumber: number;
};

/**
 * Net native flow for a token/native pool. v4 Swap deltas are from the swapper's view:
 * negative = paid into the pool. A buy of the token pays native in.
 */
export function netNativeFlow(
  swaps: SwapLike[],
  nativeIsCurrency0: boolean,
  nativeDecimals = 18,
  sinceTs?: number,
) {
  let inflow = 0;
  let buys = 0;
  let sells = 0;
  for (const s of swaps) {
    if (sinceTs !== undefined && (s.timestamp ?? 0) < sinceTs) continue;
    const nativeDelta = nativeIsCurrency0 ? s.amount0 : s.amount1;
    const v = Number(nativeDelta) / 10 ** nativeDecimals;
    inflow += -v; // paid in (negative delta) → positive inflow
    if (nativeDelta < 0n) buys++;
    else if (nativeDelta > 0n) sells++;
  }
  return { netNative: inflow, buys, sells };
}

export function priceSeriesFromSwaps(
  swaps: SwapLike[],
  tokenIsCurrency0: boolean,
  dec0: number,
  dec1: number,
) {
  return swaps
    .filter((s) => s.timestamp !== null)
    .map((s) => ({
      t: s.timestamp! * 1000,
      priceNative: priceFromSqrt(s.sqrtPriceX96, tokenIsCurrency0, dec0, dec1),
    }))
    .filter((p) => Number.isFinite(p.priceNative) && p.priceNative > 0);
}

export function mainPoolShare(pairs: PairInfo[]): number | null {
  const total = pairs.reduce((s, p) => s + (p.liquidityUsd ?? 0), 0);
  if (!(total > 0)) return null;
  return Math.max(...pairs.map((p) => p.liquidityUsd ?? 0)) / total;
}

// ------------------------------------------------------------------ score

export type LiquidityInput = {
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  impacts: Array<{ usd: number; impactPct: number }> | null; // impactPct in 0..1
  impactsApproximate: boolean;
  poolAgeHours: number | null;
  priceChange24hPct: number | null; // percent, e.g. -13.7
  mainPoolShare: number | null;
  pairCount: number;
  liquidityTrendPct: number | null; // percent change over the observed window
  now?: Date;
};

export function liquidityHealthScore(i: LiquidityInput): ScoreResult {
  const reasons: ScoreReason[] = [];
  const components: ScoreComponent[] = [];
  const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

  // Liquidity / market cap (30)
  let ratioPts: number | null = null;
  if (i.liquidityUsd !== null && i.marketCapUsd && i.marketCapUsd > 0) {
    const r = i.liquidityUsd / i.marketCapUsd;
    ratioPts = interpolate(r, [
      [0, 0],
      [0.02, 5],
      [0.05, 15],
      [0.1, 22],
      [0.2, 30],
    ]);
    reasons.push({
      text: t(
        `Ликвидность/капитализация: ${(r * 100).toFixed(1)}%`,
        `Liquidity/market cap: ${(r * 100).toFixed(1)}%`,
      ),
      impact: r < 0.05 ? "negative" : r >= 0.1 ? "positive" : "neutral",
    });
  }
  components.push({
    id: "ratio",
    label: t("Ликвидность / капитализация", "Liquidity / market cap"),
    points: ratioPts,
    max: 30,
  });

  // Depth / price impact (30)
  let depthPts: number | null = null;
  const at1k = i.impacts?.find((x) => x.usd === 1000);
  if (at1k) {
    depthPts = interpolate(at1k.impactPct, [
      [0.01, 30],
      [0.02, 25],
      [0.05, 18],
      [0.1, 10],
      [0.2, 5],
      [0.4, 0],
    ]);
    reasons.push({
      text: t(
        `Продажа на $1 000 сдвинет цену ~${(at1k.impactPct * 100).toFixed(1)}%${i.impactsApproximate ? " (оценка)" : ""}`,
        `A $1,000 sell moves price ~${(at1k.impactPct * 100).toFixed(1)}%${i.impactsApproximate ? " (estimate)" : ""}`,
      ),
      impact: at1k.impactPct > 0.05 ? "negative" : "positive",
    });
  } else if (i.liquidityUsd !== null) {
    depthPts = interpolate(i.liquidityUsd, [
      [0, 0],
      [5_000, 6],
      [20_000, 12],
      [50_000, 18],
      [100_000, 24],
      [250_000, 30],
    ]);
    reasons.push({
      text: t(`Ликвидность ${usd(i.liquidityUsd)}`, `Liquidity ${usd(i.liquidityUsd)}`),
      impact: i.liquidityUsd < 20_000 ? "negative" : "neutral",
    });
  }
  components.push({
    id: "depth",
    label: t("Глубина и price impact", "Depth & price impact"),
    points: depthPts,
    max: 30,
  });

  // Age & stability (15)
  let agePts: number | null = null;
  if (i.poolAgeHours !== null) {
    const age = interpolate(i.poolAgeHours, [
      [0, 0],
      [6, 3],
      [24, 5],
      [168, 8],
      [720, 10],
    ]);
    const ch = i.priceChange24hPct === null ? null : Math.abs(i.priceChange24hPct);
    const stab = ch === null ? 2 : ch < 20 ? 5 : ch < 50 ? 3 : 0;
    agePts = age + stab;
    if (i.poolAgeHours < 24)
      reasons.push({
        text: t("Пулу меньше суток", "Pool is less than a day old"),
        impact: "negative",
      });
  }
  components.push({
    id: "age",
    label: t("Возраст и стабильность", "Age & stability"),
    points: agePts,
    max: 15,
  });

  // Pool distribution (10)
  let distPts: number | null = null;
  if (i.mainPoolShare !== null)
    distPts = i.pairCount <= 1 ? 6 : i.mainPoolShare <= 0.7 ? 10 : i.mainPoolShare <= 0.9 ? 8 : 6;
  components.push({
    id: "pools",
    label: t("Распределение по пулам", "Distribution across pools"),
    points: distPts,
    max: 10,
  });

  // Liquidity trend (15) — requires our own snapshot history.
  let trendPts: number | null = null;
  if (i.liquidityTrendPct !== null) {
    trendPts = interpolate(i.liquidityTrendPct, [
      [-40, 0],
      [-25, 5],
      [-10, 10],
      [-2, 15],
    ]);
    if (i.liquidityTrendPct < -10) {
      reasons.push({
        text: t(
          `Ликвидность снизилась на ${Math.abs(i.liquidityTrendPct).toFixed(1)}%`,
          `Liquidity fell ${Math.abs(i.liquidityTrendPct).toFixed(1)}%`,
        ),
        impact: "negative",
      });
    }
  }
  components.push({
    id: "trend",
    label: t("Динамика ликвидности", "Liquidity trend"),
    points: trendPts,
    max: 15,
    note: trendPts === null ? t("Нужна история снимков", "Needs snapshot history") : undefined,
  });

  return buildScore({
    key: "liquidityHealth",
    components,
    reasons,
    inputConfidence: i.impactsApproximate ? "medium" : undefined,
    now: i.now,
  });
}

export function liquidityFindings(i: LiquidityInput, source: string): RiskFinding[] {
  const out: RiskFinding[] = [];
  if (i.liquidityUsd !== null && i.liquidityUsd < 10_000) {
    out.push({
      code: "liquidity.low",
      category: "liquidity",
      severity: i.liquidityUsd < 2_000 ? "high" : "medium",
      title: t("Низкая ликвидность", "Low liquidity"),
      explanation: t(
        "Даже небольшие сделки заметно двигают цену, выйти из позиции может быть сложно.",
        "Even small trades move the price noticeably; exiting a position may be hard.",
      ),
      evidence: [`liquidity ≈ $${Math.round(i.liquidityUsd)}`],
      source,
      confidence: "high",
    });
  }
  const at1k = i.impacts?.find((x) => x.usd === 1000);
  if (at1k && at1k.impactPct > 0.1) {
    out.push({
      code: "liquidity.impact",
      category: "liquidity",
      severity: at1k.impactPct > 0.25 ? "high" : "medium",
      title: t("Сильное проскальзывание", "Heavy slippage"),
      explanation: t(
        `Продажа на $1 000 сдвинет цену примерно на ${(at1k.impactPct * 100).toFixed(1)}% (приблизительная оценка).`,
        `A $1,000 sell would move the price by about ${(at1k.impactPct * 100).toFixed(1)}% (approximate).`,
      ),
      evidence: i.impacts!.map((x) => `$${x.usd}: ${(x.impactPct * 100).toFixed(2)}%`),
      source,
      confidence: "medium",
    });
  }
  if (i.liquidityTrendPct !== null && i.liquidityTrendPct < -20) {
    out.push({
      code: "liquidity.declining",
      category: "liquidity",
      severity: i.liquidityTrendPct < -50 ? "high" : "medium",
      title: t("Ликвидность уменьшается", "Liquidity is decreasing"),
      explanation: t(
        `За период наблюдения ликвидность снизилась на ${Math.abs(i.liquidityTrendPct).toFixed(1)}%.`,
        `Liquidity dropped ${Math.abs(i.liquidityTrendPct).toFixed(1)}% over the observed window.`,
      ),
      evidence: [`trend ${i.liquidityTrendPct.toFixed(1)}%`],
      source: "quvr snapshots",
      confidence: "medium",
    });
  }
  if (i.poolAgeHours !== null && i.poolAgeHours < 6) {
    out.push({
      code: "liquidity.new-pool",
      category: "liquidity",
      severity: "low",
      title: t("Очень новый пул", "Very new pool"),
      explanation: t(
        "Пулу меньше 6 часов: история торгов мала, риски выше.",
        "The pool is under 6 hours old: little trading history, higher risk.",
      ),
      evidence: [`age ${i.poolAgeHours.toFixed(1)}h`],
      source,
      confidence: "high",
    });
  }
  return out;
}
