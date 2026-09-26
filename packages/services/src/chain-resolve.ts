import { getChainProviders, getProviders } from "@quvr/providers";
import { EVM_CHAINS, isContractCode, ROBINHOOD_MAINNET, SOLANA, parseTokenRef } from "@quvr/shared";
import { cacheGet, cacheSet } from "./cache";

/**
 * Which chain a token lives on. Solana is recognised by its address format; a 0x address can be
 * on Robinhood Chain or Base, so we look where it actually trades (Dexscreener liquidity), and
 * fall back to where contract code exists. Decisions are cached for 30 days.
 */
export async function resolveTokenChain(token: string): Promise<number> {
  const ref = parseTokenRef(token);
  if (ref?.chain === "solana") return SOLANA.id;
  const address = token.toLowerCase();
  const key = `evm-chain:${address}`;
  const cached = await cacheGet<number>(key);
  if (cached) return cached.value;

  const market = getProviders().market;
  const liquidity = await Promise.all(
    EVM_CHAINS.map(async (c) => {
      const pairs = await market
        .getTokenPairs(c.dexscreenerChainId!, address)
        .then((r) => r.pairs)
        .catch(() => null);
      return {
        id: c.id,
        known: pairs !== null,
        liq: (pairs ?? []).reduce((s, p) => s + (p.liquidityUsd ?? 0), 0),
        n: pairs?.length ?? 0,
      };
    }),
  );
  const traded = liquidity.filter((x) => x.n > 0).sort((a, b) => b.liq - a.liq);
  if (traded.length) {
    await cacheSet(key, traded[0]!.id, 30 * 86_400);
    return traded[0]!.id;
  }
  // Not traded anywhere yet: pick the chain where the contract exists (Robinhood first).
  for (const c of EVM_CHAINS) {
    const code = await getChainProviders(c.id)
      .chain.getCode(address)
      .catch(() => null);
    if (code && isContractCode(code)) {
      await cacheSet(key, c.id, 30 * 86_400);
      return c.id;
    }
  }
  // Unknown everywhere (or sources down): default without caching for long.
  const fallback = ROBINHOOD_MAINNET.id;
  if (liquidity.every((x) => x.known)) await cacheSet(key, fallback, 600);
  return fallback;
}
