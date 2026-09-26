import { decodeAbiParameters, encodeFunctionData, hexToString, parseAbi, trim } from "viem";
import { sanitizeText } from "@quvr/shared";
import type { ChainProvider, Hex } from "./types";

export const ERC20_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function owner() view returns (address)",
]);

export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** Decodes string returns, including legacy bytes32-encoded names/symbols. */
export function decodeStringResult(data: Hex): string | null {
  if (!data || data === "0x") return null;
  try {
    const [s] = decodeAbiParameters([{ type: "string" }], data);
    return s;
  } catch {
    try {
      if (data.length === 66) return hexToString(trim(data as Hex, { dir: "right" }));
    } catch {
      /* fallthrough */
    }
    return null;
  }
}

export function decodeUint(data: Hex): bigint | null {
  if (!data || data === "0x" || data.length < 66) return null;
  try {
    return BigInt(data.slice(0, 66));
  } catch {
    return null;
  }
}

export function decodeAddress(data: Hex): string | null {
  if (!data || data.length < 66) return null;
  return `0x${data.slice(26, 66)}`.toLowerCase();
}

export type Erc20Metadata = {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupplyRaw: bigint | null;
};

export async function readErc20Metadata(
  chain: ChainProvider,
  token: string,
): Promise<Erc20Metadata> {
  const fns = ["name", "symbol", "decimals", "totalSupply"] as const;
  const results = await chain.callMany(
    fns.map((fn) => ({
      to: token,
      data: encodeFunctionData({ abi: ERC20_ABI, functionName: fn }),
    })),
  );
  const [n, s, d, t] = results;
  const decimals = d?.ok ? decodeUint(d.data) : null;
  return {
    name: n?.ok ? sanitizeText(decodeStringResult(n.data), 64) : null,
    symbol: s?.ok ? sanitizeText(decodeStringResult(s.data), 24) : null,
    decimals: decimals !== null && decimals <= 255n ? Number(decimals) : null,
    totalSupplyRaw: t?.ok ? decodeUint(t.data) : null,
  };
}

export async function readBalances(
  chain: ChainProvider,
  token: string,
  holders: string[],
): Promise<Map<string, bigint | null>> {
  const results = await chain.callMany(
    holders.map((h) => ({
      to: token,
      data: encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [h as Hex] }),
    })),
  );
  const out = new Map<string, bigint | null>();
  holders.forEach((h, i) => {
    const r = results[i];
    out.set(h, r?.ok ? decodeUint(r.data) : null);
  });
  return out;
}

/** Converts a raw integer amount to a JS number with the given decimals (display precision). */
export function toUnits(raw: bigint, decimals: number): number {
  if (decimals === 0) return Number(raw);
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  return Number(whole) + Number(frac) / Number(base);
}
