import { describe, expect, it } from "vitest";
import type { RiskFinding, RiskLevel, ScoreResult } from "@quvr/shared";
import { riskVerdict, type VerdictInput } from "../src/verdict";

const score = (level: RiskLevel): ScoreResult => ({
  key: "contractSafety",
  value: level === "insufficient" ? null : 70,
  confidence: "medium",
  level,
  reasons: [],
  components: [],
  penalties: [],
  coverage: 1,
  updatedAt: "2026-09-24T00:00:00Z",
});
const input = (l: [RiskLevel, RiskLevel, RiskLevel], extra: Partial<VerdictInput> = {}) =>
  ({
    scores: {
      contractSafety: score(l[0]),
      liquidityHealth: score(l[1]),
      distributionHealth: score(l[2]),
    },
    findings: [],
    priceChange24h: null,
    buys24h: null,
    sells24h: null,
    liquidityUsd: null,
    marketCapUsd: null,
    volume24hUsd: null,
    ...extra,
  }) satisfies VerdictInput;

describe("riskVerdict", () => {
  it("worst risk score wins", () => {
    expect(riskVerdict(input(["low", "high", "low"])).level).toBe("high");
    expect(riskVerdict(input(["low", "elevated", "low"])).level).toBe("elevated");
    expect(riskVerdict(input(["low", "low", "low"])).level).toBe("low");
  });

  it("missing data is never reported as low risk", () => {
    expect(riskVerdict(input(["low", "insufficient", "low"])).level).toBe("elevated");
    expect(riskVerdict(input(["insufficient", "insufficient", "low"])).level).toBe("insufficient");
  });

  it("never says buy, sell or safe", () => {
    for (const l of ["low", "elevated", "high", "insufficient"] as RiskLevel[]) {
      const v = riskVerdict(input([l, l, l]));
      expect(v.headline.ru).not.toMatch(/безопасн|покупай|продавай/i);
      expect(v.headline.en).not.toMatch(/\bsafe\b|\bbuy\b|\bsell\b/i);
    }
  });

  it("lists critical/high findings first and flags market facts", () => {
    const f = (code: string, severity: RiskFinding["severity"]): RiskFinding => ({
      code,
      category: "liquidity",
      severity,
      title: { ru: code, en: code },
      explanation: { ru: "", en: "" },
      evidence: [],
      source: "test",
      confidence: "high",
    });
    const v = riskVerdict(
      input(["low", "low", "low"], {
        findings: [f("a", "medium"), f("b", "high"), f("c", "critical")],
        priceChange24h: 150,
        buys24h: 30,
        sells24h: 70,
        liquidityUsd: 10_000,
        marketCapUsd: 1_000_000,
        volume24hUsd: 100,
      }),
    );
    expect(v.redFlags.map((x) => x.ru)).toEqual(["c", "b"]);
    const tones = v.market.map((m) => m.tone);
    expect(tones.filter((t) => t === "negative")).toHaveLength(4); // pump, sells, thin liq, no volume
  });
});
