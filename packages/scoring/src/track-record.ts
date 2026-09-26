import type { RiskLevel } from "@quvr/shared";
import type { OutcomeHorizon, OutcomeStatus } from "./outcomes";

/**
 * Track record: what happened to tokens after we labelled them. "Gone" = the token lost ≥ 90% of
 * price or liquidity (dead) or no market is left at all (pool removed / delisted).
 */

export const TRACK_LEVELS: RiskLevel[] = ["high", "elevated", "low", "insufficient"];
export const TRACK_HORIZONS: OutcomeHorizon[] = ["1h", "24h", "7d"];
/** Below this many observations a rate is not shown (too noisy to mean anything). */
export const TRACK_MIN_SAMPLE = 20;

export type TrackCountRow = {
  horizon: string;
  verdict: string;
  /** Baseline reconstructed later from stored snapshots (verdict may postdate the outcome). */
  backfilled: boolean;
  status: string;
  n: number;
};

export type TrackCell = {
  n: number;
  dead: number;
  noMarket: number;
  /** (dead + no market) / n; null below TRACK_MIN_SAMPLE. */
  goneRate: number | null;
};

export type TrackTable = Record<RiskLevel, Record<OutcomeHorizon, TrackCell>>;

export type TrackRecord = {
  /** Verdict recorded before the outcome was known: the honest forecast test. */
  live: TrackTable;
  /** Includes baselines reconstructed afterwards (shown separately, with a caveat). */
  all: TrackTable;
  /**
   * Live 24h gone-rate of high-risk tokens vs a calmer group: low risk when it has enough data
   * (low-risk memecoins are rare), otherwise elevated. null until both sides have enough data.
   */
  headline: {
    high: number;
    nHigh: number;
    other: number;
    nOther: number;
    otherLevel: "low" | "elevated";
  } | null;
};

function emptyTable(): TrackTable {
  const t = {} as TrackTable;
  for (const l of TRACK_LEVELS) {
    t[l] = {} as Record<OutcomeHorizon, TrackCell>;
    for (const h of TRACK_HORIZONS) t[l][h] = { n: 0, dead: 0, noMarket: 0, goneRate: null };
  }
  return t;
}

function finish(t: TrackTable, min: number) {
  for (const l of TRACK_LEVELS)
    for (const h of TRACK_HORIZONS) {
      const c = t[l][h];
      c.goneRate = c.n >= min ? (c.dead + c.noMarket) / c.n : null;
    }
}

export function summarizeTrackRecord(
  rows: TrackCountRow[],
  min: number = TRACK_MIN_SAMPLE,
): TrackRecord {
  const live = emptyTable();
  const all = emptyTable();
  for (const r of rows) {
    const level = (TRACK_LEVELS as string[]).includes(r.verdict)
      ? (r.verdict as RiskLevel)
      : "insufficient";
    if (!(TRACK_HORIZONS as string[]).includes(r.horizon)) continue;
    const h = r.horizon as OutcomeHorizon;
    const status = r.status as OutcomeStatus;
    for (const t of r.backfilled ? [all] : [live, all]) {
      const c = t[level][h];
      c.n += r.n;
      if (status === "dead") c.dead += r.n;
      else if (status === "no_market") c.noMarket += r.n;
    }
  }
  finish(live, min);
  finish(all, min);
  const hi = live.high["24h"];
  const otherLevel: "low" | "elevated" = live.low["24h"].goneRate !== null ? "low" : "elevated";
  const lo = live[otherLevel]["24h"];
  const headline =
    hi.goneRate !== null && lo.goneRate !== null
      ? { high: hi.goneRate, nHigh: hi.n, other: lo.goneRate, nOther: lo.n, otherLevel }
      : null;
  return { live, all, headline };
}
