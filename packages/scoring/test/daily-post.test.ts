import { describe, expect, it } from "vitest";
import { autopsyPost, dailyStatsPost } from "../src/daily-post";
import type { RugReportSummary } from "../src/rug-report";
import { xLength, X_LIMIT } from "../src/share";

const URL_ = "https://quvrpulse.com/token/0x21cfcfc3d8f98fc728f48341d10ad8283f6eb7ab";

const summary = (total: number): RugReportSummary => ({
  total,
  byChain: { "Robinhood Chain": total },
  verdicts: { high: 41, elevated: 38, low: 1, insufficient: total - 80 },
  flags: [
    { id: "concentrated", count: 52, share: 0.52 },
    { id: "thin-liquidity", count: 33, share: 0.33 },
  ],
  medianTop10: 0.71,
  medianLiquidityToMcap: 0.05,
  topTraded: [],
});

describe("daily post drafts", () => {
  it("builds a stats post that fits one X post", () => {
    const t = dailyStatsPost(summary(100), "Robinhood Chain", "https://quvrpulse.com/rug-report")!;
    expect(t).toContain("Robinhood Chain, last 24h on @quvrpulse:");
    expect(t).toContain("• 100 tokens checked");
    expect(t).toContain("41% High risk");
    expect(t).toContain("top holders own most of the supply (52%)");
    expect(t.endsWith("NFA")).toBe(true);
    expect(xLength(t, "https://quvrpulse.com/rug-report")).toBeLessThanOrEqual(X_LIMIT);
    expect(t.toLowerCase()).not.toContain("safe");
  });

  it("skips the stats post when there is too little data", () => {
    expect(dailyStatsPost(summary(5), "Base", "https://quvrpulse.com/rug-report")).toBeNull();
  });

  it("writes an autopsy with what we saw and what happened, within the limit", () => {
    const t = autopsyPost(
      {
        symbol: "RUG",
        address: "0x21cfcfc3d8f98fc728f48341d10ad8283f6eb7ab",
        chainName: "Robinhood Chain",
        verdict: "high",
        flags: [
          "contract-control",
          "concentrated",
          "deployer-selling",
          "clusters",
          "thin-liquidity",
        ],
        top10: 0.82,
        capturedAt: "2026-09-25T14:02:00.000Z",
        observedAt: "2026-09-25T19:10:00.000Z",
        status: "dead",
        priceRatio: 0.2,
        liquidityRatio: 0.03,
      },
      URL_,
    );
    expect(t).toContain("$RUG on Robinhood Chain");
    expect(t).toContain("Our check at 14:02 UTC: High risk");
    expect(t).toContain("5h later: liquidity −97%.");
    expect(xLength(t, URL_)).toBeLessThanOrEqual(X_LIMIT);
    expect(t.toLowerCase()).not.toMatch(/\bsafe\b|\bbuy\b/);
  });
});
