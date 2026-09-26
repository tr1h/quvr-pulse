import { describe, expect, it } from "vitest";
import {
  concentratedImpact,
  constantProductImpact,
  liquidityHealthScore,
  netNativeFlow,
  priceFromSqrt,
} from "../src/liquidity";

const base = {
  liquidityUsd: 50_000,
  marketCapUsd: 270_000,
  impacts: [
    { usd: 100, impactPct: 0.004 },
    { usd: 1000, impactPct: 0.038 },
    { usd: 5000, impactPct: 0.166 },
  ],
  impactsApproximate: true,
  poolAgeHours: 240,
  priceChange24hPct: -5,
  mainPoolShare: 1,
  pairCount: 1,
  liquidityTrendPct: null,
  now: new Date("2026-09-23T00:00:00Z"),
};

describe("price impact math", () => {
  it("constant product: small trades ≈ fee, grows with size", () => {
    const small = constantProductImpact(1_000_000, 1_000_000, 10, 0.003)!;
    const big = constantProductImpact(1_000_000, 1_000_000, 100_000, 0.003)!;
    expect(small).toBeCloseTo(0.003, 3);
    expect(big).toBeGreaterThan(0.09);
    expect(constantProductImpact(0, 1, 1)).toBeNull();
  });

  it("concentrated: matches live measurement on the reference pool (within-tick)", () => {
    // Values read from the Robinhood Chain v4 pool on 2026-09-23 (see docs/DATA_SOURCES.md).
    const sqrtPriceX96 = 244846926528738609157238721478488n;
    const liquidity = 29277002188455995609171n;
    const priceUsd = 0.0002841;
    const imp = (usd: number) =>
      concentratedImpact({
        sqrtPriceX96,
        liquidity,
        amountInRaw: (usd / priceUsd) * 1e18,
        zeroForOne: false,
        feePpm: 0,
      })!;
    expect(imp(100)).toBeCloseTo(0.00388, 4);
    expect(imp(1000)).toBeCloseTo(0.0374, 3);
    expect(imp(5000)).toBeGreaterThan(imp(1000));
    expect(priceFromSqrt(sqrtPriceX96, false, 18, 18)).toBeCloseTo(1.047e-7, 9);
  });

  it("concentrated: LP fee is added on top", () => {
    const args = {
      sqrtPriceX96: 2n ** 96n,
      liquidity: 10n ** 24n,
      amountInRaw: 1e18,
      zeroForOne: true,
    };
    const noFee = concentratedImpact({ ...args, feePpm: 0 })!;
    const withFee = concentratedImpact({ ...args, feePpm: 3000 })!;
    expect(withFee - noFee).toBeCloseTo(0.003, 3);
  });

  it("net flow counts native paid in as positive inflow (buys)", () => {
    const swaps = [
      { amount0: -(10n ** 18n), amount1: 5n, sqrtPriceX96: 1n, timestamp: 100, blockNumber: 1 }, // buy: paid 1 ETH
      { amount0: 4n * 10n ** 17n, amount1: -5n, sqrtPriceX96: 1n, timestamp: 200, blockNumber: 2 }, // sell: got 0.4 ETH
    ];
    const f = netNativeFlow(swaps, true);
    expect(f.netNative).toBeCloseTo(0.6, 6);
    expect(f.buys).toBe(1);
    expect(f.sells).toBe(1);
    expect(netNativeFlow(swaps, true, 18, 150).buys).toBe(0);
  });
});

describe("liquidityHealthScore", () => {
  it("scores a mid-size, week-old pool reasonably", () => {
    const s = liquidityHealthScore(base);
    expect(s.value).toBeGreaterThan(60);
    expect(s.coverage).toBe(0.85); // trend needs snapshot history
    expect(s.confidence).toBe("medium"); // impacts are approximate
    expect(s.components.find((c) => c.id === "trend")!.points).toBeNull();
  });

  it("thin liquidity relative to market cap lowers the score", () => {
    const thin = liquidityHealthScore({
      ...base,
      liquidityUsd: 2_000,
      impacts: [{ usd: 1000, impactPct: 0.4 }],
    });
    expect(thin.value!).toBeLessThan(liquidityHealthScore(base).value!);
    expect(thin.level).toBe("high");
  });

  it("falling liquidity reduces the trend component", () => {
    const stable = liquidityHealthScore({ ...base, liquidityTrendPct: 0 });
    const falling = liquidityHealthScore({ ...base, liquidityTrendPct: -30 });
    expect(stable.components.find((c) => c.id === "trend")!.points).toBe(15);
    expect(falling.components.find((c) => c.id === "trend")!.points!).toBeLessThan(5);
  });

  it("without any market data → insufficient, never zero", () => {
    const s = liquidityHealthScore({
      ...base,
      liquidityUsd: null,
      marketCapUsd: null,
      impacts: null,
      poolAgeHours: null,
      mainPoolShare: null,
    });
    expect(s.value).toBeNull();
    expect(s.level).toBe("insufficient");
  });
});
