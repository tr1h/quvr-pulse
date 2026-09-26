import { describe, expect, it } from "vitest";
import { medianSellAfterThesis, reconstructTrades, type WalletLeg } from "../src/onchain-trades";

const H = 3_600_000;
const leg = (
  token: string,
  direction: "in" | "out",
  amount: number,
  quote: number | null,
  t: number,
): WalletLeg => ({
  token,
  direction,
  amount,
  quote,
  timestamp: t * H,
  txHash: `0x${token}${t}`,
});

describe("reconstructTrades", () => {
  it("round trip with profit: ROI and hold time from swaps", () => {
    const r = reconstructTrades([leg("a", "in", 1000, 1, 0), leg("a", "out", 1000, 1.5, 2)]);
    expect(r.closed).toHaveLength(1);
    expect(r.closed[0]!.pnlQuote).toBeCloseTo(0.5);
    expect(r.closed[0]!.roi).toBeCloseTo(0.5);
    expect(r.closed[0]!.holdSeconds).toBe(7200);
    expect(r.open).toHaveLength(0);
  });

  it("average cost across several buys and partial sells", () => {
    const r = reconstructTrades([
      leg("a", "in", 100, 1, 0),
      leg("a", "in", 100, 3, 1), // avg cost 2 per 100
      leg("a", "out", 100, 1, 2), // realized 1 - 2 = -1
      leg("a", "out", 100, 4, 3), // realized 4 - 2 = +2
    ]);
    expect(r.closed[0]!.costQuote).toBe(4);
    expect(r.closed[0]!.pnlQuote).toBeCloseTo(1);
    expect(r.closed[0]!.roi).toBeCloseTo(0.25);
  });

  it("keeps partially sold positions open", () => {
    const r = reconstructTrades([leg("a", "in", 100, 1, 0), leg("a", "out", 50, 0.8, 1)]);
    expect(r.closed).toHaveLength(0);
    expect(r.open[0]!.amount).toBe(50);
    expect(r.open[0]!.costQuote).toBeCloseTo(0.5);
  });

  it("treats dust (≤1% of peak) as closed", () => {
    const r = reconstructTrades([leg("a", "in", 1000, 1, 0), leg("a", "out", 995, 2, 1)]);
    expect(r.closed).toHaveLength(1);
  });

  it("excludes positions with unpriced transfers (airdrops / moves) from quality", () => {
    const r = reconstructTrades([leg("a", "in", 1000, null, 0), leg("a", "out", 1000, 5, 1)]);
    expect(r.closed).toHaveLength(0);
    expect(r.taintedClosed).toBe(1);
  });

  it("counts sells of tokens bought before the observed window", () => {
    const r = reconstructTrades([leg("a", "out", 10, 1, 0)]);
    expect(r.sellsWithoutHistory).toBe(1);
    expect(r.closed).toHaveLength(0);
  });

  it("a later re-entry is a new position", () => {
    const r = reconstructTrades([
      leg("a", "in", 10, 1, 0),
      leg("a", "out", 10, 2, 1),
      leg("a", "in", 10, 1, 5),
      leg("a", "out", 10, 0.5, 6),
    ]);
    expect(r.closed.map((c) => c.pnlQuote)).toEqual([1, -0.5]);
    expect(r.closed[1]!.openedAt).toBe(5 * H);
  });
});

describe("medianSellAfterThesis", () => {
  it("measures time from thesis to the first later sell of that token", () => {
    const legs = [leg("a", "in", 10, 1, 0), leg("a", "out", 10, 1, 3), leg("b", "out", 1, 1, 10)];
    expect(medianSellAfterThesis([{ token: "a", publishedAt: 1 * H }], legs)).toBe(7200);
    expect(medianSellAfterThesis([{ token: "c", publishedAt: 0 }], legs)).toBeNull();
  });
});
