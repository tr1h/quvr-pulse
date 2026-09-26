import { z } from "zod";
import { fetchJson } from "../http";

/**
 * GeckoTerminal public API — OHLCV candles for a pool (free, ~30 req/min, no key).
 * Covers both Robinhood Chain ("robinhood") and Solana ("solana"); v4 pools use the 32-byte pool id.
 */
const BASE = "https://api.geckoterminal.com/api/v2";

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
/** Simple chart windows ("1d"/"7d"/"30d") and interactive chart resolutions ("5m"…"1D"). */
export type CandleFrame = "1d" | "7d" | "30d" | "5m" | "15m" | "1h" | "4h" | "1D";

/** Timeframe → GeckoTerminal resolution. Roughly 96–180 candles per chart. */
export const CANDLE_FRAMES: Record<
  CandleFrame,
  { unit: "minute" | "hour" | "day"; aggregate: number; limit: number }
> = {
  "1d": { unit: "minute", aggregate: 15, limit: 96 },
  "7d": { unit: "hour", aggregate: 1, limit: 168 },
  "30d": { unit: "hour", aggregate: 4, limit: 180 },
  "5m": { unit: "minute", aggregate: 5, limit: 288 },
  "15m": { unit: "minute", aggregate: 15, limit: 300 },
  "1h": { unit: "hour", aggregate: 1, limit: 300 },
  "4h": { unit: "hour", aggregate: 4, limit: 300 },
  "1D": { unit: "day", aggregate: 1, limit: 300 },
};

const n = z.union([z.number(), z.string()]).transform(Number);
const schema = z.object({
  data: z.object({
    attributes: z.object({ ohlcv_list: z.array(z.tuple([n, n, n, n, n, n])) }),
  }),
});

export async function getPoolCandles(
  network: "robinhood" | "base" | "solana",
  pool: string,
  frame: CandleFrame,
  /** Which side of the pool to price; GeckoTerminal defaults to base. */
  side: "base" | "quote" = "base",
): Promise<Candle[] | null> {
  const f = CANDLE_FRAMES[frame];
  const url =
    `${BASE}/networks/${network}/pools/${encodeURIComponent(pool)}/ohlcv/${f.unit}` +
    `?aggregate=${f.aggregate}&limit=${f.limit}&currency=usd&token=${side}`;
  const json = await fetchJson("geckoterminal", url, { timeoutMs: 8_000, allowNotFound: true });
  if (json === null) return null;
  const parsed = schema.safeParse(json);
  if (!parsed.success) return null;
  // The API occasionally repeats a bucket; keep one candle per timestamp.
  const byTime = new Map<number, Candle>();
  for (const [t, o, h, l, c, v] of parsed.data.data.attributes.ohlcv_list) {
    if ([o, h, l, c].every((y) => Number.isFinite(y) && y > 0))
      byTime.set(t * 1000, { t: t * 1000, o, h, l, c, v });
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}
