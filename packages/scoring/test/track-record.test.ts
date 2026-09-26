import { describe, expect, it } from "vitest";
import { summarizeTrackRecord, type TrackCountRow } from "../src/track-record";

const row = (
  horizon: string,
  verdict: string,
  status: string,
  n: number,
  backfilled = false,
): TrackCountRow => ({ horizon, verdict, status, n, backfilled });

describe("track record", () => {
  it("counts dead and no-market as gone and keeps live separate from reconstructed", () => {
    const r = summarizeTrackRecord([
      row("24h", "high", "dead", 10),
      row("24h", "high", "no_market", 20),
      row("24h", "high", "alive", 10),
      row("24h", "high", "no_market", 100, true),
      row("24h", "low", "alive", 38),
      row("24h", "low", "dead", 2),
    ]);
    expect(r.live.high["24h"].n).toBe(40);
    expect(r.live.high["24h"].goneRate).toBeCloseTo(0.75);
    expect(r.all.high["24h"].n).toBe(140);
    expect(r.all.high["24h"].goneRate).toBeCloseTo(130 / 140);
    expect(r.headline).toEqual({
      high: 0.75,
      nHigh: 40,
      other: 0.05,
      nOther: 40,
      otherLevel: "low",
    });
  });

  it("falls back to elevated in the headline while low-risk data is thin", () => {
    const r = summarizeTrackRecord([
      row("24h", "high", "dead", 30),
      row("24h", "elevated", "alive", 30),
      row("24h", "elevated", "dead", 10),
      row("24h", "low", "alive", 3),
    ]);
    expect(r.headline?.otherLevel).toBe("elevated");
    expect(r.headline?.other).toBeCloseTo(0.25);
  });

  it("hides rates below the minimum sample and has no headline without both sides", () => {
    const r = summarizeTrackRecord([row("24h", "high", "dead", 50), row("24h", "low", "dead", 5)]);
    expect(r.live.low["24h"].goneRate).toBeNull();
    expect(r.live.low["24h"].n).toBe(5);
    expect(r.headline).toBeNull();
  });

  it("maps unknown verdicts to insufficient and ignores unknown horizons", () => {
    const r = summarizeTrackRecord(
      [row("24h", "weird", "dead", 3), row("30d", "high", "dead", 3)],
      1,
    );
    expect(r.live.insufficient["24h"].goneRate).toBe(1);
    expect(r.live.high["7d"].n).toBe(0);
  });
});
