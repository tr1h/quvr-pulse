import { getProviders } from "@quvr/providers";
import { refreshAuthorsFor } from "./scan/social";
import { activeTokens } from "./watchlist";
import { installFomoCreditGuard } from "./fomo-credits";

// Every process using services (web, worker, bot) shares the same daily credit budget.
installFomoCreditGuard();

export * from "./alerts";
export * from "./cache";
export * from "./candles";
export * from "./discovery";
export * from "./market-refresh";
export * from "./persistence";
export * from "./radar";
export * from "./ratelimit";
export * from "./redis";
export * from "./retention";
export * from "./rug-report";
export * from "./track-record";
export * from "./daily-post";
export * from "./public-stats";
export * from "./oracle";
export * from "./outcomes";
export * from "./clones";
export * from "./chain-resolve";
export * from "./stats";
export * from "./reports";
export * from "./status";
export * from "./telegram-send";
export * from "./watchlist";
export * from "./fomo-credits";
export * from "./onchain/author-wallets";
export * from "./onchain/author-trades";
export { getAuthorStats } from "./scan/social";
export { buildTokenReport, mergeWithPrevious } from "./scan/report";
export { buildSolanaTokenReport } from "./scan/solana-report";

/** Worker job (15 min): refresh author statistics for all active tokens. */
export async function getAuthorStatsForActive(): Promise<number> {
  return refreshAuthorsFor(getProviders().social, await activeTokens());
}
