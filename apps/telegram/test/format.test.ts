import { describe, expect, it } from "vitest";
import { sourced, unavailable, type TokenReport } from "@quvr/shared";
import { formatScanMessage } from "../src/index";

const score = (key: string, value: number | null, level: string) => ({
  key,
  value,
  level,
  confidence: "medium",
  reasons: [],
  components: [],
  penalties: [],
  coverage: 1,
  updatedAt: "",
});

describe("formatScanMessage", () => {
  it("escapes attacker-controlled names and shows 'нет данных' instead of zero", () => {
    const r = {
      address: "0x4b7d1e5ec6889e63e70d39561edf925095dbed88",
      checksumAddress: "0x4B7d1E5ec6889e63e70D39561edf925095dbed88",
      chainName: "Robinhood Chain",
      mode: "onchain-only",
      token: { name: sourced("<b>Evil</b>", "rpc"), symbol: sourced("E&V", "rpc") },
      market: {
        priceUsd: sourced(0.0002574, "dexscreener"),
        marketCapUsd: unavailable("dexscreener", "down"),
        liquidityUsd: sourced(48928, "dexscreener"),
      },
      scores: {
        contractSafety: score("contractSafety", 90, "low"),
        liquidityHealth: score("liquidityHealth", 60, "elevated"),
        distributionHealth: score("distributionHealth", null, "insufficient"),
        socialMomentum: score("socialMomentum", null, "insufficient"),
      },
      findings: [{ severity: "high", title: { ru: "Риск <x>", en: "" } }],
    } as unknown as TokenReport;
    const msg = formatScanMessage(r, "http://localhost:3000");
    expect(msg).toContain("&lt;b&gt;Evil&lt;/b&gt;");
    expect(msg).toContain("E&amp;V");
    expect(msg).toContain("Капитализация: нет данных");
    expect(msg).toContain("недостаточно данных");
    expect(msg).toContain("низкий обнаруженный риск");
    expect(msg).not.toMatch(/безопасно/i);
    expect(msg).toContain("Риск &lt;x&gt;");
    expect(msg).toContain("/token/0x4b7d1e5ec6889e63e70d39561edf925095dbed88");
  });
});
