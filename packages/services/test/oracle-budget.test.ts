import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  pending: vi.fn(),
  known: vi.fn(),
  budget: vi.fn(),
  spend: vi.fn(),
  create: vi.fn(),
  lock: vi.fn(),
}));
vi.mock("@quvr/db", () => ({
  toJson: (value: unknown) => value,
  getDb: () => ({
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: state.lock,
        oraclePublication: {
          findFirst: state.pending,
          findUnique: state.known,
          create: state.create,
        },
        oracleDayBudget: { upsert: state.budget, update: state.spend },
      }),
  }),
}));
import { reservePublication } from "../src/oracle/journal";
const batch = {
  hash: "0x01",
  rawTransaction: "0xab",
  oracle: "0xoracle",
  chainId: 4663,
  labels: [],
  labelCount: 20,
  day: "2026-09-26",
};
beforeEach(() => {
  vi.resetAllMocks();
  state.pending.mockResolvedValue(null);
  state.known.mockResolvedValue(null);
  state.budget.mockResolvedValue({ used: 80 });
  state.create.mockResolvedValue({ ...batch, status: "pending" });
});
describe("oracle global budget reservation", () => {
  it("carries legacy spending into the durable budget and reserves before returning", async () => {
    await reservePublication(batch, 100, 80);
    expect(state.budget.mock.calls[0]![0].create).toEqual({ day: batch.day, used: 80 });
    expect(state.spend.mock.calls[0]![0].data.used.increment).toBe(20);
    expect(state.lock.mock.invocationCallOrder[0]!).toBeLessThan(
      state.budget.mock.invocationCallOrder[0]!,
    );
    expect(state.spend.mock.invocationCallOrder[0]!).toBeLessThan(
      state.create.mock.invocationCallOrder[0]!,
    );
  });
  it("applies the same limit to a newly deployed contract", async () => {
    state.budget.mockResolvedValue({ used: 100 });
    expect(await reservePublication({ ...batch, oracle: "0xnew" }, 100, 0)).toBeNull();
    expect(state.spend).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });
  it("resumes the existing reservation without spending again", async () => {
    const pending = { ...batch, status: "pending" };
    state.pending.mockResolvedValue(pending);
    expect(await reservePublication({ ...batch, hash: "0x02" }, 100, 80)).toBe(pending);
    expect(state.budget).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });
  it("never reserves an already recorded transaction twice", async () => {
    state.known.mockResolvedValue({ ...batch, status: "confirmed" });
    expect(await reservePublication(batch, 100, 80)).toBeNull();
    expect(state.spend).not.toHaveBeenCalled();
  });
});
