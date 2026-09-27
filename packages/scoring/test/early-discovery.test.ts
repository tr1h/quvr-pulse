import { describe, expect, it } from "vitest";
import { earlyDiscovery, type EarlyDiscoveryInput } from "../src/early-discovery";

const now = new Date("2026-09-27T12:00:00Z");
const healthy: EarlyDiscoveryInput = {
  risk: "low",
  liquidityUsd: 100_000,
  marketCapUsd: 350_000,
  volume24hUsd: 300_000,
  buys24h: 1_300,
  sells24h: 700,
  pairCreatedAt: "2026-09-27T00:00:00Z",
  socialMomentum: 80,
  qualityAuthors: 5,
  signalAgeMinutes: 45,
  holderGrowth1h: 0.2,
  holderGrowth24h: 0.4,
  newWallets24h: 80,
  change1h: 20,
  change24h: 60,
  now,
};

describe("early discovery", () => {
  it("marks broad, early traction as a candidate", () => {
    const result = earlyDiscovery(healthy);
    expect(result.status).toBe("candidate");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.gate.passed).toBe(true);
    expect(result.coverage).toBe(1);
    expect(result.notPricePrediction).toBe(true);
  });

  it("never lets momentum override a high-risk gate", () => {
    const result = earlyDiscovery({ ...healthy, risk: "high" });
    expect(result.status).toBe("excluded");
    expect(result.gate.reasons).toContain("high-risk");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("does not publish a score when too much evidence is missing", () => {
    const result = earlyDiscovery({
      ...healthy,
      marketCapUsd: null,
      volume24hUsd: null,
      buys24h: null,
      sells24h: null,
      pairCreatedAt: null,
      socialMomentum: null,
      qualityAuthors: null,
      signalAgeMinutes: null,
      holderGrowth1h: null,
      holderGrowth24h: null,
      newWallets24h: null,
      change1h: null,
      change24h: null,
    });
    expect(result.status).toBe("insufficient");
    expect(result.score).toBeNull();
    expect(result.confidence).toBe("low");
  });

  it("excludes markets that are too thin to be actionable", () => {
    const result = earlyDiscovery({ ...healthy, liquidityUsd: 2_000 });
    expect(result.status).toBe("excluded");
    expect(result.gate.reasons).toContain("thin-liquidity");
  });

  it("keeps elevated-risk and manufactured-looking flow on watch", () => {
    const result = earlyDiscovery({
      ...healthy,
      risk: "elevated",
      volume24hUsd: 4_000_000,
      buys24h: 990,
      sells24h: 10,
      change1h: 180,
    });
    expect(result.status).toBe("watch");
    expect(result.gate.passed).toBe(false);
    expect(result.gate.reasons).toContain("elevated-risk");
    expect(result.score).toBeLessThan(70);
  });
});
