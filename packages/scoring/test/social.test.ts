import { describe, expect, it } from "vitest";
import {
  authorQuality,
  maxDrawdown,
  median,
  priceAt,
  socialMomentumScore,
  thesisOutcomes,
  wilsonLowerBound,
  type SocialThesisSignal,
} from "../src/social";

const NOW = new Date("2026-09-23T12:00:00Z");
const iso = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

describe("statistics helpers", () => {
  it("Wilson lower bound is conservative for small samples", () => {
    expect(wilsonLowerBound(1, 1)!).toBeLessThan(0.25);
    expect(wilsonLowerBound(60, 100)!).toBeGreaterThan(0.5);
    expect(wilsonLowerBound(60, 100)!).toBeLessThan(0.6);
    expect(wilsonLowerBound(0, 0)).toBeNull();
  });

  it("median and drawdown", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(maxDrawdown([100, -50, -80, 40])).toBe(130);
  });
});

describe("authorQuality", () => {
  const trade = (pnl: number, size = 100, daysAgo = 1) => ({
    sizeUsd: size,
    realizedPnlUsd: pnl,
    openedAt: new Date(NOW.getTime() - daysAgo * 86_400_000 - 3_600_000).toISOString(),
    closedAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  });

  it("a single lucky trade never gets a high rating", () => {
    const q = authorQuality({
      handle: "lucky",
      displayName: null,
      verified: null,
      evmWallet: null,
      trades: [trade(100_000, 100)],
      now: NOW,
    });
    expect(q.qualityTier).toBe("insufficient");
    expect(q.qualityScore!).toBeLessThanOrEqual(35);
    expect(q.bestTradeShare).toBe(1);
  });

  it("a consistent track record ranks above a one-hit wonder with more total profit", () => {
    const consistent = authorQuality({
      handle: "steady",
      displayName: null,
      verified: true,
      evmWallet: null,
      trades: Array.from({ length: 40 }, (_, i) => trade(i % 3 === 0 ? -20 : 30, 100, i % 20)),
      now: NOW,
    });
    const oneHit = authorQuality({
      handle: "onehit",
      displayName: null,
      verified: true,
      evmWallet: null,
      trades: [trade(50_000), ...Array.from({ length: 9 }, () => trade(-60))],
      now: NOW,
    });
    expect(consistent.realizedPnlUsd!).toBeLessThan(oneHit.realizedPnlUsd!);
    expect(consistent.qualityScore!).toBeGreaterThan(oneHit.qualityScore!);
    expect(consistent.qualityTier).toBe("high");
    expect(consistent.qualityConfidence).toBe("high");
    expect(consistent.avgHoldSeconds).toBeCloseTo(3600);
  });

  it("ignores open trades (no realized PnL)", () => {
    const q = authorQuality({
      handle: "x",
      displayName: null,
      verified: null,
      evmWallet: null,
      trades: [{ sizeUsd: 100, realizedPnlUsd: null, openedAt: iso(10), closedAt: null }],
      now: NOW,
    });
    expect(q.closedTrades).toBe(0);
    expect(q.qualityScore).toBeNull();
  });
});

describe("thesis outcomes without look-ahead", () => {
  const t0 = NOW.getTime() - 30 * 3_600_000;
  const series = [
    { t: t0 - 60_000, price: 1 },
    { t: t0 + 10 * 60_000, price: 1.1 },
    { t: t0 + 50 * 60_000, price: 1.3 },
    { t: t0 + 5 * 3_600_000, price: 0.9 },
    { t: t0 + 30 * 3_600_000, price: 5 }, // far future spike must not leak into 24h
  ];

  it("uses only data at or before each horizon", () => {
    const { entry, outcomes } = thesisOutcomes(t0, series, NOW.getTime());
    expect(entry).toBe(1);
    expect(outcomes["15m"]).toBeCloseTo(0.1);
    expect(outcomes["1h"]).toBeCloseTo(0.3);
    expect(outcomes["6h"]).toBeCloseTo(-0.1);
    expect(outcomes["24h"]).toBeCloseTo(-0.1);
  });

  it("marks horizons that have not elapsed as pending", () => {
    const { outcomes } = thesisOutcomes(NOW.getTime() - 30 * 60_000, series, NOW.getTime());
    expect(outcomes["15m"]).not.toBe("pending");
    expect(outcomes["1h"]).toBe("pending");
    expect(outcomes["24h"]).toBe("pending");
  });

  it("keeps a stored entry price instead of recomputing", () => {
    expect(thesisOutcomes(t0, series, NOW.getTime(), 2).entry).toBe(2);
  });

  it("priceAt returns null before the first observation", () => {
    expect(priceAt(series, t0 - 3_600_000)).toBeNull();
  });
});

describe("socialMomentumScore", () => {
  const sig = (
    handle: string,
    minutesAgo: number,
    extra: Partial<SocialThesisSignal> = {},
  ): SocialThesisSignal => ({
    authorHandle: handle,
    createdAt: iso(minutesAgo),
    authorTier: "high",
    authorQuality: 80,
    confirmedBuy: true,
    authorStillHolds: true,
    authorSold: false,
    authorWallet: null,
    ...extra,
  });

  it("is insufficient in onchain-only mode", () => {
    const s = socialMomentumScore({
      available: false,
      theses: [],
      deployerSelling: false,
      liquidityDeclining: false,
      washTradingSuspected: false,
      relatedAuthorShare: null,
      now: NOW,
    });
    expect(s.value).toBeNull();
    expect(s.level).toBe("insufficient");
  });

  it("many fresh theses from quality holders → strong momentum", () => {
    const theses = Array.from({ length: 10 }, (_, i) => sig(`a${i}`, 10 + i * 5));
    const s = socialMomentumScore({
      available: true,
      theses,
      deployerSelling: false,
      liquidityDeclining: false,
      washTradingSuspected: false,
      relatedAuthorShare: 0,
      now: NOW,
    });
    expect(s.value!).toBeGreaterThanOrEqual(80);
    expect(s.level).toBe("strong");
  });

  it("applies penalties: authors sold, developer selling, single-author hype", () => {
    const theses = [
      sig("solo", 5, { authorSold: true, authorStillHolds: false }),
      sig("solo", 10, { authorSold: true, authorStillHolds: false }),
      sig("solo", 15),
      sig("b", 20),
    ];
    const s = socialMomentumScore({
      available: true,
      theses,
      deployerSelling: true,
      liquidityDeclining: true,
      washTradingSuspected: false,
      relatedAuthorShare: null,
      now: NOW,
    });
    const labels = s.penalties.map((p) => p.label.en);
    expect(labels).toContain("Developer is selling");
    expect(labels).toContain("One author drives most hype");
    expect(labels).toContain("Liquidity declining");
    expect(labels).toContain("Authors already sold");
  });
});
