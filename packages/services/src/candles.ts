import { getPoolCandles, type Candle, type CandleFrame } from "@quvr/providers";
import type { PairInfo } from "@quvr/shared";
import { cacheGet, cacheSet, swr } from "./cache";

export type PriceCandles = {
  candles: Candle[];
  source: string;
  fetchedAt: string;
  isStale: boolean;
};

type Network = "robinhood" | "base" | "solana";
type Stored = { candles: Candle[]; fetchedAt: string };

/**
 * Seconds a candle set stays fresh. GeckoTerminal's free API allows ~30 calls a minute for the
 * whole site, so longer bars are refreshed less often (a 1D candle barely moves in 30 minutes).
 */
const FRESH: Record<CandleFrame, number> = {
  "5m": 60,
  "15m": 120,
  "1d": 120,
  "1h": 300,
  "7d": 600,
  "4h": 900,
  "30d": 1800,
  "1D": 1800,
};

function candleKey(network: Network, token: string, pair: PairInfo, frame: CandleFrame) {
  const side = pair.baseToken.address.toLowerCase() === token.toLowerCase() ? "base" : "quote";
  return { key: `candles:${network}:${pair.pairAddress}:${side}:${frame}`, side } as const;
}

/** USD candles of the token in its main pool. null = source did not answer (shown as "No data"). */
export async function getPriceCandles(
  /** GeckoTerminal network id = our chain slug (robinhood, base, solana). */
  network: Network,
  token: string,
  pair: PairInfo,
  frame: CandleFrame,
): Promise<PriceCandles | null> {
  const { key, side } = candleKey(network, token, pair, frame);
  // A recent failure with nothing cached: answer at once instead of queueing another call.
  if (!(await cacheGet<Stored>(key)) && (await cacheGet<boolean>(`${key}:failed`))) return null;
  try {
    const r = await swr(key, { freshSeconds: FRESH[frame], keepSeconds: 86_400 }, async () => {
      const c = await getPoolCandles(network, pair.pairAddress, frame, side);
      if (!c) throw new Error("no candles");
      return { candles: c, fetchedAt: new Date().toISOString() } satisfies Stored;
    });
    return {
      candles: r.value.candles,
      source: "geckoterminal",
      fetchedAt: r.value.fetchedAt,
      isStale: r.isStale,
    };
  } catch {
    await cacheSet(`${key}:failed`, true, 30);
    return fromFinerCandles(network, token, pair, frame);
  }
}

/** Seconds per bar for frames that can be rebuilt from finer cached candles. */
const BUCKET: Partial<Record<CandleFrame, { seconds: number; from: CandleFrame[] }>> = {
  "4h": { seconds: 4 * 3600, from: ["1h", "15m"] },
  "1D": { seconds: 86_400, from: ["4h", "1h"] },
};

/** Merges candles into longer bars (open of the first, close of the last, summed volume). */
export function aggregateCandles(cs: Candle[], seconds: number): Candle[] {
  const size = seconds * 1000;
  const out = new Map<number, Candle>();
  for (const c of [...cs].sort((a, b) => a.t - b.t)) {
    const t = Math.floor(c.t / size) * size;
    const b = out.get(t);
    if (!b) out.set(t, { ...c, t });
    else
      out.set(t, { t, o: b.o, h: Math.max(b.h, c.h), l: Math.min(b.l, c.l), c: c.c, v: b.v + c.v });
  }
  return [...out.values()];
}

/**
 * When the source is out of quota, a 4h/1D chart is rebuilt from finer candles already in cache
 * (marked stale) instead of showing nothing.
 */
async function fromFinerCandles(
  network: Network,
  token: string,
  pair: PairInfo,
  frame: CandleFrame,
): Promise<PriceCandles | null> {
  const rule = BUCKET[frame];
  if (!rule) return null;
  for (const f of rule.from) {
    const hit = await cacheGet<Stored>(candleKey(network, token, pair, f).key);
    if (hit?.value.candles.length) {
      return {
        candles: aggregateCandles(hit.value.candles, rule.seconds),
        source: "geckoterminal (aggregated)",
        fetchedAt: hit.value.fetchedAt,
        isStale: true,
      };
    }
  }
  return null;
}

/** Cached candles only (never calls the source): lets the page ship the first chart instantly. */
export async function peekPriceCandles(
  network: Network,
  token: string,
  pair: PairInfo,
  frame: CandleFrame,
): Promise<Candle[] | null> {
  const hit = await cacheGet<Stored>(candleKey(network, token, pair, frame).key);
  return hit?.value.candles ?? null;
}
