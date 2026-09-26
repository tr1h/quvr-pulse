import { decodeAbiParameters, type Hex } from "viem";
import {
  getProviders,
  readErc20Metadata,
  TRANSFER_TOPIC,
  V4_SWAP_TOPIC,
  type ChainProvider,
} from "@quvr/providers";
import {
  authorQuality,
  medianSellAfterThesis,
  reconstructTrades,
  type WalletLeg,
} from "@quvr/scoring";
import { ZERO_ADDRESS, type AuthorStats } from "@quvr/shared";
import { cacheGet, cacheSet, swr } from "../cache";
import { ChainClock } from "../scan/clock";

/**
 * Author trade history from Robinhood Chain itself (no social-provider credits):
 *  1. ERC-20 Transfer logs to/from the author wallet over the last N days (incremental);
 *  2. tokens are matched to their Uniswap v4 pools (Dexscreener pair list);
 *  3. each movement is priced by the execution price of the swap in that token's pool in the
 *     same transaction (router fees and multi-hop routes make exact amount matching impossible);
 *  4. positions are reconstructed at average cost (packages/scoring/onchain-trades.ts).
 * Movements without a swap (airdrops, wallet moves, bonding-curve trades) stay unpriced and are
 * excluded from quality stats.
 */
const DAYS = Number(process.env.ONCHAIN_AUTHOR_DAYS ?? "30");

type RawLeg = [token: string, dir: "in" | "out", amountHex: string, block: number, tx: string];
type StoredLegs = { fromBlock: number; toBlock: number; legs: RawLeg[] };
type PoolInfo = { token: string; quote: string; quoteDecimals: number; quoteUsd: number | null };
type TxSwap = { poolId: string; a0: string; a1: string };

const pad = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;

async function loadRawLegs(
  chain: ChainProvider,
  wallet: string,
  clock: ChainClock,
): Promise<StoredLegs & { complete: boolean }> {
  const key = `wallet-legs:v1:${wallet}`;
  const from = clock.blockAt(clock.headTs - DAYS * 86_400);
  let base = (await cacheGet<StoredLegs>(key))?.value ?? null;
  if (base && base.fromBlock > from + 1_000_000) base = null;
  const start = base ? base.toBlock + 1 : from;
  if (start > clock.headBlock && base) return { ...base, complete: true };

  const q = { fromBlock: start, toBlock: clock.headBlock } as const;
  const opts = { maxLogs: 20_000, maxRequests: 40, initialWindow: 2_000_000 };
  const [inn, out] = [
    await chain.getLogsPaginated({ ...q, topics: [TRANSFER_TOPIC, null, pad(wallet)] }, opts),
    await chain.getLogsPaginated({ ...q, topics: [TRANSFER_TOPIC, pad(wallet)] }, opts),
  ];
  const coveredTo = Math.min(inn.scannedTo, out.scannedTo);
  const fresh: RawLeg[] = [];
  for (const [res, dir] of [
    [inn, "in"],
    [out, "out"],
  ] as const) {
    for (const l of res.logs) {
      if (l.blockNumber > coveredTo || l.topics.length < 3 || l.data.length < 66) continue;
      fresh.push([l.address, dir, l.data.slice(0, 66), l.blockNumber, l.transactionHash]);
    }
  }
  const merged: StoredLegs = {
    fromBlock: base?.fromBlock ?? from,
    toBlock: coveredTo,
    legs: [...(base?.legs ?? []), ...fresh],
  };
  // Drop legs that fell out of the window.
  merged.legs = merged.legs.filter((l) => l[3] >= from);
  merged.fromBlock = Math.max(merged.fromBlock, from);
  await cacheSet(key, merged, 7 * 86_400);
  return { ...merged, complete: inn.complete && out.complete };
}

