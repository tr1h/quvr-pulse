import { describe, expect, it, vi } from "vitest";
import type { ChainProvider, CallOutcome } from "@quvr/providers";
import { cachedErc20Metadata } from "../src/scan/erc20-meta";

/** ABI-encoded string result for name()/symbol(). */
function encString(s: string): `0x${string}` {
  const hex = Buffer.from(s, "utf8").toString("hex");
  const len = s.length.toString(16).padStart(64, "0");
  return `0x${"20".padStart(64, "0")}${len}${hex.padEnd(64, "0")}`;
}
const encUint = (n: bigint): `0x${string}` => `0x${n.toString(16).padStart(64, "0")}`;

function fakeChain(
  id: number,
  behaviour: Array<"fail" | "ok">,
  supply = 1000n,
): ChainProvider & { calls: number } {
  const chain = {
    name: "rpc",
    chain: { id } as ChainProvider["chain"],
    calls: 0,
    async callMany(): Promise<CallOutcome[]> {
      const mode = behaviour[chain.calls++] ?? "ok";
      if (mode === "fail")
        throw new Error("rate-limited: [rpc] client-side rate limit budget exhausted");
      return [
        { ok: true, data: encString("Accrued") },
        { ok: true, data: encString("ACCR") },
        { ok: true, data: encUint(18n) },
        { ok: true, data: encUint(supply) },
      ];
    },
  };
  return chain as unknown as ChainProvider & { calls: number };
}

describe("cachedErc20Metadata", () => {
  it("retries once when the RPC queue is saturated", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const chain = fakeChain(9001, ["fail", "ok"]);
    const m = await cachedErc20Metadata(chain, "0x0000000000000000000000000000000000000a01");
    expect(chain.calls).toBe(2);
    expect(m).toMatchObject({
      name: "Accrued",
      symbol: "ACCR",
      decimals: 18,
      totalSupplyRaw: 1000n,
    });
    vi.useRealTimers();
  });

  it("keeps name/symbol/decimals from cache when the RPC keeps failing, never supply", async () => {
    const token = "0x0000000000000000000000000000000000000a02";
    await cachedErc20Metadata(fakeChain(9002, ["ok"]), token);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const m = await cachedErc20Metadata(fakeChain(9002, ["fail", "fail"]), token);
    vi.useRealTimers();
    expect(m).toEqual({ name: "Accrued", symbol: "ACCR", decimals: 18, totalSupplyRaw: null });
  });

  it("still fails loudly when there is nothing cached", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await expect(
      cachedErc20Metadata(
        fakeChain(9003, ["fail", "fail"]),
        "0x0000000000000000000000000000000000000a03",
      ),
    ).rejects.toThrow(/rate-limited/);
    vi.useRealTimers();
  });
});
