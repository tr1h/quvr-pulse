import { describe, expect, it } from "vitest";
import { rowFlags, summarizeRugReport, type RugRow } from "../src/rug-report";

const row = (over: Partial<RugRow> = {}): RugRow => ({
  address: "0x1",
  chain: "Robinhood Chain",
  symbol: "T",
  name: "Token",
  levels: ["low", "low", "low"],
  findings: [],
  marketCapUsd: 1_000_000,
  liquidityUsd: 100_000,
  volume24hUsd: 50_000,
  top10: 0.2,
  ...over,
});

describe("rug report", () => {
  it("maps findings to flags and ignores low/info severity", () => {
    expect(
      rowFlags(
        row({
          findings: [
            { code: "contract.mint", severity: "high" },
            { code: "distribution.cluster.c2", severity: "medium" },
            { code: "contract.delegatecall", severity: "low" },
            { code: "liquidity.new-pool", severity: "low" },
            { code: "solana.freeze-authority", severity: "high" },
          ],
        }),
      ).sort(),
    ).toEqual(["clusters", "contract-control"]);
  });

  it("counts verdicts with the shared rule and never calls missing data low", () => {
    const s = summarizeRugReport([
      row(),
      row({ address: "0x2", levels: ["low", "high", "low"] }),
      row({ address: "0x3", levels: ["insufficient", "insufficient", "low"] }),
      row({ address: "0x4", levels: ["low", "insufficient", "low"] }),
    ]);
    expect(s.verdicts).toEqual({ low: 1, elevated: 1, high: 1, insufficient: 1 });
    expect(s.total).toBe(4);
  });

  it("computes medians and orders top traded by volume", () => {
    const s = summarizeRugReport([
      row({ address: "a", volume24hUsd: 10, top10: 0.1, liquidityUsd: 10_000 }),
      row({ address: "b", volume24hUsd: 30, top10: 0.5, liquidityUsd: 30_000 }),
      row({ address: "c", volume24hUsd: null, top10: null, marketCapUsd: null }),
    ]);
    expect(s.medianTop10).toBeCloseTo(0.3);
    expect(s.medianLiquidityToMcap).toBeCloseTo(0.02);
    expect(s.topTraded.map((t) => t.address)).toEqual(["b", "a"]);
  });
});
