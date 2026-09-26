import { readErc20Metadata, type ChainProvider, type Erc20Metadata } from "@quvr/providers";
import { cacheGet, cacheSet } from "../cache";

/**
 * ERC-20 name/symbol/decimals never change, so after one good read they are kept for 30 days.
 * A report built while the public RPC is saturated then still has the token's name instead of
 * "No data". totalSupply can change (mint) and is always read live.
 */
type Static = Pick<Erc20Metadata, "name" | "symbol" | "decimals">;
const TTL = 30 * 86_400;
const RETRY_DELAY_MS = 2_000;

const key = (chain: ChainProvider, token: string) =>
  `erc20-meta:${chain.chain.id}:${token.toLowerCase()}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function cachedErc20Metadata(
  chain: ChainProvider,
  token: string,
): Promise<Erc20Metadata> {
  const cached = (await cacheGet<Static>(key(chain, token)))?.value ?? null;
  let lastErr: unknown = null;
  // One retry: failures here are almost always a momentary client-side rate-limit queue.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const live = await readErc20Metadata(chain, token);
      if (live.name !== null || live.symbol !== null || live.decimals !== null) {
        await cacheSet<Static>(
          key(chain, token),
          {
            name: live.name ?? cached?.name ?? null,
            symbol: live.symbol ?? cached?.symbol ?? null,
            decimals: live.decimals ?? cached?.decimals ?? null,
          },
          TTL,
        );
      }
      return {
        name: live.name ?? cached?.name ?? null,
        symbol: live.symbol ?? cached?.symbol ?? null,
        decimals: live.decimals ?? cached?.decimals ?? null,
        totalSupplyRaw: live.totalSupplyRaw,
      };
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await sleep(RETRY_DELAY_MS);
    }
  }
  if (cached) return { ...cached, totalSupplyRaw: null };
  throw lastErr;
}

/** Decimals only (quote tokens, trade pricing). null when unknown. */
export async function cachedDecimals(chain: ChainProvider, token: string): Promise<number | null> {
  return (await cachedErc20Metadata(chain, token).catch(() => null))?.decimals ?? null;
}
