import type {
  AuthorStats,
  Confidence,
  ScoreComponent,
  ScoreReason,
  ScoreResult,
} from "@quvr/shared";
import { buildScore, clamp, interpolate, t } from "./builder";

/** Wilson score interval lower bound for a binomial proportion (default 95%). */
export function wilsonLowerBound(successes: number, n: number, z = 1.96): number | null {
  if (n <= 0) return null;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, (centre - margin) / denom);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Max peak-to-trough decline of cumulative realized PnL (USD, positive number). */
export function maxDrawdown(pnlSeries: number[]): number {
  let peak = 0;
  let cum = 0;
  let mdd = 0;
  for (const p of pnlSeries) {
    cum += p;
    peak = Math.max(peak, cum);
    mdd = Math.max(mdd, peak - cum);
  }
  return mdd;
}

export type ClosedTrade = {
  sizeUsd: number | null;
  realizedPnlUsd: number | null;
  openedAt: string | null;
  closedAt: string | null;
};

export type AuthorQualityInput = {
  handle: string;
  displayName: string | null;
  verified: boolean | null;
  evmWallet: string | null;
  trades: ClosedTrade[];
  now?: Date;
};

/**
 * Author quality. Deliberately NOT ranked by total profit: a single lucky trade must not
 * produce a high rating. Small samples are capped and flagged as insufficient.
 */
export function authorQuality(i: AuthorQualityInput): AuthorStats {
  const now = (i.now ?? new Date()).getTime();
  const closed = i.trades.filter((tr) => tr.realizedPnlUsd !== null && tr.closedAt);
  const n = closed.length;
  const pnls = closed
    .slice()
    .sort((a, b) => Date.parse(a.closedAt!) - Date.parse(b.closedAt!))
    .map((tr) => tr.realizedPnlUsd!);
  const wins = pnls.filter((p) => p > 0).length;
  const rois = closed
    .filter((tr) => tr.sizeUsd && tr.sizeUsd > 0)
    .map((tr) => tr.realizedPnlUsd! / tr.sizeUsd!);
  const holds = closed
    .filter((tr) => tr.openedAt)
    .map((tr) => (Date.parse(tr.closedAt!) - Date.parse(tr.openedAt!)) / 1000)
    .filter((s) => Number.isFinite(s) && s >= 0);
  const positive = pnls.filter((p) => p > 0);
  const posSum = positive.reduce((s, p) => s + p, 0);
  const bestShare = posSum > 0 ? Math.max(...positive) / posSum : null;
  const total = pnls.reduce((s, p) => s + p, 0);
  const mdd = n ? maxDrawdown(pnls) : null;
  const absSum = pnls.reduce((s, p) => s + Math.abs(p), 0);
  const lastTs = closed.length ? Math.max(...closed.map((tr) => Date.parse(tr.closedAt!))) : null;

  const winRate = n ? wins / n : null;
  const wilson = wilsonLowerBound(wins, n);
  const medRoi = median(rois);

  let score: number | null = null;
  if (n > 0) {
    const pts =
      35 * (wilson ?? 0) +
      (medRoi === null
        ? 0
        : interpolate(medRoi, [
            [-0.5, 0],
            [0, 8],
            [0.25, 14],
            [1, 20],
          ])) +
      15 * Math.min(1, n / 30) +
      10 * (bestShare === null ? 0 : 1 - bestShare) +
      10 * (absSum > 0 && mdd !== null ? 1 - Math.min(1, mdd / absSum) : 0) +
      (lastTs === null
        ? 0
        : interpolate((now - lastTs) / 86_400_000, [
            [7, 10],
            [30, 6],
            [90, 2],
          ]));
    score = clamp(Math.round(pts));
    if (n < 5) score = Math.min(score, 35);
    else if (n < 10) score = Math.min(score, 60);
  }
  const conf: Confidence = n >= 30 ? "high" : n >= 10 ? "medium" : "low";
  const tier: AuthorStats["qualityTier"] =
    n < 5 || score === null
      ? "insufficient"
      : score >= 65
        ? "high"
        : score >= 45
          ? "medium"
          : "low";

  return {
    handle: i.handle,
    displayName: i.displayName,
    verified: i.verified,
    evmWallet: i.evmWallet,
    sampleSize: i.trades.length,
    closedTrades: n,
    realizedPnlUsd: n ? total : null,
    medianRoi: medRoi,
    winRate,
    winRateWilsonLower: wilson,
    maxDrawdownUsd: mdd,
    bestTradeShare: bestShare,
    avgHoldSeconds: holds.length ? holds.reduce((s, h) => s + h, 0) / holds.length : null,
    lastTradeAt: lastTs ? new Date(lastTs).toISOString() : null,
    qualityScore: score,
    qualityConfidence: conf,
    qualityTier: tier,
  };
}

