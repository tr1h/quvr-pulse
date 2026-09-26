import { BASE, chainById, serverEnv, type ServerEnv } from "@quvr/shared";
import { RpcChainProvider } from "./chain/rpc";
import type { ChainProvider } from "./chain/types";
import { BlockscoutExplorerProvider, type ExplorerProvider } from "./explorer/blockscout";
import { DexscreenerMarketProvider, type MarketProvider } from "./market/dexscreener";
import { FomoApiSocialProvider } from "./social/fomoapi";
import type { SocialProvider } from "./social/types";

export * from "./errors";
export * from "./http";
export * from "./resilience";
export * from "./operation";
export * from "./chain/types";
export * from "./chain/rpc";
export * from "./chain/erc20";
export * from "./chain/uniswap";
export * from "./explorer/blockscout";
export * from "./market/dexscreener";
export * from "./market/geckoterminal";
export * from "./social/types";
export * from "./social/fomoapi";
export * from "./solana/rpc";

export type Providers = {
  chain: ChainProvider;
  explorer: ExplorerProvider;
  market: MarketProvider;
  social: SocialProvider;
};

/** RPC endpoint selection: Alchemy when a key is configured, otherwise the public RPC. */
export function resolveRpc(env: ServerEnv): { url: string; source: "alchemy" | "rpc" } {
  if (env.ALCHEMY_API_KEY) {
    return {
      url: env.ALCHEMY_RPC_URL.replace("{key}", encodeURIComponent(env.ALCHEMY_API_KEY)),
      source: "alchemy",
    };
  }
  return { url: env.ROBINHOOD_RPC_URL, source: "rpc" };
}

let singleton: Providers | null = null;

export function createProviders(env: ServerEnv = serverEnv()): Providers {
  const chain = chainById(env.ROBINHOOD_CHAIN_ID);
  const rpc = resolveRpc(env);
  return {
    chain: new RpcChainProvider({ chain, url: rpc.url, sourceName: rpc.source }),
    explorer: new BlockscoutExplorerProvider(chain, env.BLOCKSCOUT_API_KEY),
    market: new DexscreenerMarketProvider(),
    social: new FomoApiSocialProvider(env.FOMO_API_KEY),
  };
}

export function getProviders(): Providers {
  if (!singleton) singleton = createProviders();
  return singleton;
}

const byChain = new Map<number, Providers>();

/**
 * Providers for a specific chain. The default (Robinhood Chain) is the singleton above; other EVM
 * chains get their own RPC client and budget (source "base-rpc") so they never eat Robinhood's.
 */
export function getChainProviders(chainId: number): Providers {
  const def = getProviders();
  if (chainId === def.chain.chain.id) return def;
  let p = byChain.get(chainId);
  if (!p) {
    const env = serverEnv();
    if (chainId !== BASE.id) throw new Error(`Unsupported chain id ${chainId}`);
    p = {
      chain: new RpcChainProvider({
        chain: BASE,
        url: process.env.BASE_RPC_URL || BASE.publicRpcUrl,
        sourceName: "base-rpc",
      }),
      explorer: new BlockscoutExplorerProvider(BASE, env.BLOCKSCOUT_API_KEY),
      market: def.market,
      social: def.social,
    };
    byChain.set(chainId, p);
  }
  return p;
}
