import { encodeFunctionData, type Hex } from "viem";
import { ERC20_ABI, type ChainProvider } from "@quvr/providers";
import type { SimulationResult } from "@quvr/shared";
import { t } from "@quvr/scoring";
import { PROBE_TARGET } from "./contract";

export type SimulationInput = {
  token: string;
  /** Where sells deliver tokens: v4 PoolManager, v2/v3 pair, or launchpad curve. */
  poolTarget: string | null;
  /** A regular holder with a positive balance (never one of our own keys — we have none). */
  holder: { address: string; balance: bigint } | null;
  /** Pool-side balance holder used for the buy leg (tokens flow pool → buyer). */
  poolHolder: { address: string; balance: bigint } | null;
};

const decodeTransferOk = (data: Hex) => data === "0x" || BigInt(data.slice(0, 66) || "0x0") === 1n;

/**
 * Read-only buy/sell path simulation on the latest block via eth_call:
 *   sell: holder → pool   ERC20.transfer
 *   buy:  pool   → fresh  ERC20.transfer
 * Nothing is signed or broadcast. Router/Permit2/hook code is not executed, so a pass is
 * evidence (not proof) that transfers along the pool path are not blocked.
 */
export async function simulateBuySell(
  chain: ChainProvider,
  input: SimulationInput,
): Promise<SimulationResult> {
  const unavailable = (why: string): SimulationResult => ({
    status: "unavailable",
    method: "eth_call ERC20.transfer",
    buy: null,
    sell: null,
    blockNumber: null,
    notes: t(`Sell simulation unavailable: ${why}`, `Sell simulation unavailable: ${why}`),
  });
  if (!input.poolTarget) return unavailable("no pool found");
  if (!input.holder || input.holder.balance <= 0n)
    return unavailable("no regular holder with balance");

  const block = await chain.getBlockNumber();
  const sellAmount =
    input.holder.balance / 10n > 0n ? input.holder.balance / 10n : input.holder.balance;
  const calls = [
    {
      to: input.token,
      from: input.holder.address,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [input.poolTarget as Hex, sellAmount],
      }),
    },
  ];
  const buyAmount =
    input.poolHolder && input.poolHolder.balance > 0n
      ? sellAmount < input.poolHolder.balance
        ? sellAmount
        : input.poolHolder.balance / 10n
      : 0n;
  if (input.poolHolder && buyAmount > 0n) {
    calls.push({
      to: input.token,
      from: input.poolHolder.address,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [PROBE_TARGET, buyAmount],
      }),
    });
  }
  const [sell, buy] = await chain.callMany(calls, block);
  const sellOk = !!sell?.ok && decodeTransferOk(sell.data);
  const buyOk = buy ? !!buy.ok && decodeTransferOk(buy.data) : null;

  return {
    status: sellOk && buyOk !== false ? "passed" : "failed",
    method: `eth_call ERC20.transfer at block ${block} (holder → pool, pool → new wallet)`,
    sell: {
      ok: sellOk,
      detail: sell?.ok
        ? `transfer to pool ${input.poolTarget}: ok`
        : `reverted: ${sell && !sell.ok ? sell.reason : "no response"}`,
    },
    buy: buy
      ? {
          ok: buyOk,
          detail: buy.ok
            ? "transfer from pool to new wallet: ok"
            : `reverted: ${buy.ok ? "" : buy.reason}`,
        }
      : null,
    blockNumber: block,
    notes: t(
      "Симуляция только читает состояние (eth_call) на текущем блоке и ничего не отправляет в сеть. Логика роутера, Permit2 и hook-контрактов не исполняется.",
      "Read-only simulation (eth_call) on the current block; nothing is sent to the network. Router, Permit2 and hook logic is not executed.",
    ),
  };
}
