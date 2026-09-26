# Arbitrum Open House Singapore — submission kit

Numbers below are live values from 2026-09-26; refresh them from the site before submitting.

## Project name
QUVR Pulse

## Tagline (≤ 100 chars)
A risk oracle for Robinhood Chain memecoins — with a provable track record and a Uniswap v4 risk hook

## Track
Open Category (Robinhood Chain)

## Short description (≈ 60 words)
QUVR Pulse checks any Robinhood Chain token in seconds — contract powers, liquidity, holder concentration, creator activity — and publishes its risk labels to an on-chain Risk Oracle. The first time a token is labelled High is stored forever, so our warnings are provable. A Uniswap v4 hook turns the labels into a speed bump: risky buys need an explicit acknowledgement, sells are never blocked.

## Problem
Launching a token takes a minute. On Robinhood Chain, launchpads create tens of thousands of tokens a day and many disappear within hours. Most buyers can't read a contract or see who holds the supply. Existing scanners show a score — but nobody can check whether the score ever meant anything, and nothing stops a buyer at the moment of the swap.

## Solution
1. **Scanner** (web, Telegram bot, soon API): bytecode analysis of owner powers (mint, pause, blacklist, fees, proxies — including correct handling of EIP-1167 launchpad clones), buy/sell simulation via `eth_call`, liquidity depth and price impact, holder concentration with pools/burn excluded, possibly related wallets, creator sells, ticker clones. Every value carries its source and time; missing data is "No data", never zero.
2. **Public track record**: labels are recorded the first time we check a token; after 1 h / 24 h / 7 d we measure what happened. Live: of 285 tokens labelled *High risk*, **79% were gone or down 90%+ within 24 hours**, vs 48% of 581 *Elevated* ones — https://quvrpulse.com/track-record
3. **QuvrRiskOracle** (Robinhood Chain): the server publishes labels of liquid tokens every 30 minutes (budget-capped). `firstLabeledAt` and `firstHighAt` can never be overwritten — proof a warning existed before the outcome. Any contract reads a label with `isHighRisk(token, maxAge)`; token teams can reply on-chain with `respond()`.
4. **QuvrRiskHook** (Uniswap v4): in pools that opt in, buying a token with a fresh *High* label requires `hookData = keccak256("QUVR_RISK_ACKNOWLEDGED")` — a wallet shows a warning first. Selling is never restricted; stale or missing labels never block anything; no owner, no fees.

## What's deployed (Robinhood Chain mainnet, chain id 4663)
- QuvrRiskOracle v2 — `0x9c9b26441809625619512cdc106308d09030e365` (Sourcify exact match)
- QuvrRiskHook — `0xaAd4bf6F7147969291b3586127E8aE458a958080` (Sourcify exact match; beforeSwap-only address mined via CREATE2; uses PoolManager `0x8366a39cc670b4001a1121b8f6a443a643e40951`)
- Create2Deployer — `0x8eac08f58fd4769c162452e8582cb0d1537b8b34`
- 60+ labels published for 50+ tokens so far

## Proof it works
- 33 contract tests, including the hook against Uniswap v4's real PoolManager with a real pool, liquidity and swaps; plus a mainnet-fork test with the live PoolManager and the deployed oracle.
- 143 unit tests for the scanner, scoring and services.
- Live product: 3,300+ tokens analyzed since Sep 24; ~1,000 new tokens a day on Robinhood Chain.

## What's novel
- A risk scanner whose accuracy is measured publicly and whose warnings are timestamped on-chain.
- Composable risk data on Robinhood Chain: one view call for wallets, bots, launchpads.
- A consent-based Uniswap v4 hook: protects buyers at swap time without censoring sells or bricking pools.

## Business model
API for trading bots, wallets and launchpads (free tier + paid plans, USDG accepted); Pro Telegram alerts (liquidity pulls, creator sells) paid in Stars; protection bot for large communities. No trading fees and no paid labels — trust is the product.

## Roadmap (after the buildathon)
Public API · Pro alerts · first launchpad/wallet integrations of the oracle and hook · whole-wallet checks · third-party audit of the contracts.

## Tech stack
Solidity 0.8.26/0.8.28, Uniswap v4 (core + periphery), OpenZeppelin, Hardhat + viem; Next.js 15, TypeScript, PostgreSQL/Prisma, Redis/BullMQ, grammY.

## Links
- App: https://quvrpulse.com · Oracle: https://quvrpulse.com/oracle · Track record: https://quvrpulse.com/track-record
- Code: https://github.com/tr1h/quvr-pulse
- X: https://x.com/quvrpulse · Telegram bot: https://t.me/quvrpulse_bot

---

## Demo video script (≈ 2:30)

Screen recording with voice-over (English). Keep the browser zoomed to 110–125 %.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:15 | quvrpulse.com home, live counters | "Launching a memecoin takes a minute. On Robinhood Chain about a thousand new tokens appear every day — and many vanish within hours. QUVR Pulse is a risk oracle for this flood." |
| 0:15–0:45 | Paste a Robinhood Chain token address → report: verdict, contract powers, holders, liquidity | "Paste any token. In seconds we show what the owner can still do, whether selling works, how deep the liquidity is and who holds the supply. Every number has a source; missing data says 'No data', never zero." |
| 0:45–1:10 | /track-record — 79 % vs 48 % | "Scores are cheap, so we grade ourselves. We record a label the first time we see a token and check again after 24 hours. Of the tokens we labelled High risk, 79 % were gone or down 90 % a day later." |
| 1:10–1:35 | Token page "Label recorded on Robinhood Chain" → Blockscout tx | "And the record is on-chain. Our Risk Oracle stores when a token was first labelled High, and that can never be changed — so our warnings are provable." |
| 1:35–2:10 | /oracle page: contracts, latest records, hook description; show `isHighRisk` snippet | "Any wallet, bot or launchpad can read a label with one call. And our Uniswap v4 hook turns it into a speed bump: buying a High-risk token needs an explicit 'I understand the risk'. Selling is never blocked, and missing data never blocks anything." |
| 2:10–2:30 | GitHub README, tests passing (terminal: `npx hardhat test`) | "Contracts are verified on Sourcify and tested against Uniswap v4's real PoolManager, including a mainnet fork. QUVR Pulse — check before you buy." |
