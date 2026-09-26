import type { Hex } from "viem";
import {
  decodeV4Initialize,
  decodeV4Swap,
  readV3PoolState,
  readV4PoolState,
  V4_INITIALIZE_TOPIC,
  V4_SWAP_TOPIC,
  type ChainProvider,
  type V4PoolKey,
  type V4Swap,
} from "@quvr/providers";
import {
  concentratedImpact,
  constantProductImpact,
  netNativeFlow,
  priceSeriesFromSwaps,
} from "@quvr/scoring";
import type { PairInfo } from "@quvr/shared";
import type { ChainClock } from "./clock";

export const IMPACT_SIZES_USD = [100, 1000, 5000];

export type PoolActivity = {
  swaps: V4Swap[];
  priceSeries: Array<{ t: number; priceNative: number }>;
  netFlow: { h1: number; h24: number; buysH24: number; sellsH24: number };
  largeSells: Array<{
    txHash: string;
    block: number;
    at: string;
    nativeOut: number;
    usd: number | null;
  }>;
  quoteIsCurrency0: boolean;
  poolKey: V4PoolKey | null;
  complete: boolean;
};

/** Token is currency0 iff its address sorts below the quote (v4/v3 ordering; native = 0x0). */
export function tokenIsCurrency0(token: string, quote: string) {
  return BigInt(token) < BigInt(quote);
}

/** Recent v4 swaps of the main pool (default 24h window) — price history and flow from chain. */
export async function loadV4Activity(
  chain: ChainProvider,
  poolManager: string,
  pair: PairInfo,
  token: string,
  tokenDecimals: number,
  quoteDecimals: number,
  clock: ChainClock,
  opts: { windowSeconds?: number; nativeUsd?: number | null; largeSellUsd?: number } = {},
): Promise<PoolActivity> {
  const windowSeconds = opts.windowSeconds ?? 86_400;
  const from = clock.blockAt(clock.headTs - windowSeconds);
  const res = await chain.getLogsPaginated(
    {
      address: poolManager,
      topics: [V4_SWAP_TOPIC, pair.pairAddress],
      fromBlock: from,
      toBlock: clock.headBlock,
    },
    { maxLogs: 30_000, maxRequests: 30 },
  );
  const swaps = res.logs.map((l) => {
    const s = decodeV4Swap(l);
    return { ...s, timestamp: s.timestamp ?? clock.tsAt(s.blockNumber) };
  });
  const tokenIs0 = tokenIsCurrency0(token, pair.quoteToken.address);
  const [dec0, dec1] = tokenIs0 ? [tokenDecimals, quoteDecimals] : [quoteDecimals, tokenDecimals];
  const quoteIs0 = !tokenIs0;
  const now = clock.headTs;
  const h1 = netNativeFlow(swaps, quoteIs0, quoteDecimals, now - 3600);
  const h24 = netNativeFlow(swaps, quoteIs0, quoteDecimals, now - 86_400);

  const largeSellUsd = opts.largeSellUsd ?? 1_000;
  const largeSells: PoolActivity["largeSells"] = [];
  for (const s of swaps) {
    const quoteDelta = quoteIs0 ? s.amount0 : s.amount1;
    if (quoteDelta <= 0n) continue; // swapper received quote → token sell
    const nativeOut = Number(quoteDelta) / 10 ** quoteDecimals;
    const usd = opts.nativeUsd ? nativeOut * opts.nativeUsd : null;
    if (usd !== null && usd >= largeSellUsd) {
      largeSells.push({
        txHash: s.txHash,
        block: s.blockNumber,
        at: new Date(s.timestamp! * 1000).toISOString(),
        nativeOut,
        usd,
      });
    }
  }

  // Pool key (hooks, fee) from the Initialize event near the pair creation time.
  let poolKey: V4PoolKey | null = null;
  if (pair.pairCreatedAt) {
    const est = clock.blockAt(Date.parse(pair.pairCreatedAt) / 1000);
    try {
      const logs = await chain.getLogs({
        address: poolManager,
        topics: [V4_INITIALIZE_TOPIC, pair.pairAddress],
        fromBlock: Math.max(0, est - 50_000),
        toBlock: Math.min(clock.headBlock, est + 50_000),
      });
      if (logs[0]) poolKey = decodeV4Initialize(logs[0]);
    } catch {
      /* optional */
    }
  }

  return {
    swaps,
    priceSeries: priceSeriesFromSwaps(swaps, tokenIs0, dec0, dec1),
    netFlow: { h1: h1.netNative, h24: h24.netNative, buysH24: h24.buys, sellsH24: h24.sells },
    largeSells: largeSells.slice(-20),
    quoteIsCurrency0: quoteIs0,
    poolKey,
    complete: res.complete,
  };
}

export type ImpactResult = {
  impacts: Array<{ usd: number; impactPct: number }>;
  method: string;
  approximate: true;
};

/**
 * Approximate sell price impact for $100 / $1 000 / $5 000:
 *  - v4/v3: active liquidity at the current tick (no tick crossing, no hook fees);
 *  - v2: constant product from reported reserves.
 * Never uses x*y=k for concentrated pools.
 */
export async function estimatePriceImpact(
  chain: ChainProvider,
  poolManager: string | null,
  pair: PairInfo,
  token: string,
  tokenDecimals: number,
): Promise<ImpactResult | null> {
  if (!pair.priceUsd || pair.priceUsd <= 0) return null;
  const amountRaw = (usd: number) => (usd / pair.priceUsd!) * 10 ** tokenDecimals;

  if (pair.kind === "v4" || pair.kind === "v3") {
    // Currency ordering only matters for concentrated EVM pools (0x addresses).
    const tokenIs0 = tokenIsCurrency0(token, pair.quoteToken.address);
    const state =
      pair.kind === "v4"
        ? poolManager
          ? await readV4PoolState(chain, poolManager, pair.pairAddress as Hex)
          : null
        : await readV3PoolState(chain, pair.pairAddress);
    if (!state || state.liquidity === 0n) return null;
    const impacts = IMPACT_SIZES_USD.map((usd) => ({
      usd,
      impactPct:
        concentratedImpact({
          sqrtPriceX96: state.sqrtPriceX96,
          liquidity: state.liquidity,
          amountInRaw: amountRaw(usd),
          zeroForOne: tokenIs0,
          feePpm: state.lpFeePpm,
        }) ?? NaN,
    })).filter((x) => Number.isFinite(x.impactPct));
    return impacts.length
      ? {
          impacts,
          method: `${pair.kind} active liquidity at tick ${state.tick}; tick crossings and hook fees not modeled`,
          approximate: true,
        }
      : null;
  }
  if (pair.kind === "v2" && pair.liquidityBase && pair.liquidityQuote) {
    const impacts = IMPACT_SIZES_USD.map((usd) => ({
      usd,
      impactPct:
        constantProductImpact(
          pair.liquidityBase!,
          pair.liquidityQuote!,
          usd / pair.priceUsd!,
          0.003,
        ) ?? NaN,
    })).filter((x) => Number.isFinite(x.impactPct));
    return impacts.length
      ? {
          impacts,
          method: "constant product (x*y=k) from Dexscreener reserves, 0.3% fee",
          approximate: true,
        }
      : null;
  }
  return null;
}
