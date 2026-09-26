# Data sources — verified behaviour and limitations

Verified live on **2026-09-23** against the reference token
`0x4b7d1e5ec6889e63e70d39561edf925095dbed88` (RHTools / TOOLS). Re-run at any time:

```bash
npm run probe -- 0x4b7d1e5ec6889e63e70d39561edf925095dbed88
```

Every value the app shows is wrapped in `SourcedValue<T>` (`source`, `fetchedAt`, `isStale`,
`confidence`, optional `sourceUrl` / `error` / `approximate`). A failed source yields
`value: null` with an `error` — the UI renders “Нет данных / No data”, never `0`.

## Summary

| Source                                            | Interface          | Status without keys     | Used for                                                           |
| ------------------------------------------------- | ------------------ | ----------------------- | ------------------------------------------------------------------ |
| Robinhood RPC (`rpc.mainnet.chain.robinhood.com`) | `ChainProvider`    | ✅ works                | code, eth_call, logs, receipts, pool state, simulation             |
| Alchemy (optional, `ALCHEMY_API_KEY`)             | `ChainProvider`    | —                       | drop-in replacement for the RPC                                    |
| Blockscout (`robinhoodchain.blockscout.com`)      | `ExplorerProvider` | ⛔ blocked for servers  | verification, ABI, source, creator, holders count, funding history |
| Blockscout PRO API (`api.blockscout.com/4663`)    | `ExplorerProvider` | ⛔ HTTP 402 without key | same as above, with `BLOCKSCOUT_API_KEY`                           |
| Dexscreener (`api.dexscreener.com`)               | `MarketProvider`   | ✅ works                | pairs, price, mcap/FDV, liquidity, volume, txns, links             |
| FomoAPI.io (`api.fomoapi.io`)                     | `SocialProvider`   | ⛔ HTTP 401 without key | trending, theses, traders, trades, tracked holders, WS alerts      |

## 1. Robinhood Chain RPC

Measured facts:

- `eth_chainId` → `0x1237` (4663). Arbitrum Orbit/Nitro chain: blocks carry `l1BlockNumber`.
- Block rate ≈ **10 blocks/s** (≈100 ms). Head was ~70.5M blocks on the probe date.
- **Not an archive node**: historical state is unavailable
  (`historical state … is not available`). Consequences:
  - no historical `eth_getCode`/`eth_call` → creation block cannot be binary-searched;
  - historical balances are reconstructed from `Transfer` logs instead.
- `eth_getLogs`: works over wide ranges but returns **at most 10 000 logs per query**
  (`logs matched by query exceeds limit of 10000`); very broad unfiltered queries may
  `log query timed out`. → `getLogsPaginated` splits ranges adaptively (bisection).
- `debug_traceCall` / `debug_*`: **not available** (`-32601`). No call tracing.
- `eth_getBlockReceipts`: available.
- `eth_call` **state overrides**: supported.
- JSON-RPC batch requests: supported (used by `callMany`).

Creator detection without an explorer: the first `Transfer` from `0x0` (mint) is found with a
single topic-filtered `eth_getLogs` over the full range; its transaction's `from` is the
deployer and `to` is the factory. For the test token: factory `0xe33e9e47…2948`, creator
`0xf8e91d71…95af`, 1B supply minted to launchpad/bonding-curve contract `0x835c720c…63d2`
(with a 0.01 ETH creator buy in the same transaction).

### Uniswap v4 on Robinhood Chain

- Dexscreener pairs for the test token are **Uniswap v4** — `pairAddress` is a 32-byte
  **poolId**, not a contract.
- PoolManager (singleton): **`0x8366a39cc670b4001a1121b8f6a443a643e40951`** (discovered from
  `Swap` logs filtered by poolId).
- Pool state is read via `extsload` using v4-core `StateLibrary` layout
  (`pools` mapping at slot 6, liquidity at offset 3). **Verified**: `sqrtPriceX96` read from
  storage exactly equals the latest `Swap` event, and the derived price equals
  Dexscreener `priceNative`.
- Main TOOLS pool: ETH/TOOLS, `fee = 0` in PoolKey, tickSpacing 200, **hooks contract
  `0xe5e70264…e044`** — hook logic may charge its own fees, so price impact is an estimate.
