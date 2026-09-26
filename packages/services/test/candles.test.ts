import { describe, expect, it } from "vitest";
import { aggregateCandles } from "../src/candles";

const H = 3_600_000;
const c = (h: number, o: number, hi: number, lo: number, cl: number, v: number) => ({
  t: h * H,
  o,
  h: hi,
  l: lo,
  c: cl,
  v,
});

describe("aggregateCandles", () => {
  it("merges hourly candles into 4h bars", () => {
    const out = aggregateCandles(
      [
        c(1, 2, 3, 1.5, 2.5, 10),
        c(0, 1, 2, 0.5, 2, 5),
        c(4, 2.5, 4, 2, 3, 7),
        c(3, 2.5, 5, 2, 2.2, 1),
      ],
      4 * 3600,
    );
    expect(out).toEqual([
      { t: 0, o: 1, h: 5, l: 0.5, c: 2.2, v: 16 },
      { t: 4 * H, o: 2.5, h: 4, l: 2, c: 3, v: 7 },
    ]);
  });
});
