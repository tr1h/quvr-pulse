/**
 * Chart drawing model for ProChart: pure geometry, no DOM. Points are stored as (unix seconds,
 * price) so drawings survive timeframe switches and data refreshes; they are converted to bar
 * indices ("logical" positions) only for rendering.
 */

export type Pt = { t: number; p: number };

export type Drawing =
  | { id: string; kind: "hline"; p: number }
  | { id: string; kind: "trend" | "fib" | "ruler"; a: Pt; b: Pt }
  | { id: string; kind: "rr"; entry: Pt; stop: Pt; target: Pt };

export type Tool = "none" | "hline" | "trend" | "fib" | "ruler" | "rr";

/** Clicks needed to finish a drawing with each tool. */
export const TOOL_POINTS: Record<Exclude<Tool, "none">, number> = {
  hline: 1,
  trend: 2,
  fib: 2,
  ruler: 2,
  rr: 3,
};

/** Standard retracement levels; 1.618 is the common extension target. */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618] as const;

/** TradingView convention: level 0 sits at the second point, level 1 at the first. */
export function fibPrice(a: number, b: number, level: number): number {
  return b + (a - b) * level;
}

export type RiskReward = {
  side: "long" | "short";
  /** Distance to the stop as a fraction of entry (0.05 = 5%). */
  risk: number;
  /** Distance to the target as a fraction of entry. */
  reward: number;
  /** reward / risk; null when the stop equals the entry. */
  ratio: number | null;
  /** Stop placed on the same side as the target (not a valid position). */
  invalid: boolean;
};

export function riskReward(entry: number, stop: number, target: number): RiskReward {
  const side = target >= entry ? "long" : "short";
  const risk = entry > 0 ? Math.abs(entry - stop) / entry : 0;
  const reward = entry > 0 ? Math.abs(target - entry) / entry : 0;
  const invalid = side === "long" ? stop >= entry : stop <= entry;
  return { side, risk, reward, ratio: risk > 0 ? reward / risk : null, invalid };
}

/** Price change from a to b as a fraction (0.1 = +10%); null when a is not positive. */
export function changePct(a: number, b: number): number | null {
  return a > 0 ? (b - a) / a : null;
}

/** Bar step (seconds) near index i, falling back to the last known step. */
function stepAt(times: number[], i: number): number {
  const n = times.length;
  if (n < 2) return 60;
  const j = Math.min(Math.max(i, 0), n - 2);
  return times[j + 1]! - times[j]! || 60;
}

/**
 * Time → fractional bar index. Times between bars interpolate; times outside the data
 * extrapolate with the edge bar step, so drawings may extend into the future.
 */
export function timeToLogical(times: number[], t: number): number {
  const n = times.length;
  if (n === 0) return NaN;
  if (t <= times[0]!) return (t - times[0]!) / stepAt(times, 0);
  if (t >= times[n - 1]!) return n - 1 + (t - times[n - 1]!) / stepAt(times, n - 2);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= t) lo = mid;
    else hi = mid;
  }
  return lo + (t - times[lo]!) / (times[hi]! - times[lo]!);
}

/** Fractional bar index → time (inverse of timeToLogical). */
export function logicalToTime(times: number[], l: number): number {
  const n = times.length;
  if (n === 0) return NaN;
  if (l <= 0) return times[0]! + l * stepAt(times, 0);
  if (l >= n - 1) return times[n - 1]! + (l - (n - 1)) * stepAt(times, n - 2);
  const i = Math.floor(l);
  return times[i]! + (l - i) * (times[i + 1]! - times[i]!);
}

/** "2d 4h", "5h 45m", "12m". */
export function formatDuration(seconds: number): string {
  const s = Math.abs(Math.round(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

export function formatPct(x: number): string {
  const v = x * 100;
  const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`;
}

const MAX_DRAWINGS = 60;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPt = (v: unknown): v is Pt =>
  !!v && typeof v === "object" && isNum((v as Pt).t) && isNum((v as Pt).p);

/** Validates drawings read back from browser storage (anything malformed is dropped). */
export function parseDrawings(raw: unknown): Drawing[] {
  if (!Array.isArray(raw)) return [];
  const out: Drawing[] = [];
  for (const d of raw.slice(0, MAX_DRAWINGS)) {
    if (!d || typeof d !== "object" || typeof d.id !== "string") continue;
    if (d.kind === "hline" && isNum(d.p)) out.push({ id: d.id, kind: "hline", p: d.p });
    else if (
      (d.kind === "trend" || d.kind === "fib" || d.kind === "ruler") &&
      isPt(d.a) &&
      isPt(d.b)
    )
      out.push({ id: d.id, kind: d.kind, a: d.a, b: d.b });
    else if (d.kind === "rr" && isPt(d.entry) && isPt(d.stop) && isPt(d.target))
      out.push({ id: d.id, kind: "rr", entry: d.entry, stop: d.stop, target: d.target });
  }
  return out;
}

/** Builds a drawing from the clicked points (in click order). */
export function makeDrawing(tool: Exclude<Tool, "none">, pts: Pt[], id: string): Drawing | null {
  if (pts.length < TOOL_POINTS[tool]) return null;
  if (tool === "hline") return { id, kind: "hline", p: pts[0]!.p };
  if (tool === "rr") return { id, kind: "rr", entry: pts[0]!, stop: pts[1]!, target: pts[2]! };
  return { id, kind: tool, a: pts[0]!, b: pts[1]! };
}

export { MAX_DRAWINGS };
