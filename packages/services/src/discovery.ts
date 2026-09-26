import {
  decodeV4Initialize,
  getProviders,
  V4_INITIALIZE_TOPIC,
  type SocialTrendingToken,
} from "@quvr/providers";
import { ZERO_ADDRESS, type PairInfo } from "@quvr/shared";
import { swr, type SwrResult } from "./cache";

export type NewToken = {
  address: string;
  poolId: string;
  quote: string;
  createdAtBlock: number;
  createdAt: string | null;
  hooks: string;
  name: string | null;
  symbol: string | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
};

/**
 * New tokens on Robinhood Chain = tokens in Uniswap v4 pools initialized recently
 * (PoolManager Initialize events), enriched with Dexscreener names/liquidity.
 */
export async function discoverNewTokens(windowSeconds = 6 * 3600): Promise<SwrResult<NewToken[]>> {
  return swr(
    `discovery:new:${windowSeconds}`,
    { freshSeconds: 60, keepSeconds: 3_600 },
    async () => {
      const p = getProviders();
      const pm = p.chain.chain.uniswapV4PoolManager;
      if (!pm) return [];
      const head = await p.chain.getBlockNumber();
      const headTs = await p.chain.getBlockTimestamp(head);
      const from = Math.max(0, head - windowSeconds * 10);
      const res = await p.chain.getLogsPaginated(
        { address: pm, topics: [V4_INITIALIZE_TOPIC], fromBlock: from, toBlock: head },
        { maxLogs: 2_000, maxRequests: 10 },
      );
      const keys = res.logs.map(decodeV4Initialize).reverse();
      // Quote side: native ETH, known stablecoins, or the currency that pairs most often (e.g. WETH).
      const freq = new Map<string, number>();
      for (const k of keys)
        for (const c of [k.currency0, k.currency1]) freq.set(c, (freq.get(c) ?? 0) + 1);
      const KNOWN_QUOTES = new Set([ZERO_ADDRESS, "0x5fc5360d0400a0fd4f2af552add042d716f1d168"]);
      const quoteScore = (c: string) => (KNOWN_QUOTES.has(c) ? 1e9 : (freq.get(c) ?? 0));
      const seen = new Set<string>();
      const tokens: NewToken[] = [];
      for (const k of keys) {
        const token =
          quoteScore(k.currency0) >= quoteScore(k.currency1) ? k.currency1 : k.currency0;
        const quote = token === k.currency0 ? k.currency1 : k.currency0;
        if (seen.has(token)) continue;
        seen.add(token);
        tokens.push({
          address: token,
          poolId: k.poolId,
          quote,
          createdAtBlock: k.blockNumber,
          createdAt: k.timestamp
            ? new Date(k.timestamp * 1000).toISOString()
            : new Date((headTs - (head - k.blockNumber) / 10) * 1000).toISOString(),
          hooks: k.hooks,
          name: null,
          symbol: null,
          liquidityUsd: null,
          marketCapUsd: null,
        });
        if (tokens.length >= 30) break;
      }
      if (tokens.length && p.chain.chain.dexscreenerChainId) {
        try {
          const pairs: PairInfo[] = await p.market.getTokensPairs(
            p.chain.chain.dexscreenerChainId,
            tokens.map((t) => t.address),
          );
          for (const t of tokens) {
            const own = pairs
              .filter((x) => x.baseToken.address === t.address)
              .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
            const main = own[0];
            if (main) {
              t.name = main.baseToken.name;
              t.symbol = main.baseToken.symbol;
              t.liquidityUsd = own.reduce((s, x) => s + (x.liquidityUsd ?? 0), 0);
              t.marketCapUsd = main.marketCapUsd ?? main.fdvUsd;
            }
          }
        } catch {
          /* enrichment optional */
        }
      }
      return tokens;
    },
  );
}

export async function trendingOnFomo(): Promise<SwrResult<SocialTrendingToken[]> | null> {
  const p = getProviders();
  if (!p.social.isEnabled()) return null;
  return swr("social:trending", { freshSeconds: 3_600, keepSeconds: 86_400 }, () =>
    p.social.getTrendingTokens("robinhood", 50),
  );
}