async function poolsFor(tokens: string[]): Promise<Map<string, PoolInfo>> {
  const p = getProviders();
  const slug = p.chain.chain.dexscreenerChainId;
  const out = new Map<string, PoolInfo>();
  if (!slug || !tokens.length) return out;
  const missing: string[] = [];
  for (const t of tokens) {
    const c = await cacheGet<Array<[string, PoolInfo]>>(`token-pools:${t}`);
    if (c) for (const [k, v] of c.value) out.set(k, v);
    else missing.push(t);
  }
  if (missing.length) {
    const pairs = await p.market.getTokensPairs(slug, missing);
    const decimals = new Map<string, number>([[ZERO_ADDRESS, 18]]);
    const byToken = new Map<string, Array<[string, PoolInfo]>>();
    for (const pair of pairs.filter((x) => x.kind === "v4" && x.pairAddress.length === 66)) {
      const quote = pair.quoteToken.address;
      if (!decimals.has(quote)) {
        const cached = await cacheGet<number>(`erc20-decimals:${quote}`);
        const d =
          cached?.value ??
          (await readErc20Metadata(p.chain, quote).catch(() => null))?.decimals ??
          null;
        if (d === null) continue;
        decimals.set(quote, d);
        await cacheSet(`erc20-decimals:${quote}`, d, 30 * 86_400);
      }
      const info: PoolInfo = {
        token: pair.baseToken.address,
        quote,
        quoteDecimals: decimals.get(quote)!,
        quoteUsd: pair.priceUsd && pair.priceNative ? pair.priceUsd / pair.priceNative : null,
      };
      byToken.set(info.token, [...(byToken.get(info.token) ?? []), [pair.pairAddress, info]]);
      out.set(pair.pairAddress, info);
    }
    for (const t of missing) await cacheSet(`token-pools:${t}`, byToken.get(t) ?? [], 3_600);
  }
  return out;
}

async function tokenDecimals(chain: ChainProvider, token: string): Promise<number | null> {
  const c = await cacheGet<number>(`erc20-decimals:${token}`);
  if (c) return c.value;
  const d = (await readErc20Metadata(chain, token).catch(() => null))?.decimals ?? null;
  if (d !== null) await cacheSet(`erc20-decimals:${token}`, d, 30 * 86_400);
  return d;
}

async function swapsOf(
  chain: ChainProvider,
  txs: string[],
  poolManager: string,
): Promise<Map<string, TxSwap[]>> {
  const out = new Map<string, TxSwap[]>();
  const missing: string[] = [];
  for (const h of txs) {
    const c = await cacheGet<TxSwap[]>(`tx-swaps:${h}`);
    if (c) out.set(h, c.value);
    else missing.push(h);
  }
  for (let i = 0; i < missing.length; i += 25) {
    const chunk = missing.slice(i, i + 25);
    const receipts = await chain.getReceipts(chunk);
    for (let j = 0; j < chunk.length; j++) {
      const rc = receipts[j];
      if (!rc) continue;
      const swaps = rc.logs
        .filter((l) => l.address === poolManager && l.topics[0] === V4_SWAP_TOPIC)
        .map((l) => {
          const [a0, a1] = decodeAbiParameters(
            [{ type: "int128" }, { type: "int128" }],
            l.data as Hex,
          );
          return { poolId: l.topics[1] ?? "", a0: a0.toString(), a1: a1.toString() };
        });
      out.set(chunk[j]!, swaps);
      await cacheSet(`tx-swaps:${chunk[j]}`, swaps, 30 * 86_400);
    }
  }
  return out;
}

export type WalletHistory = { legs: WalletLeg[]; complete: boolean; days: number };

