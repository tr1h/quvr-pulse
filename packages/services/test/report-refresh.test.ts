import { beforeEach, describe, expect, it, vi } from "vitest";
import { sourced, type TokenReport } from "@quvr/shared";

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  pairs: vi.fn(),
  persist: vi.fn(),
  release: vi.fn(),
}));
vi.mock("../src/chain-resolve", () => ({ resolveTokenChain: async () => 4663 }));
vi.mock("../src/scan/report", () => ({ buildTokenReport: mocks.build }));
vi.mock("../src/scan/solana-report", () => ({ buildSolanaTokenReport: mocks.build }));
vi.mock("../src/lease", () => ({ acquireLease: async () => mocks.release }));
vi.mock("../src/persistence", () => ({
  loadLastReport: async () => null,
  persistReport: mocks.persist,
  recordSourceStatus: async () => {},
}));
vi.mock("@quvr/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@quvr/providers")>()),
  getProviders: () => ({ market: { getTokenPairs: mocks.pairs } }),
}));

import { cacheSet } from "../src/cache";
import { getTokenReport, waitForFullReport } from "../src/reports";
import { withLiveMarket } from "../src/report-market";
let sequence = 0;
function report(age: number): TokenReport {
  return {
    address: `0x${(++sequence).toString(16).padStart(40, "0")}`,
    chainId: 4663,
    generatedAt: new Date(Date.now() - age).toISOString(),
    scores: { distributionHealth: { value: 39, updatedAt: "2026-09-26T12:00:00Z" } },
    market: Object.fromEntries(
      ["priceUsd", "priceNative", "marketCapUsd", "fdvUsd", "volume", "txns", "priceChange"].map(
        (k) => [k, sourced(1, "dexscreener")],
      ),
    ),
  } as unknown as TokenReport;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.pairs.mockResolvedValue({
    pairs: [
      {
        priceUsd: 2,
        priceNative: null,
        marketCapUsd: 100,
        fdvUsd: 200,
        volume: {},
        txns: {},
        priceChange: {},
      },
    ],
  });
});

describe("independent price refresh", () => {
  it("refreshes prices without rebuilding a one-minute-old report or changing its risk timestamp", async () => {
    const previous = report(60_000);
    await cacheSet(`report:${previous.address}`, previous, 600);
    const { report: next } = await getTokenReport(previous.address);
    expect(mocks.build).not.toHaveBeenCalled();
    expect(next.market.priceUsd.value).toBe(2);
    expect(next.generatedAt).toBe(previous.generatedAt);
    expect(next.scores).toEqual(previous.scores);
  });
  it("starts only one heavy rebuild after five minutes", async () => {
    const previous = report(301_000);
    await cacheSet(`report:${previous.address}`, previous, 600);
    let finish!: (value: unknown) => void;
    mocks.build.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await Promise.all([getTokenReport(previous.address), getTokenReport(previous.address)]);
    expect(mocks.build).toHaveBeenCalledTimes(1);
    finish({ report: { ...previous, generatedAt: new Date().toISOString() }, codeHash: null });
    await waitForFullReport(previous.address, 1000);
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
  it("keeps the last price and risk score on failure, marking the market stale", async () => {
    const previous = report(60_000);
    mocks.pairs.mockRejectedValue(new Error("RPC down"));
    const next = await withLiveMarket(previous);
    expect(next.market.priceUsd.value).toBe(1);
    expect(next.market.priceUsd.isStale).toBe(true);
    expect(next.scores).toEqual(previous.scores);
    expect(next.generatedAt).toBe(previous.generatedAt);
  });
});
