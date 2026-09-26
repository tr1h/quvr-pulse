import { describe, expect, it } from "vitest";
import {
  fibPrice,
  formatDuration,
  formatPct,
  logicalToTime,
  makeDrawing,
  parseDrawings,
  riskReward,
  timeToLogical,
} from "../src/lib/chart-drawings";
import { tradeLinks } from "../src/lib/trade-links";
import type { TokenReport } from "@quvr/shared";

describe("chart drawings", () => {
  const times = [1000, 1060, 1120, 1180];

  it("maps time to fractional bars and back, extrapolating past the data", () => {
    expect(timeToLogical(times, 1090)).toBeCloseTo(1.5);
    expect(timeToLogical(times, 1300)).toBeCloseTo(5);
    expect(timeToLogical(times, 940)).toBeCloseTo(-1);
    for (const l of [-2, 0, 0.25, 2.5, 3, 7.5])
      expect(timeToLogical(times, logicalToTime(times, l))).toBeCloseTo(l);
  });

  it("puts Fibonacci level 0 at the second point and 1 at the first", () => {
    expect(fibPrice(1, 2, 0)).toBe(2);
    expect(fibPrice(1, 2, 1)).toBe(1);
    expect(fibPrice(1, 2, 0.618)).toBeCloseTo(1.382);
  });

  it("computes long and short risk/reward", () => {
    const long = riskReward(100, 95, 115);
    expect(long.side).toBe("long");
    expect(long.ratio).toBeCloseTo(3);
    expect(long.invalid).toBe(false);
    const short = riskReward(100, 104, 90);
    expect(short.side).toBe("short");
    expect(short.ratio).toBeCloseTo(2.5);
    expect(riskReward(100, 105, 115).invalid).toBe(true);
    expect(riskReward(100, 100, 115).ratio).toBeNull();
  });

  it("formats durations and percentages", () => {
    expect(formatDuration(20_700)).toBe("5h 45m");
    expect(formatDuration(2 * 86_400 + 4 * 3_600)).toBe("2d 4h");
    expect(formatPct(0.1234)).toBe("+12.3%");
    expect(formatPct(-0.052)).toBe("−5.20%");
  });

  it("builds drawings from clicks and drops malformed stored ones", () => {
    const d = makeDrawing(
      "rr",
      [
        { t: 1, p: 1 },
        { t: 2, p: 0.9 },
        { t: 3, p: 1.3 },
      ],
      "x",
    );
    expect(d?.kind).toBe("rr");
    expect(makeDrawing("fib", [{ t: 1, p: 1 }], "y")).toBeNull();
    const parsed = parseDrawings([
      d,
      { id: "h", kind: "hline", p: 2 },
      { id: "bad", kind: "fib", a: { t: 1 } },
      "junk",
    ]);
    expect(parsed.map((x) => x.id)).toEqual(["x", "h"]);
    expect(parseDrawings({})).toEqual([]);
  });
});

describe("trade links", () => {
  const base = {
    address: "0x21cfcfc3d8f98fc728f48341d10ad8283f6eb7ab",
    checksumAddress: "0x21CFCFc3d8F98fC728f48341D10Ad8283F6EB7AB",
    liquidity: { mainPair: { value: null } },
  };
  it("uses Uniswap with the right chain for EVM tokens", () => {
    const [l] = tradeLinks({ ...base, chainId: 8453 } as unknown as TokenReport);
    expect(l!.url).toContain("chain=base");
    expect(l!.url).toContain("outputCurrency=0x21CFCF");
    expect(tradeLinks({ ...base, chainId: 4663 } as unknown as TokenReport)[0]!.url).toContain(
      "chain=robinhood",
    );
  });
  it("uses Jupiter (and pump.fun for pump tokens) on Solana", () => {
    const links = tradeLinks({
      address: "9Jfxfiw84f2jBpLqACHchd727LLLHgJa6uhSmnrbpump",
      chainId: 1399811149,
      liquidity: { mainPair: { value: { dexId: "pumpswap" } } },
    } as unknown as TokenReport);
    expect(links.map((l) => l.label)).toEqual(["Jupiter", "pump.fun"]);
    expect(links[0]!.url).toContain("buy=9Jfx");
  });
});
