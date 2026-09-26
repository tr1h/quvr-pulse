import { describe, expect, it } from "vitest";
import { isTickerClone, summarizeClones, type CloneCandidate } from "../src/clones";

const evmSame = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const tok = (address: string, liquidityUsd: number | null, over: Partial<CloneCandidate> = {}) =>
  ({
    address,
    symbol: "Agrippa",
    name: "Agrippa",
    liquidityUsd,
    marketCapUsd: null,
    pairCreatedAt: null,
    level: null,
    ...over,
  }) satisfies CloneCandidate;

describe("ticker clones", () => {
  it("matches the ticker case-insensitively and exact names, not look-alike spellings", () => {
    const cur = { symbol: "Agrippa", name: "Agrippa" };
    expect(isTickerClone(cur, { symbol: "AGRIPPA", name: "x" })).toBe(true);
    expect(isTickerClone(cur, { symbol: "$agrippa ", name: null })).toBe(true);
    expect(isTickerClone(cur, { symbol: "AGR", name: "Agrippa" })).toBe(true);
    expect(isTickerClone(cur, { symbol: "Aggripa", name: "Aggripa" })).toBe(false);
  });

  it("warns when a deeper token with the same ticker exists", () => {
    const s = summarizeClones(
      tok("0xcopy", 40_000),
      [tok("0xreal", 1_348_000), tok("0xother", 20_000), tok("0xCOPY", 40_000)],
      evmSame,
    )!;
    expect(s.state).toBe("smaller");
    expect(s.rank).toBe(2);
    expect(s.total).toBe(3);
    expect(s.largest?.address).toBe("0xreal");
    expect(s.others.map((o) => o.address)).toEqual(["0xreal", "0xother"]);
  });

  it("marks the deepest token as largest and dedupes pairs of one token", () => {
    const s = summarizeClones(
      tok("0xreal", 1_348_000),
      [tok("0xa", 50_000), tok("0xA", 60_000, { level: "high" }), tok("0xb", null)],
      evmSame,
    )!;
    expect(s.state).toBe("largest");
    expect(s.rank).toBe(1);
    expect(s.others).toHaveLength(2);
    expect(s.others[0]).toMatchObject({ liquidityUsd: 60_000, level: "high" });
  });

  it("returns nothing without clones or ticker", () => {
    expect(summarizeClones(tok("0x1", 1), [tok("0x1", 1)], evmSame)).toBeNull();
    expect(summarizeClones(tok("0x1", 1, { symbol: null }), [tok("0x2", 5)], evmSame)).toBeNull();
  });
});