- The PoolManager holds tokens for **all** v4 pools, so it is excluded from holder
  concentration and shown separately.

## 2. Blockscout

- Public API `https://robinhoodchain.blockscout.com/api/v2/*` returns **HTTP 403 with a
  Cloudflare browser challenge** (“Just a moment…”) to server-side clients regardless of
  User-Agent. Solving or bypassing bot protection is explicitly out of scope — the adapter
  reports `blocked` and the UI shows “Нет данных”.
- PRO API `https://api.blockscout.com/4663/api/v2/*` answers **HTTP 402**
  `Proceed with API key or make a X402 payment` → set `BLOCKSCOUT_API_KEY`.
- Without a key, the app falls back to RPC for: contract/non-contract, creator (mint log),
  bytecode analysis, proxy slots (EIP-1967/1167), owner, holders (log replay).
  Unavailable without a key: source verification, source code, ABI, bytecode-vs-source diff,
  “common funding source” and “same contract set” wallet heuristics.
- Direct links to Blockscout pages are always shown (they work in a browser).

## 3. Dexscreener

- `GET /tokens/v1/robinhood/{address}` → array of pairs (chain slug **`robinhood`**).
  Fields used: `pairAddress, dexId, labels, baseToken, quoteToken, priceUsd, priceNative,
txns.{m5,h1,h6,h24}, volume.*, priceChange.*, liquidity.{usd,base,quote}, fdv, marketCap,
pairCreatedAt, info.{imageUrl,websites,socials}`.
- `priceChange.m5` can be absent — kept as `null`.
- The number of pairs returned can change between calls (3 pairs, later 1 pair, minutes
  apart). We never treat a missing pair as zero liquidity; liquidity trend is computed only
  from our own snapshots.
- Documented limit 300 req/min for pair endpoints; the client budget is ~4 req/s.
- Testnet is not indexed.

## 4. FomoAPI.io (social)

- Independent, **unofficial** provider; not affiliated with fomo.family. Base
  `https://api.fomoapi.io`, `authorization: Bearer <FOMO_API_KEY>` (server-side only).
- Without a key every data endpoint returns 401 → app runs in **`onchain-only`** mode.
- Endpoints used: `/v2/leaderboard/tokens/trending`, `/v2/thesis/token/{address}`,
  `/v2/thesis/user/{handle}`, `/v2/users/{handle}`, `/v2/users/{handle}/trades`,
  `/token/{address}/holders`, WebSocket `wss://api.fomoapi.io/ws/alerts?chain=robinhood`.
- Credit-metered (leaderboard/ordinary read 250, thesis page 1 250, wallet resolution 2 500
  credits; free tier 250 000/month). Client budget is 1 request / 2 s plus Redis caching.
- Trade history from the provider is explicitly **not complete**; author statistics carry
  the sample size and confidence.
- Never used: `prod-api.fomo.family`, user cookies/bearer tokens, private endpoints.

### FomoAPI behaviour measured with a live key (2026-09-23, free plan)

| Endpoint                            | Real behaviour                                                                                                                                                                              | How we handle it                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/v2/leaderboard/tokens/trending`   | `network` is a **numeric chain id** (4663 = Robinhood, 1399811149 = Solana, 56, 8453, 1). About 10 of 50 rows are Robinhood                                                                 | filter `network === 4663`                                                                  |
| `/v2/thesis/token/{address}`        | **Does not cover Robinhood**: the `network` enum is sol/bnb/base/eth/arc and Robinhood tokens always return `available:false` (0 credits)                                                   | still called (free when empty), merged with stored theses                                  |
| `/v2/thesis?chain=robinhood`        | Works: global Robinhood feed with `token.address`, `tradeId`, `networkId: 4663`. 1 250 credits per call (43 theses returned for `limit=100`)                                                | worker job `theses-feed` at startup and every `FOMO_FEED_POLL_HOURS` (12)                  |
| `wss://…/ws/alerts?chain=robinhood` | **Free**, realtime. On connect it replays recent buffered events. `alertType` buy/sell/thesis, `trader`, `tokenAddress`, `text` ("X posted a thesis on $SYM: …"), `realizedPnlUsd` on sells | worker stores theses → `Thesis`, trades → `TradeSignal`                                    |
| `/v2/users/{handle}`                | 2 500 credits, answered in **~45 s**, and is billed even if the client times out                                                                                                            | not used in scans; trader page only (90 s timeout, no retry, 24 h cache)                   |
| `/v2/users/{handle}/trades`         | 250 credits; repeatedly returned **502/503 "FOMO did not answer"** (not billed)                                                                                                             | retried; fallback: author stats from realized sells on the stream (low confidence, no ROI) |

