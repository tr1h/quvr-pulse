# Scoring methodology

Four independent 0–100 scores. They are not combined into a single “safe/unsafe”
number. Code lives in `packages/scoring` (pure functions, unit-tested).

## Common rules (`builder.ts`)

- Each score is a sum of components. A component that cannot be evaluated (missing data)
  is `null`: it is **excluded** and lowers `coverage` instead of counting as zero.
- Value = evaluated points ÷ evaluated max × 100 − penalties, clamped to 0..100.
- `coverage < 0.5` → value `null`, level **“Недостаточно данных / Insufficient data”**.
- Confidence: coverage ≥ 0.9 → high, ≥ 0.65 → medium, otherwise low; lowered further when
  inputs are heuristic or approximate.
- Risk levels (safety scores): ≥ 75 «Низкий обнаруженный риск», 50–74 «Повышенный риск»,
  < 50 «Высокий риск». Social Momentum uses strong / moderate / weak and is labeled
  “Momentum ≠ safety”.

## Contract Safety

| Component               | Max | Rule                                                                                                                                                                                                                      |
| ----------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verified source         | 10  | explorer `is_verified`; `null` without Blockscout                                                                                                                                                                         |
| No dangerous privileges | 30  | minus weights: mint 12, balance-modify 15, blacklist 10, trading-toggle 10, fee-change 8, pause 8, selfdestruct 10, delegatecall 6 (non-proxy), router change 4. ×0.25 if ownership renounced, ×2.5 if callable by anyone |
| Ownership/admin         | 20  | renounced/none 20 · timelock ≥ 24h 16 · multisig 12 · other contract 8 · EOA 6 (0 if privileges exist)                                                                                                                    |
| Sell simulation         | 20  | passed 20 · failed 0 · unavailable `null`                                                                                                                                                                                 |
| Proxy/upgrade           | 10  | not upgradeable 10 · timelocked 6 · otherwise 0                                                                                                                                                                           |
| Transfer restrictions   | 10  | none 10 · only renounced 7 · present 3                                                                                                                                                                                    |

A failed sell simulation caps the score at 20. Privileges are established from the
dispatcher (`PUSH4 selector; EQ`), not from function names in source. When the owner is
known, read-only `eth_call` probes run from the owner and from a random address; “callable
by anyone” counts as critical evidence.

## Liquidity Health

| Component              | Max | Rule                                                                        |
| ---------------------- | --- | --------------------------------------------------------------------------- |
| Liquidity / market cap | 30  | piecewise: 2% → 5, 5% → 15, 10% → 22, ≥ 20% → 30                            |
| Depth & price impact   | 30  | $1 000 sell impact: ≤ 1% → 30 … ≥ 40% → 0. Falls back to absolute liquidity |
| Age & stability        | 15  | pool age (≤ 10) + \|24h price change\| (≤ 5)                                |
| Pool distribution      | 10  | share of the main pool / number of pools                                    |
| Liquidity trend        | 15  | our own snapshots; `null` until ≥ 30 min of history                         |

## Distribution Health

| Component                | Max | Rule                                                         |
| ------------------------ | --- | ------------------------------------------------------------ |
| Top-holder concentration | 35  | top-10 share of circulating supply (−5 if top-1 > 20%)       |
| Deployer share           | 20  | 0% → 20 … ≥ 20% → 0                                          |
| Related clusters         | 20  | share held by possibly-related clusters (medium+ confidence) |
| Holder growth            | 10  | 24h change in holder count                                   |
| No mass transfers        | 15  | fan-out of one sender to ≥ 10 wallets within ~1 min          |

Excluded from concentration and shown separately: zero/burn addresses, the Uniswap v4
PoolManager, v2/v3 pairs, the launchpad (initial mint recipient) and router-like contracts.

## Social Momentum (requires `FOMO_API_KEY`)

| Component                 | Max |
| ------------------------- | --- |
| New thesis velocity (24h) | 20  |
| Unique authors            | 15  |
| Author quality            | 25  |
| Confirmed by real buys    | 20  |
| Authors still holding     | 10  |
| Signal freshness          | 10  |

Penalties: authors already sold (up to −15), developer selling (−15), liquidity declining
(−10), suspected wash trading (−10), most signals from related wallets (−10), one author
behind > 60% of the hype (−10).

### Author quality

Not ranked by total profit. Score = 35 × Wilson lower bound of win rate + median ROI (≤ 20)

- sample size (≤ 15, full at 30 trades) + (1 − best-trade share) × 10 + drawdown term (≤ 10)
- recency (≤ 10). Fewer than 5 closed trades → capped at 35 and “insufficient”; fewer than 10 →
  capped at 60.

### Thesis outcomes

The entry price is the last on-chain swap price at or before publication. It is stored
once and never recomputed. Each horizon (15m/1h/6h/24h) uses only prices at or before
publish + horizon. Horizons that have not elapsed yet are “pending”.
