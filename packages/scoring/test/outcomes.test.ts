import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TokenReport } from "@quvr/shared";
import { baselineFromReport, classifyOutcome, dueHorizons } from "../src/outcomes";

const rocco = JSON.parse(
  readFileSync(new URL("./fixtures-rocco.json", import.meta.url), "utf8"),
) as TokenReport;

describe("outcome tracking", () => {
  it("builds a baseline from a real report", () => {
    const b = baselineFromReport(rocco)!;
    expect(b.chain).toBe("solana");
    expect(b.priceUsd).toBeGreaterThan(0);
    expect(b.features.verdict).toBe("high");
    expect(b.features.flags).toEqual(expect.arrayContaining(["concentrated", "deployer-share"]));
    expect(b.features.deployerShare).toBeCloseTo(0.267, 2);
  });

  it("skips tokens without a price (nothing to compare later)", () => {
    const noPrice = structuredClone(rocco);
    noPrice.market.priceUsd = { ...noPrice.market.priceUsd, value: null };
    expect(baselineFromReport(noPrice)).toBeNull();
  });

  it("schedules only horizons that are due and not recorded", () => {
    const t0 = new Date("2026-09-24T12:00:00Z");
    expect(dueHorizons(t0, [], new Date("2026-09-24T12:30:00Z"))).toEqual([]);
    expect(dueHorizons(t0, [], new Date("2026-09-24T13:00:00Z"))).toEqual(["1h"]);
    expect(dueHorizons(t0, ["1h"], new Date("2026-09-25T12:05:00Z"))).toEqual(["24h"]);
    expect(dueHorizons(t0, [], new Date("2026-10-02T00:00:00Z"))).toEqual(["1h", "24h", "7d"]);
  });

  it("classifies dead, alive and vanished markets", () => {
    const base = { priceUsd: 1, liquidityUsd: 10_000 };
    expect(classifyOutcome(base, { found: true, priceUsd: 0.05, liquidityUsd: 9_000 }).status).toBe(
      "dead",
    );
    expect(classifyOutcome(base, { found: true, priceUsd: 0.8, liquidityUsd: 500 }).status).toBe(
      "dead",
    );
    expect(classifyOutcome(base, { found: true, priceUsd: 0.5, liquidityUsd: 6_000 })).toEqual({
      status: "alive",
      priceRatio: 0.5,
      liquidityRatio: 0.6,
    });
    expect(classifyOutcome(base, { found: false, priceUsd: null, liquidityUsd: null }).status).toBe(
      "no_market",
    );
    // Bonding-curve tokens have no liquidity figure: judged by price alone.
    expect(
      classifyOutcome(
        { priceUsd: 1, liquidityUsd: null },
        { found: true, priceUsd: 2, liquidityUsd: null },
      ).status,
    ).toBe("alive");
  });
});
