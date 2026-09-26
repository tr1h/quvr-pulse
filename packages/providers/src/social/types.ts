export type SocialTrendingToken = {
  rank: number;
  address: string;
  name: string | null;
  symbol: string | null;
  chain: string | null;
  holders: number | null;
  priceUsd: number | null;
  change24h: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
};

export type SocialThesis = {
  id: string;
  tradeId: string | null;
  handle: string;
  displayName: string | null;
  userId: string | null;
  text: string;
  createdAt: string;
  likes: number | null;
  isDev: boolean | null;
  tradeUsd: number | null;
  tokenAddress: string | null;
  chain: string | null;
};

export type SocialUser = {
  handle: string;
  userId: string | null;
  displayName: string | null;
  verified: boolean | null;
  evmWallet: string | null;
  pnlUsdAll: number | null;
  trades: number | null;
  averageHoldTimeSeconds: number | null;
};

export type SocialTrade = {
  tradeId: string | null;
  tokenAddress: string | null;
  chain: string | null;
  side: "buy" | "sell" | null;
  status: "open" | "closed" | null;
  sizeUsd: number | null;
  realizedPnlUsd: number | null;
  openedAt: string | null;
  closedAt: string | null;
};

export type SocialAlert = {
  eventId: string;
  type: "buy" | "sell" | "thesis" | "other";
  handle: string | null;
  userId: string | null;
  tokenAddress: string | null;
  chainId: number | null;
  tradeUsd: number | null;
  /** Signed realized PnL on sells, when reported. */
  realizedPnlUsd: number | null;
  tradeId: string | null;
  /** Thesis body (for thesis alerts), sanitized plain text. */
  text: string | null;
  tokenSymbol: string | null;
  /** Buffered history sent on connect. */
  replay: boolean;
  at: string;
};

export type SocialLeaderboardTrader = {
  handle: string;
  userId: string | null;
  displayName: string | null;
  evmWallet: string | null;
};

export interface SocialProvider {
  readonly name: string;
  isEnabled(): boolean;
  getTrendingTokens(chain: string, limit?: number): Promise<SocialTrendingToken[]>;
  /** network "sol" for Solana mints (Robinhood is not covered by this endpoint). */
  getTokenTheses(token: string, limit?: number, network?: "sol"): Promise<SocialThesis[]>;
  getUserTheses(handle: string, limit?: number): Promise<SocialThesis[]>;
  /** Recent theses across all tokens of one chain (global feed). */
  getRecentTheses(chain: string, limit?: number): Promise<SocialThesis[]>;
  getUser(handle: string): Promise<SocialUser | null>;
  /** Ranked traders with their reported wallets (250 credits per call). */
  getLeaderboard(window: "24h" | "7d" | "30d" | "all"): Promise<SocialLeaderboardTrader[]>;
  getUserTrades(handle: string): Promise<SocialTrade[]>;
  getTokenTrackedHolders(
    token: string,
  ): Promise<Array<{ handle: string; valueUsd: number | null }>>;
  /** Realtime alerts; returns an unsubscribe function. */
  subscribeAlerts(
    chain: string,
    onAlert: (a: SocialAlert) => void,
    onStatus?: (s: string) => void,
  ): () => void;
}
