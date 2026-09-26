import { afterEach, describe, expect, it, vi } from "vitest";
import { withOperationTimeout, withResilience, operationSignal } from "@quvr/providers";
import { cacheGet, swr } from "../src/cache";
import { dailyLimit, deliverPublication, type Publication } from "../src/oracle/journal";

afterEach(() => vi.useRealTimers());

describe("cancelled report work", () => {
  it("aborts the provider without retrying after the outer deadline", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const provider = vi.fn((s: AbortSignal) => {
      signal = s;
      return new Promise<never>((_, reject) => s.addEventListener("abort", () => reject(s.reason)));
    });
    const pending = withOperationTimeout(100, () => withResilience("cancel-test", provider));
    const assertion = expect(pending).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(operationSignal()).toBeUndefined();
  });

  it("deduplicates concurrent loads and rejects a late result after replacement", async () => {
    vi.useFakeTimers();
    let finish!: (value: number) => void;
    const loader = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );
    const opts = { freshSeconds: 60, keepSeconds: 600 };
    const first = swr("recovery:late", opts, loader);
    const second = swr("recovery:late", opts, loader);
    const assertions = [
      expect(first).rejects.toThrow("deadline"),
      expect(second).rejects.toThrow("deadline"),
    ];
    await vi.advanceTimersByTimeAsync(180_001);
    await Promise.all(assertions);
    expect(loader).toHaveBeenCalledTimes(1);
    await swr("recovery:late", opts, async () => 2);
    finish(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await cacheGet<number>("recovery:late"))?.value).toBe(2);
  });
});

const entry: Publication = {
  hash: "0x1234",
  rawTransaction: "0xabcd",
  chainId: 4663,
  oracle: "0xoracle",
  labels: [],
  labelCount: 20,
  day: "2026-09-26",
  status: "pending",
};
function io() {
  return {
    receipt: vi.fn().mockResolvedValue(null),
    send: vi.fn().mockResolvedValue(entry.hash),
    wait: vi.fn().mockResolvedValue({ status: "success" }),
    finalize: vi.fn().mockResolvedValue(undefined),
  };
}

describe("oracle crash recovery", () => {
  it("accepts a zero budget and rejects invalid limits", () => {
    expect(dailyLimit("0")).toBe(0);
    expect(dailyLimit("100")).toBe(100);
    for (const value of ["", "-1", "NaN", "2.5", "Infinity"])
      expect(() => dailyLimit(value)).toThrow();
  });
  it("recovers a mined transaction without broadcasting again", async () => {
    const calls = io();
    calls.receipt.mockResolvedValue({ status: "success" });
    expect(await deliverPublication(entry, calls)).toBe(20);
    expect(calls.send).not.toHaveBeenCalled();
    expect(calls.finalize).toHaveBeenCalledWith(entry, "success");
  });
  it("rebroadcasts only the saved bytes and reconciles a lost RPC response", async () => {
    const calls = io();
    calls.send.mockRejectedValue(new Error("response lost"));
    expect(await deliverPublication(entry, calls)).toBe(20);
    expect(calls.send).toHaveBeenCalledWith(entry.rawTransaction);
    expect(calls.wait).toHaveBeenCalledWith(entry.hash);
  });
  it("leaves ambiguous transactions pending, then recovers after a restart", async () => {
    const calls = io();
    calls.wait.mockRejectedValue(new Error("timeout"));
    await expect(deliverPublication(entry, calls)).rejects.toThrow("timeout");
    expect(calls.finalize).not.toHaveBeenCalled();
    const resumed = io();
    resumed.receipt.mockResolvedValue({ status: "success" });
    await deliverPublication(entry, resumed);
    expect(resumed.send).not.toHaveBeenCalled();
  });
  it("records a revert without counting it as published", async () => {
    const calls = io();
    calls.wait.mockResolvedValue({ status: "reverted" });
    expect(await deliverPublication(entry, calls)).toBe(0);
    expect(calls.finalize).toHaveBeenCalledWith(entry, "reverted");
  });
});
