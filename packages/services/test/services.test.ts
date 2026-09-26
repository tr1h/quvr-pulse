import { describe, expect, it } from "vitest";
import { sourced, unavailable, type TokenReport } from "@quvr/shared";
import { evaluateAlerts } from "../src/alerts";
import { swr } from "../src/cache";
import { mergeWithPrevious } from "../src/scan/report";

describe("swr cache", () => {
  it("never caches errors: a failed miss rethrows, the next call retries", async () => {
    let n = 0;
    await expect(
      swr("t:err", { freshSeconds: 60, keepSeconds: 60 }, async () => {
        n++;
        throw new Error("down");
      }),
    ).rejects.toThrow("down");
    const r = await swr("t:err", { freshSeconds: 60, keepSeconds: 60 }, async () => {
      n++;
      return 42;
    });
    expect(r.value).toBe(42);
    expect(n).toBe(2);
  });

  it("serves stale values while revalidating, and keeps them if the refresh fails", async () => {
    await swr("t:stale", { freshSeconds: 60, keepSeconds: 60 }, async () => 1);
    const r = await swr("t:stale", { freshSeconds: 0, keepSeconds: 60 }, async () => {
      throw new Error("provider down");
    });
    expect(r.value).toBe(1);
    expect(r.isStale).toBe(true);
  });
});

describe("mergeWithPrevious", () => {
  it("replaces failed values with the last good value marked stale", () => {
    const prev = {
      a: sourced(10, "dexscreener", { fetchedAt: "2026-01-01T00:00:00.000Z" }),
      b: sourced(5, "rpc"),
    };
    const next = { a: unavailable<number>("dexscreener", "timeout"), b: sourced(6, "rpc") };
    const m = mergeWithPrevious(next, prev);
    expect(m.a.value).toBe(10);
    expect(m.a.isStale).toBe(true);
    expect(m.a.fetchedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(m.b.value).toBe(6);
    expect(m.b.isStale).toBe(false);
  });
});

function report(over: Record<string, unknown> = {}): TokenReport {
  const base = {
    address: "0xabc",
    checksumAddress: "0xAbC",
    generatedAt: new Date().toISOString(),
    token: { symbol: sourced("TST", "rpc") },
    market: { liquidityUsd: sourced(1000, "dexscreener") },
    history: { liquidity: sourced([], "q") },
    deployerActions: sourced([], "rpc"),
    timeline: [],
    contract: sourced(
      { owner: { address: null }, proxy: { implementation: null }, feeReadings: [] },
      "rpc",
    ),
    simulation: sourced({ status: "passed", sell: { detail: "ok" }, blockNumber: 1 }, "rpc"),
    social: { theses: sourced([], "fomo"), authors: sourced([], "fomo") },
  };
  return { ...base, ...over } as unknown as TokenReport;
}

describe("evaluateAlerts", () => {
  it("first observation of history is not news", () => {
    const next = report({
      deployerActions: sourced(
        [
          {
            kind: "sell",
            txHash: "0x1",
            amount: 5,
            blockNumber: 1,
            timestamp: null,
            counterparty: null,
          },
        ],
        "rpc",
      ),
    });
    expect(evaluateAlerts(null, next).filter((c) => c.kind === "deployer-sell")).toHaveLength(0);
  });

  it("detects a new deployer sell", () => {
    const prev = report();
    const next = report({
      deployerActions: sourced(
        [
          {
            kind: "sell",
            txHash: "0x1",
            amount: 5,
            blockNumber: 1,
            timestamp: null,
            counterparty: null,
          },
        ],
        "rpc",
      ),
    });
    const c = evaluateAlerts(prev, next);
    expect(c.find((x) => x.kind === "deployer-sell")?.dedupeKey).toBe("deployer-sell:0x1");
  });

  it("detects liquidity drop within the last hour", () => {
    const now = Date.now();
    const next = report({
      market: { liquidityUsd: sourced(600, "dexscreener") },
      history: {
        liquidity: sourced(
          [
            { t: now - 30 * 60_000, liquidityUsd: 1000 },
            { t: now, liquidityUsd: 600 },
          ],
          "q",
        ),
      },
    });
    const c = evaluateAlerts(report(), next, now).find((x) => x.kind === "liquidity-drop");
    expect(c?.magnitude).toBeCloseTo(40);
  });

  it("detects sell simulation turning negative and privilege changes", () => {
    const next = report({
      simulation: sourced(
        { status: "failed", sell: { detail: "reverted" }, blockNumber: 2 },
        "rpc",
      ),
      contract: sourced(
        { owner: { address: "0xnew" }, proxy: { implementation: null }, feeReadings: [] },
        "rpc",
      ),
    });
    const kinds = evaluateAlerts(report(), next).map((c) => c.kind);
    expect(kinds).toContain("sell-sim-failed");
    expect(kinds).toContain("privilege-change");
  });

  it("missing data never triggers alerts", () => {
    const next = report({
      market: { liquidityUsd: unavailable("dexscreener", "down") },
      simulation: unavailable("rpc", "down"),
      contract: unavailable("rpc", "down"),
    });
    expect(evaluateAlerts(report(), next)).toHaveLength(0);
  });
});
