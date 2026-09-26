import {
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseAbi,
  toHex,
} from "viem";
import { topicToAddress } from "@quvr/shared";
import { decodeAddress, decodeUint } from "./erc20";
import type { ChainProvider, Hex, RpcLog } from "./types";

export const V4_SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
export const V4_INITIALIZE_TOPIC =
  "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";
export const V4_MODIFY_LIQUIDITY_TOPIC =
  "0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec";

/** v4-core StateLibrary: `pools` mapping lives at slot 6; liquidity is at offset 3 of Pool.State. */
const POOLS_SLOT = 6n;
const LIQUIDITY_OFFSET = 3n;

const EXTSLOAD_ABI = parseAbi(["function extsload(bytes32 slot) view returns (bytes32)"]);
const V3_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
]);

export type ConcentratedPoolState = {
  kind: "v3" | "v4";
  sqrtPriceX96: bigint;
  tick: number;
  /** Active (in-range) liquidity at the current tick. */
  liquidity: bigint;
  lpFeePpm: number | null;
  currency0: string | null;
  currency1: string | null;
};

function signExtend24(v: bigint): number {
  const n = Number(v & 0xffffffn);
  return n & 0x800000 ? n - 0x1000000 : n;
}

export function v4PoolStateSlot(poolId: Hex): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [poolId, POOLS_SLOT]),
    ),
  );
}

export async function readV4PoolState(
  chain: ChainProvider,
  poolManager: string,
  poolId: Hex,
): Promise<ConcentratedPoolState | null> {
  const base = v4PoolStateSlot(poolId);
  const slots = [base, base + LIQUIDITY_OFFSET];
  const res = await chain.callMany(
    slots.map((s) => ({
      to: poolManager,
      data: encodeFunctionData({
        abi: EXTSLOAD_ABI,
        functionName: "extsload",
        args: [toHex(s, { size: 32 })],
      }),
    })),
  );
  if (!res[0]?.ok || !res[1]?.ok) return null;
  const slot0 = BigInt(res[0].data);
  if (slot0 === 0n) return null; // pool not initialized
  const sqrtPriceX96 = slot0 & ((1n << 160n) - 1n);
  const tick = signExtend24(slot0 >> 160n);
  const lpFee = Number((slot0 >> 208n) & 0xffffffn);
  const liquidity = BigInt(res[1].data) & ((1n << 128n) - 1n);
  return {
    kind: "v4",
    sqrtPriceX96,
    tick,
    liquidity,
    lpFeePpm: lpFee,
    currency0: null,
    currency1: null,
  };
}

export async function readV3PoolState(
  chain: ChainProvider,
  pool: string,
): Promise<ConcentratedPoolState | null> {
  const fns = ["slot0", "liquidity", "token0", "token1", "fee"] as const;
  const res = await chain.callMany(
    fns.map((fn) => ({ to: pool, data: encodeFunctionData({ abi: V3_ABI, functionName: fn }) })),
  );
  if (!res[0]?.ok || !res[1]?.ok) return null;
  const [sqrtPriceX96, tick] = decodeAbiParameters(
    [{ type: "uint160" }, { type: "int24" }],
    res[0].data.slice(0, 2 + 128) as Hex,
  );
  return {
    kind: "v3",
    sqrtPriceX96,
    tick,
    liquidity: decodeUint(res[1].data) ?? 0n,
    lpFeePpm: res[4]?.ok ? Number(decodeUint(res[4].data) ?? 0n) : null,
    currency0: res[2]?.ok ? decodeAddress(res[2].data) : null,
    currency1: res[3]?.ok ? decodeAddress(res[3].data) : null,
  };
}

export type V4Swap = {
  poolId: string;
  sender: string;
  /** Deltas from the swapper's perspective: negative = paid into the pool. */
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
  fee: number;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  timestamp: number | null;
};

export function decodeV4Swap(log: RpcLog): V4Swap {
  const [amount0, amount1, sqrtPriceX96, liquidity, tick, fee] = decodeAbiParameters(
    [
      { type: "int128" },
      { type: "int128" },
      { type: "uint160" },
      { type: "uint128" },
      { type: "int24" },
      { type: "uint24" },
    ],
    log.data,
  );
  return {
    poolId: log.topics[1] ?? "",
    sender: topicToAddress(log.topics[2] ?? "0x"),
    amount0,
    amount1,
    sqrtPriceX96,
    liquidity,
    tick,
    fee,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    logIndex: log.logIndex,
    timestamp: log.blockTimestamp,
  };
}

export type V4PoolKey = {
  poolId: string;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
  blockNumber: number;
  txHash: string;
  timestamp: number | null;
};

export function decodeV4Initialize(log: RpcLog): V4PoolKey {
  const [fee, tickSpacing, hooks] = decodeAbiParameters(
    [
      { type: "uint24" },
      { type: "int24" },
      { type: "address" },
      { type: "uint160" },
      { type: "int24" },
    ],
    log.data,
  );
  return {
    poolId: log.topics[1] ?? "",
    currency0: topicToAddress(log.topics[2] ?? "0x"),
    currency1: topicToAddress(log.topics[3] ?? "0x"),
    fee,
    tickSpacing,
    hooks: hooks.toLowerCase(),
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    timestamp: log.blockTimestamp,
  };
}
