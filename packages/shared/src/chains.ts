export type ChainConfig = {
  id: number;
  key: "robinhood" | "robinhood-testnet" | "solana" | "base";
  /** "evm" chains use 0x addresses (stored lowercase); Solana uses case-sensitive base58. */
  family: "evm" | "solana";
  name: string;
  nativeSymbol: "ETH" | "SOL";
  publicRpcUrl: string;
  explorerUrl: string;
  /** Dexscreener chain slug; testnet is not indexed by Dexscreener. */
  dexscreenerChainId: string | null;
  /** Uniswap v4 PoolManager, discovered on-chain from Swap logs (see docs/DATA_SOURCES.md). */
  uniswapV4PoolManager: `0x${string}` | null;
};

export const ROBINHOOD_MAINNET: ChainConfig = {
  id: 4663,
  key: "robinhood",
  family: "evm",
  name: "Robinhood Chain",
  nativeSymbol: "ETH",
  publicRpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  explorerUrl: "https://robinhoodchain.blockscout.com",
  dexscreenerChainId: "robinhood",
  uniswapV4PoolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
};

export const ROBINHOOD_TESTNET: ChainConfig = {
  id: 46630,
  key: "robinhood-testnet",
  family: "evm",
  name: "Robinhood Chain Testnet",
  nativeSymbol: "ETH",
  publicRpcUrl: "https://rpc.testnet.chain.robinhood.com",
  explorerUrl: "https://explorer.testnet.chain.robinhood.com",
  dexscreenerChainId: null,
  uniswapV4PoolManager: null,
};

/** Base (Coinbase L2). Holders come from its public Blockscout; see docs/DATA_SOURCES.md. */
export const BASE: ChainConfig = {
  id: 8453,
  key: "base",
  family: "evm",
  name: "Base",
  nativeSymbol: "ETH",
  publicRpcUrl: "https://mainnet.base.org",
  explorerUrl: "https://base.blockscout.com",
  dexscreenerChainId: "base",
  uniswapV4PoolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
};

/** EVM chains with the same 0x address format, in resolution priority order. */
export const EVM_CHAINS = [ROBINHOOD_MAINNET, BASE] as const;

/** Stable slug of a chain for URLs, caches and third-party APIs (Dexscreener, GeckoTerminal). */
export function chainSlug(chainId: number): "robinhood" | "base" | "solana" {
  if (chainId === SOLANA.id) return "solana";
  if (chainId === BASE.id) return "base";
  return "robinhood";
}

/** Solana has no EVM chain id; 1399811149 is the network id used by Fomo/FomoAPI and Codex. */
export const SOLANA: ChainConfig = {
  id: 1399811149,
  key: "solana",
  family: "solana",
  name: "Solana",
  nativeSymbol: "SOL",
  publicRpcUrl: "https://api.mainnet-beta.solana.com",
  explorerUrl: "https://solscan.io",
  dexscreenerChainId: "solana",
  uniswapV4PoolManager: null,
};

export function chainById(id: number): ChainConfig {
  if (id === SOLANA.id) return SOLANA;
  if (id === ROBINHOOD_TESTNET.id) return ROBINHOOD_TESTNET;
  if (id === ROBINHOOD_MAINNET.id) return ROBINHOOD_MAINNET;
  if (id === BASE.id) return BASE;
  throw new Error(`Unsupported chain id ${id}`);
}

/** Robinhood Chain produces ~10 blocks per second (measured, see docs/DATA_SOURCES.md). */
export const APPROX_BLOCKS_PER_SECOND = 10;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const BURN_ADDRESSES: readonly string[] = [
  ZERO_ADDRESS,
  "0x000000000000000000000000000000000000dead",
  "0xdead000000000000000042069420694206942069",
];

export function explorerLinks(chain: Pick<ChainConfig, "explorerUrl" | "family">) {
  const addr = chain.family === "solana" ? "account" : "address";
  return {
    address: (a: string) => `${chain.explorerUrl}/${addr}/${a}`,
    token: (a: string) => `${chain.explorerUrl}/token/${a}`,
    tx: (h: string) => `${chain.explorerUrl}/tx/${h}`,
  };
}
