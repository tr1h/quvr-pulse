import { describe, expect, it } from "vitest";
import type { TokenReport } from "@quvr/shared";
import { oracleFlags, oracleLabel, oracleSignature, ORACLE_NO_DATA } from "../src/oracle";
import rocco from "./fixtures-rocco.json";

describe("oracle label", () => {
  it("maps a report to contract values; missing scores become NO_DATA, never 0", () => {
    const r = structuredClone(rocco) as unknown as TokenReport;
    r.scores.socialMomentum.value = null;
    r.scores.distributionHealth.value = null;
    const l = oracleLabel(r);
    expect([1, 2, 3, 4]).toContain(l.level);
    expect(l.distributionScore).toBe(ORACLE_NO_DATA);
    expect(l.contractScore).toBeGreaterThanOrEqual(0);
    expect(l.contractScore).toBeLessThanOrEqual(100);
    expect(l.flags).toBeLessThan(1 << 8);
    expect(oracleSignature(l)).toMatch(/^[1-4]:\d+$/);
  });

  it("round-trips flag bits", () => {
    expect(oracleFlags(0b1000_0011)).toEqual([
      "contract-control",
      "concentrated",
      "mass-transfers",
    ]);
    expect(oracleFlags(0)).toEqual([]);
  });
});