export const HORIZONS = {
  "15m": 15 * 60_000,
  "1h": 3_600_000,
  "6h": 6 * 3_600_000,
  "24h": 24 * 3_600_000,
} as const;
export type Horizon = keyof typeof HORIZONS;

/** Last observed price at or before time `ts` (series sorted ascending by t). */
export function priceAt(series: Array<{ t: number; price: number }>, ts: number): number | null {
  let lo = 0;
  let hi = series.length - 1;
  let ans: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid]!.t <= ts) {
      ans = series[mid]!.price;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * Thesis outcome per horizon without look-ahead bias: the entry price is the last price
 * observed at or before publication, and each horizon uses only data up to publish+h.
 * Horizons that have not elapsed yet are "pending", not guessed.
 */
export function thesisOutcomes(
  publishedAtMs: number,
  series: Array<{ t: number; price: number }>,
  nowMs: number,
  storedEntryPrice?: number | null,
): { entry: number | null; outcomes: Record<Horizon, number | null | "pending"> } {
  const entry = storedEntryPrice ?? priceAt(series, publishedAtMs);
  const outcomes = {} as Record<Horizon, number | null | "pending">;
  for (const [h, ms] of Object.entries(HORIZONS) as Array<[Horizon, number]>) {
    const at = publishedAtMs + ms;
    if (nowMs < at) outcomes[h] = "pending";
    else {
      const p = priceAt(series, at);
      // Rounded to 1e-6 so float noise (e.g. -1.1e-16) does not show as a tiny loss.
      outcomes[h] = entry && p ? Math.round((p / entry - 1) * 1e6) / 1e6 : null;
    }
  }
  return { entry, outcomes };
}

// ------------------------------------------------------------------ Social Momentum

export type SocialThesisSignal = {
  authorHandle: string;
  createdAt: string;
  authorTier: AuthorStats["qualityTier"];
  authorQuality: number | null;
  confirmedBuy: boolean | null;
  authorStillHolds: boolean | null;
  authorSold: boolean | null;
  authorWallet: string | null;
};

export type SocialMomentumInput = {
  available: boolean;
  theses: SocialThesisSignal[];
  deployerSelling: boolean;
  liquidityDeclining: boolean;
  washTradingSuspected: boolean;
  /** Share of thesis authors whose wallets are in possibly-related clusters. */
  relatedAuthorShare: number | null;
  now?: Date;
};

export function socialMomentumScore(i: SocialMomentumInput): ScoreResult {
  const now = (i.now ?? new Date()).getTime();
  if (!i.available) {
    return buildScore({
      key: "socialMomentum",
      components: [
        { id: "social", label: t("Социальные данные", "Social data"), points: null, max: 100 },
      ],
      reasons: [
        {
          text: t(
            "Социальные данные недоступны (режим onchain-only)",
            "Social data unavailable (onchain-only mode)",
          ),
          impact: "neutral",
        },
      ],
      now: i.now,
    });
  }
  const reasons: ScoreReason[] = [];
  const components: ScoreComponent[] = [];
  const recent = i.theses.filter((th) => now - Date.parse(th.createdAt) <= 24 * 3_600_000);
  const authors = new Map<string, SocialThesisSignal[]>();
  for (const th of i.theses)
    authors.set(th.authorHandle, [...(authors.get(th.authorHandle) ?? []), th]);

  // Velocity (20)
  components.push({
    id: "velocity",
    label: t("Скорость новых тезисов", "New thesis velocity"),
    points: interpolate(recent.length, [
      [0, 0],
      [1, 4],
      [2, 8],
      [5, 14],
      [10, 20],
    ]),
    max: 20,
  });
  reasons.push({
    text: t(`Тезисов за 24ч: ${recent.length}`, `Theses in 24h: ${recent.length}`),
    impact: recent.length >= 5 ? "positive" : "neutral",
  });

  // Unique authors (15)
  components.push({
    id: "authors",
    label: t("Уникальные авторы", "Unique authors"),
    points: interpolate(authors.size, [
      [0, 0],
      [1, 3],
      [3, 7],
      [5, 11],
      [8, 15],
    ]),
    max: 15,
  });

  // Author quality (25)
  const rated = [...authors.values()]
    .map((l) => l[0]!)
    .filter((a) => a.authorQuality !== null && a.authorTier !== "insufficient");
  const qPts = rated.length
    ? (25 * rated.reduce((s, a) => s + a.authorQuality!, 0)) / rated.length / 100
    : null;
  components.push({
    id: "quality",
    label: t("Качество авторов", "Author quality"),
    points: qPts,
    max: 25,
  });
  const good = rated.filter((a) => a.authorTier === "high").length;
  if (good > 0)
    reasons.push({
      text: t(`Качественных авторов: ${good}`, `Quality authors: ${good}`),
      impact: "positive",
    });

  // Confirmed by real buys (20)
  const confirmKnown = i.theses.filter((th) => th.confirmedBuy !== null);
  const confirmPts = confirmKnown.length
    ? (20 * confirmKnown.filter((th) => th.confirmedBuy).length) / confirmKnown.length
    : null;
  components.push({
    id: "confirmed",
    label: t("Подтверждение покупками", "Confirmed by buys"),
    points: confirmPts,
    max: 20,
  });

  // Retention (10)
  const holdKnown = [...authors.values()]
    .map((l) => l[0]!)
    .filter((a) => a.authorStillHolds !== null);
  const holdPts = holdKnown.length
    ? (10 * holdKnown.filter((a) => a.authorStillHolds).length) / holdKnown.length
    : null;
  components.push({
    id: "retention",
    label: t("Удержание позиции авторами", "Authors still holding"),
    points: holdPts,
    max: 10,
  });

  // Freshness (10)
  const latest = i.theses.length
    ? Math.max(...i.theses.map((th) => Date.parse(th.createdAt)))
    : null;
  const ageH = latest === null ? null : (now - latest) / 3_600_000;
  components.push({
    id: "freshness",
    label: t("Свежесть сигнала", "Signal freshness"),
    points: ageH === null ? 0 : ageH < 1 ? 10 : ageH < 6 ? 7 : ageH < 24 ? 4 : 1,
    max: 10,
  });

  // Penalties
  const penalties: Array<{ label: ReturnType<typeof t>; points: number }> = [];
  const soldShare = holdKnown.length
    ? [...authors.values()].map((l) => l[0]!).filter((a) => a.authorSold).length /
      Math.max(1, authors.size)
    : 0;
  if (soldShare > 0) {
    penalties.push({
      label: t("Авторы уже продали", "Authors already sold"),
      points: Math.round(15 * soldShare),
    });
    reasons.push({
      text: t(
        `Продали авторы: ${(soldShare * 100).toFixed(0)}%`,
        `Authors sold: ${(soldShare * 100).toFixed(0)}%`,
      ),
      impact: "negative",
    });
  }
  if (i.deployerSelling) {
    penalties.push({ label: t("Разработчик продаёт", "Developer is selling"), points: 15 });
    reasons.push({ text: t("Разработчик продаёт", "Developer is selling"), impact: "negative" });
  }
  if (i.liquidityDeclining)
    penalties.push({ label: t("Ликвидность снижается", "Liquidity declining"), points: 10 });
  if (i.washTradingSuspected)
    penalties.push({
      label: t("Подозрение на wash trading", "Suspected wash trading"),
      points: 10,
    });
  if (i.relatedAuthorShare !== null && i.relatedAuthorShare > 0.5) {
    penalties.push({
      label: t("Сигналы от связанных кошельков", "Signals from related wallets"),
      points: 10,
    });
  }
  if (i.theses.length >= 3) {
    const topCount = Math.max(...[...authors.values()].map((l) => l.length));
    if (topCount / i.theses.length > 0.6) {
      penalties.push({
        label: t("Один автор создаёт основной хайп", "One author drives most hype"),
        points: 10,
      });
      reasons.push({
        text: t("Основной хайп от одного автора", "Most hype from a single author"),
        impact: "negative",
      });
    }
  }

  return buildScore({ key: "socialMomentum", components, reasons, penalties, now: i.now });
}
