import { describe, expect, it } from "vitest";
import { decodeCache, encodeCache } from "../src/cache-codec";
import { cacheGet, cacheSet } from "../src/cache";

describe("compact cache storage", () => {
  it("reads legacy JSON including bigint fields", async () => {
    expect(await decodeCache('{"value":{"amount":{"__big":"123"}},"storedAt":10}')).toEqual({
      value: { amount: 123n },
      storedAt: 10,
    });
  });
  it("keeps small budget counters as legacy-compatible JSON", async () => {
    const value = { value: 100, storedAt: 123 };
    expect(JSON.parse(await encodeCache(value))).toEqual(value);
  });
  it("compresses large histories and preserves timestamps and bigint values", async () => {
    const value = {
      storedAt: 123,
      value: Array.from({ length: 1000 }, (_, i) => ({
        address: `0x${i.toString(16).padStart(40, "0")}`,
        amount: BigInt(i),
        tx: "0x" + "a".repeat(64),
      })),
    };
    const raw = await encodeCache(value);
    expect(raw.length).toBeLessThan(25_000);
    expect(await decodeCache(raw)).toEqual(value);
    await cacheSet("codec:history", value, 60);
    expect((await cacheGet("codec:history"))?.value).toEqual(value);
  });
});