Credit budget knobs: `FOMO_STATS_REFRESH_MINUTES` (default 360), `FOMO_MAX_AUTHORS_PER_TOKEN`
(default 3), `FOMO_FEED_POLL_HOURS` (default 12). The whole live verification above used
8 500 of 250 000 monthly credits.

## Refresh cadence (worker)

| Data                                                  | Period                 |
| ----------------------------------------------------- | ---------------------- |
| Price & liquidity (watched / recently scanned tokens) | 15 s                   |
| Social WebSocket alerts                               | realtime               |
| Holder distribution                                   | 5 min                  |
| Trader statistics                                     | 15 min                 |
| Bytecode analysis                                     | once per new code hash |
| Social links                                          | 6 h                    |
| New v4 pools (Initialize events)                      | 60 s                   |

## Resilience

All outbound calls go through `withResilience`: per-attempt timeout (AbortController),
retry with exponential backoff + full jitter (retryable errors only), per-source circuit
breaker (5 failures → open 30 s → half-open), token-bucket rate limiting, and latency /
success metrics exported to `/admin/status` (admin key only). Outbound hosts are allowlisted (SSRF guard), redirects
are refused, bodies are size-capped. API keys are redacted from logs.

## Solana (added 2026-09-23)

Addresses are detected by format: `0x…` → Robinhood Chain, base58 (32 bytes) → Solana. Solana
addresses are case-sensitive and are **never lowercased** (EVM ones are).

| Data                                                                                                                                                                | Source                                            | Status                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mint safety: mint/freeze authority, Token-2022 extensions (transfer fee + authority, transfer hook, permanent delegate, non-transferable, default-frozen, pausable) | public RPC `getAccountInfo` (jsonParsed)          | ✅                                                                                                                                                                             |
| Price, market cap, liquidity, volume, pools                                                                                                                         | Dexscreener `/tokens/v1/solana/{mint}`            | ✅ (PumpSwap/Raydium/pump.fun = constant product → price impact estimate; CLMM/DLMM/Orca → not x*y=k, impact "no data")                                                        |
| Top holders                                                                                                                                                         | `getTokenLargestAccounts` + `getMultipleAccounts` | ⚠️ **blocked on free public RPCs** (method-level 429 on mainnet-beta, "personal token" on PublicNode, paid-only on dRPC) → set `SOLANA_RPC_URL` (Helius / Alchemy / QuickNode) |
| Pool/curve vaults                                                                                                                                                   | owner is a PDA (off the ed25519 curve)            | excluded from concentration                                                                                                                                                    |
| Fomo theses                                                                                                                                                         | FomoAPI `/v2/thesis/token/{mint}?network=sol`     | ✅ 1 250 credits when theses exist, 0 when none; cached 1 h                                                                                                                    |
| Holder count, creator, related wallets, holder growth, sell simulation, on-chain price history                                                                      | —                                                 | not implemented yet → "No data"                                                                                                                                                |

Contract Safety reuses the EVM scoring: SPL Token / Token-2022 are standard audited programs
(verified), authorities replace "owner", and extensions map to capabilities (mint, freeze →
blacklist, fee change, transfer restriction, permanent delegate → balance modification).

## GeckoTerminal (price candles)

- `GET api.geckoterminal.com/api/v2/networks/{robinhood|solana}/pools/{pool}/ohlcv/{minute|hour}` — USD OHLCV of the main pool (Robinhood v4 pools use the 32-byte pool id). Free, no key, ~30 req/min; client budget 3 burst / 0.4 req/s.
- Fetched server-side only (`services/candles.ts`), SWR-cached 60 s (24h frame) / 300 s (7d, 30d). If the source does not answer, the chart shows "Нет данных".
- The "Итог проверки" card (`scoring/verdict.ts`) summarises verifiable risk and current market facts. It is deliberately not a buy/sell signal or a price forecast.
