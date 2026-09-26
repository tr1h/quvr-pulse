/**
 * Live probe of every data source against a token (default: the reference test contract).
 * Usage: npm run probe -- 0x...
 * Prints what each provider actually returned so limitations can be documented honestly.
 */
import "dotenv/config";
import {
  describeError,
  getProviders,
  readErc20Metadata,
  readV4PoolState,
  V4_SWAP_TOPIC,
  decodeV4Swap,
  metricsSnapshot,
} from "@quvr/providers";
import { concentratedImpact, priceFromSqrt } from "@quvr/scoring";
import { appMode, normalizeAddress } from "@quvr/shared";

const token = normalizeAddress(process.argv[2] ?? "0x4b7d1e5ec6889e63e70d39561edf925095dbed88");
const p = getProviders();

async function step(name: string, fn: () => Promise<unknown>) {
  const t0 = performance.now();
  try {
    const out = await fn();
    console.log(`\n✔ ${name} (${Math.round(performance.now() - t0)} ms)`);
    console.log(
      JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2).slice(0, 1500),
    );
    return out;
  } catch (e) {
    console.log(`\n✘ ${name} (${Math.round(performance.now() - t0)} ms): ${describeError(e)}`);
    return null;
  }
}

console.log(`Mode: ${appMode()} | chain ${p.chain.chain.id} via ${p.chain.name} | token ${token}`);

await step("RPC eth_blockNumber", () => p.chain.getBlockNumber());
await step("RPC eth_getCode size", async () => ((await p.chain.getCode(token)).length - 2) / 2);
const meta = await step("RPC ERC-20 metadata", () => readErc20Metadata(p.chain, token));
const market = (await step("Dexscreener pairs", async () => {
  const r = await p.market.getTokenPairs("robinhood", token);
  return { count: r.pairs.length, main: r.pairs[0], links: r.links };
})) as { main?: { pairAddress: string; kind: string; priceUsd: number | null } } | null;

const main = market?.main;
if (main?.kind === "v4" && p.chain.chain.uniswapV4PoolManager) {
  const pm = p.chain.chain.uniswapV4PoolManager;
  const state = await step("v4 PoolManager extsload(slot0, liquidity)", () =>
    readV4PoolState(p.chain, pm, main.pairAddress as `0x${string}`),
  );
  await step("v4 latest Swap event (cross-check sqrtPrice)", async () => {
    const head = await p.chain.getBlockNumber();
    const logs = await p.chain.getLogs({
      address: pm,
      topics: [V4_SWAP_TOPIC, main.pairAddress],
      fromBlock: head - 100_000,
      toBlock: head,
    });
    const last = logs.at(-1);
    return last
      ? {
          block: last.blockNumber,
          sqrtPriceX96: decodeV4Swap(last).sqrtPriceX96,
          swaps: logs.length,
        }
      : "no swaps in window";
  });
  if (state && meta && main.priceUsd) {
    const s = state as Awaited<ReturnType<typeof readV4PoolState>>;
    const dec = (meta as { decimals: number }).decimals;
    await step("Price impact estimate (sell, token = currency1)", async () =>
      [100, 1000, 5000].map((usd) => ({
        usd,
        impactPct: concentratedImpact({
          sqrtPriceX96: s!.sqrtPriceX96,
          liquidity: s!.liquidity,
          amountInRaw: (usd / main.priceUsd!) * 10 ** dec,
          zeroForOne: false,
          feePpm: s!.lpFeePpm,
        }),
        priceNativeFromSlot0: priceFromSqrt(s!.sqrtPriceX96, false, 18, dec),
      })),
    );
  }
}

await step("Blockscout address info", () => p.explorer.getAddressInfo(token));
await step("FomoAPI trending", () =>
  p.social.isEnabled()
    ? p.social.getTrendingTokens("robinhood", 5)
    : Promise.resolve("disabled: FOMO_API_KEY not set (onchain-only)"),
);

console.log("\nMetrics:", JSON.stringify(metricsSnapshot(), null, 2));
