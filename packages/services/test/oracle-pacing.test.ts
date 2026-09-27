import { describe, expect, it } from "vitest";
import { oracleWindow, ORACLE_INTERVAL_MS } from "../src/oracle/pacing";

describe("even oracle publication pacing", () => {
  it.each([0, 1, 100, 143, 144, 288, 1000])(
    "allocates exactly the %i daily cap across 144 windows",
    (cap) => {
      const start = Date.parse("2026-09-27T00:00:00Z");
      const portions = Array.from(
        { length: 144 },
        (_, i) => oracleWindow(cap, new Date(start + i * ORACLE_INTERVAL_MS)).allowance,
      );
      expect(portions.reduce((a, b) => a + b, 0)).toBe(cap);
      expect(Math.max(...portions) - Math.min(...portions)).toBeLessThanOrEqual(1);
      for (let i = 1; i <= 144; i++)
        expect(portions.slice(0, i).reduce((a, b) => a + b, 0)).toBe(Math.floor((i * cap) / 144));
    },
  );
  it("keeps 144 labels available throughout the day in single-label portions", () => {
    expect(oracleWindow(144, new Date("2026-09-27T00:00:00Z")).allowance).toBe(1);
    expect(oracleWindow(144, new Date("2026-09-27T05:59:59Z")).allowance).toBe(1);
    expect(oracleWindow(144, new Date("2026-09-27T23:59:59Z"))).toMatchObject({
      day: "2026-09-27",
      allowance: 1,
      end: new Date("2026-09-28T00:00:00Z"),
    });
    expect(oracleWindow(144, new Date("2026-09-28T00:00:00Z"))).toMatchObject({
      day: "2026-09-28",
      allowance: 1,
    });
  });
});
