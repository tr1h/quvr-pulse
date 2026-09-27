# QUVR Pulse

**Risk intelligence for the memecoin flood — with an on-chain track record.**

QUVR Pulse checks a token in seconds — what the contract owner can still do, how deep the liquidity is, who holds the supply, what the creator is doing — and writes its risk labels to a public **Risk Oracle on Robinhood Chain**. A **Uniswap v4 hook** turns those labels into a speed bump: buying a token labelled *High risk* needs an explicit “I understand the risk”, while selling is never restricted.

- Live app: **https://quvrpulse.com** · Track record: https://quvrpulse.com/track-record · Oracle: https://quvrpulse.com/oracle
- X: [@quvrpulse](https://x.com/quvrpulse) · Telegram bot: [@quvrpulse_bot](https://t.me/quvrpulse_bot)
- Chains: **Robinhood Chain** (full transfer-history analysis), **Base**, **Solana**

> QUVR Pulse is an independent project, not affiliated with or endorsed by Robinhood, Coinbase, the Solana Foundation, Uniswap or Fomo. Labels describe detected risk signs; they never mean a token is “safe”. Not investment advice.

## Why

Launching a token takes a minute. On Robinhood Chain, launchpads create tens of thousands of tokens a day, and many disappear within hours. Most buyers cannot read a contract or see who holds the supply. Existing scanners show a score — and nobody can check whether that score ever meant anything.

## What is different

1. **We publish our own track record.** A label is recorded the first time we check a token; after 1 h, 24 h and 7 days we measure what happened. Live numbers, including the ones that don't flatter us: [/track-record](https://quvrpulse.com/track-record).
2. **The record is on-chain.** `QuvrRiskOracle` stores each token's latest label plus the **first label time** and the **first “High” time**, which can never be overwritten — proof that a warning existed before whatever happened next.
3. **Composable.** Any contract, wallet or bot reads a label with one call; the Uniswap v4 hook enforces a warning at swap time.
4. **Independent.** No trading fees, no paid “verified” badges, no token. A label cannot be bought.
5. **Honest data.** Every number carries its source and time; missing data is shown as “No data”, never as zero.

## On-chain contracts (Robinhood Chain, chain id 4663)

| Contract | Address | Source |
|---|---|---|
| `QuvrRiskOracle` v2 | [`0x9c9b26441809625619512cdc106308d09030e365`](https://robinhoodchain.blockscout.com/address/0x9c9b26441809625619512cdc106308d09030e365) | [Sourcify — exact match](https://repo.sourcify.dev/4663/0x9c9b26441809625619512cdc106308d09030e365) |
| `QuvrRiskHook` (Uniswap v4) | [`0xaAd4bf6F7147969291b3586127E8aE458a958080`](https://robinhoodchain.blockscout.com/address/0xaAd4bf6F7147969291b3586127E8aE458a958080) | [Sourcify — exact match](https://repo.sourcify.dev/4663/0xaAd4bf6F7147969291b3586127E8aE458a958080) |
| `Create2Deployer` (mines the hook address) | [`0x8eac08f58fd4769c162452e8582cb0d1537b8b34`](https://robinhoodchain.blockscout.com/address/0x8eac08f58fd4769c162452e8582cb0d1537b8b34) | [Sourcify — exact match](https://repo.sourcify.dev/4663/0x8eac08f58fd4769c162452e8582cb0d1537b8b34) |

The hook points at the live Uniswap v4 PoolManager `0x8366a39cc670b4001a1121b8f6a443a643e40951`.

### QuvrRiskOracle

- `getAssessment(token)` / `getAssessments(tokens[])` — level (`Low`, `Elevated`, `High`, `Insufficient`), three 0–100 scores (`255` = no data), red-flag bitmask, `updatedAt`, `firstLabeledAt`, `firstHighAt`, `labelCount`.
- `isHighRisk(token, maxAge) → (known, high)` — one call for integrators; stale or missing labels are “unknown”, never “low risk”.
- `respond(token, message)` — a public reply to a label (e.g. from the token team), stored as an event.
- Only whitelisted publishers write; ownership moves in two steps and cannot be renounced (so a compromised publisher can always be revoked). The contract never holds ETH.

### QuvrRiskHook

```solidity
// beforeSwap: the token leaving the pool is the one being bought
if (oracle.isHighRisk(token, 3 days) == (true, true)) {
    require(hookData == abi.encode(keccak256("QUVR_RISK_ACKNOWLEDGED")));
}
```

- **Selling is never restricted** — nobody gets trapped in a position.
- No label, a label older than 3 days, `Insufficient` data or an oracle failure → the pool behaves normally.
- No owner, no fees, no storage; permissions are encoded in the address (`beforeSwap` only, mined with CREATE2).

## Architecture

```
apps/web           Next.js 15 (App Router): pages + API. External APIs are called server-side only
apps/worker        BullMQ jobs: market 15 s, holders/alerts 5 min, outcomes 5 min, oracle publisher 10 min
apps/telegram      grammY bot: /scan, /watch, auto-checks addresses posted in groups, inline mode
packages/providers RPC / Blockscout / Dexscreener / GeckoTerminal / Solana / Fomo + rate limits, circuit breakers
packages/scoring   pure functions: bytecode analysis, 4 scores, holder clusters, price impact, track record
packages/services  report orchestration, SWR cache, persistence, outcomes, Risk Oracle publisher
packages/db        Prisma schema and migrations (PostgreSQL)
contracts          Hardhat: QuvrRiskOracle, QuvrRiskHook, Create2Deployer + tests
```

Flow: token address → contract / liquidity / holder / creator analysis → report with sourced values → baseline stored for the track record → label published to `QuvrRiskOracle` (liquid Robinhood Chain tokens, every 10 min, one label per window at the default 144/day cap) → read by the site, integrators and the Uniswap v4 hook.

## Tests

```bash
npm test                              # 143 unit tests (scoring, providers, services, bot, web)
cd contracts && npx hardhat test      # 33 contract tests, incl. the hook on the real Uniswap v4 PoolManager
FORK=1 npx hardhat test test/fork.robinhood.ts   # hook + live PoolManager + deployed oracle on a mainnet fork
```

Contract tests cover labels and history, validation and boundaries, batch atomicity, freshness, a compromised publisher, ownership mistakes, and the hook with a real pool, liquidity and swaps (buy blocked without acknowledgement, allowed with it, sells always allowed, stale/insufficient labels ignored).

## Run locally

Requires Node.js ≥ 20.11 and Docker.

```bash
npm install
docker compose up -d     # PostgreSQL :5433, Redis :6380
npm run dev              # web + worker + bot
```

Open http://localhost:3000. API keys are optional — without them the app runs in on-chain-only mode (public RPC + Dexscreener). See `.env.example`.

More: [methodology](docs/SCORING.md) · [data sources and limits](docs/DATA_SOURCES.md) · [security](docs/SECURITY.md) · [Русская версия](docs/README.ru.md)

## Principles

- Read-only towards users: no wallet connection, no user keys, no trading on anyone's behalf. The only transactions are the oracle's own label writes, signed by a server key that never leaves the server.
- Never “safe”: labels are *Low detected risk*, *Elevated risk*, *High risk* or *Insufficient data*.
- “Possibly related wallets” is a heuristic, never a claim of common ownership.