export async function loadWalletHistory(wallet: string): Promise<WalletHistory> {
  const p = getProviders();
  const chain = p.chain;
  const pm = chain.chain.uniswapV4PoolManager;
  const clock = await ChainClock.create(chain);
  const raw = await loadRawLegs(chain, wallet, clock);
  const tokens = [...new Set(raw.legs.map((l) => l[0]))];
  const pools = await poolsFor(tokens);
  const poolsByToken = new Map<string, string[]>();
  for (const [id, info] of pools)
    poolsByToken.set(info.token, [...(poolsByToken.get(info.token) ?? []), id]);

  const tradable = raw.legs.filter((l) => poolsByToken.has(l[0]));
  const txSwaps = pm
    ? await swapsOf(chain, [...new Set(tradable.map((l) => l[4]))], pm)
    : new Map<string, TxSwap[]>();

  const legs: WalletLeg[] = [];
  for (const [token, dir, amountHex, block, tx] of raw.legs) {
    const dec = poolsByToken.has(token) ? await tokenDecimals(chain, token) : 18;
    if (dec === null) continue;
    const amountRaw = BigInt(amountHex);
    const amount = Number(amountRaw) / 10 ** dec;
    let quote: number | null = null;
    const ids = new Set(poolsByToken.get(token) ?? []);
    const swap = (txSwaps.get(tx) ?? []).find((s) => ids.has(s.poolId));
    if (swap) {
      const info = pools.get(swap.poolId)!;
      const tokenIs0 = BigInt(token) < BigInt(info.quote);
      const tokD = BigInt(tokenIs0 ? swap.a0 : swap.a1);
      const qD = BigInt(tokenIs0 ? swap.a1 : swap.a0);
      const tokAbs = Math.abs(Number(tokD)) / 10 ** dec;
      const qAbs = Math.abs(Number(qD)) / 10 ** info.quoteDecimals;
      // Execution price of the swap in the token's pool × the wallet's own amount (after fees).
      if (tokAbs > 0 && info.quoteUsd) quote = amount * (qAbs / tokAbs) * info.quoteUsd;
    }
    legs.push({
      token,
      direction: dir,
      amount,
      quote,
      timestamp: clock.tsAt(block) * 1000,
      txHash: tx,
    });
  }
  return { legs, complete: raw.complete, days: DAYS };
}

/** Author quality from on-chain trades (values in USD at current quote prices). Cached 1 h. */
export async function onchainAuthorStats(
  handle: string,
  wallet: string,
  theses: Array<{ token: string; publishedAt: number }>,
): Promise<AuthorStats> {
  const r = await swr(
    `onchain-author:v1:${wallet}`,
    { freshSeconds: 3_600, keepSeconds: 7 * 86_400 },
    async () => {
      const h = await loadWalletHistory(wallet);
      const rec = reconstructTrades(h.legs);
      const stats = authorQuality({
        handle,
        displayName: null,
        verified: null,
        evmWallet: wallet,
        trades: rec.closed.map((c) => ({
          sizeUsd: c.costQuote,
          realizedPnlUsd: c.pnlQuote,
          openedAt: new Date(c.openedAt).toISOString(),
          closedAt: new Date(c.closedAt).toISOString(),
        })),
      });
      return {
        stats: {
          ...stats,
          source: `onchain Robinhood Chain (${h.days}d${h.complete ? "" : ", partial"})`,
          excludedTrades: rec.taintedClosed,
          openPositions: rec.open.filter((o) => !o.tainted).length,
          qualityConfidence: h.complete ? stats.qualityConfidence : ("low" as const),
        } satisfies AuthorStats,
        legs: h.legs,
      };
    },
  );
  return {
    ...r.value.stats,
    medianSellAfterThesisSec: medianSellAfterThesis(theses, r.value.legs),
  };
}

/** Token-level activity of a wallet from the cached history (for thesis signals). */
export async function walletTokenActivity(wallet: string, token: string) {
  const c = await cacheGet<{ legs: WalletLeg[] }>(`onchain-author:v1:${wallet}`);
  const legs = (c?.value.legs ?? []).filter((l) => l.token === token);
  return {
    known: !!c,
    buys: legs.filter((l) => l.direction === "in" && l.quote !== null).map((l) => l.timestamp),
    sells: legs.filter((l) => l.direction === "out").map((l) => l.timestamp),
  };
}
