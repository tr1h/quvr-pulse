import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  pending: vi.fn(),
  known: vi.fn(),
  budget: vi.fn(),
  spend: vi.fn(),
  create: vi.fn(),
  lock: vi.fn(),
  aggregate: vi.fn(),
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
          aggregate: state.aggregate,
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
  labelCount: 1,
  day: "2026-09-26",
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
  vi.resetAllMocks();
  state.pending.mockResolvedValue(null);
  state.known.mockResolvedValue(null);
  state.budget.mockResolvedValue({ used: 80 });
  state.create.mockResolvedValue({ ...batch, status: "pending" });
  state.aggregate.mockResolvedValue({ _sum: { labelCount: null } });
});
afterEach(() => vi.useRealTimers());
describe("oracle global budget reservation", () => {
  it("carries legacy spending into the durable budget and reserves before returning", async () => {
    await reservePublication(batch, 144, 80);
    expect(state.budget.mock.calls[0]![0].create).toEqual({ day: batch.day, used: 80 });
    expect(state.spend.mock.calls[0]![0].data.used.increment).toBe(1);
    expect(state.lock.mock.invocationCallOrder[0]!).toBeLessThan(
      state.budget.mock.invocationCallOrder[0]!,
    );
    expect(state.spend.mock.invocationCallOrder[0]!).toBeLessThan(
      state.create.mock.invocationCallOrder[0]!,
    );
  });
  it("applies the same limit to a newly deployed contract", async () => {
    state.budget.mockResolvedValue({ used: 144 });
    expect(await reservePublication({ ...batch, oracle: "0xnew" }, 144, 0)).toBeNull();
    expect(state.spend).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });
  it("resumes the existing reservation without spending again", async () => {
    const pending = { ...batch, status: "pending" };
    state.pending.mockResolvedValue(pending);
    expect(await reservePublication({ ...batch, hash: "0x02" }, 144, 80)).toBe(pending);
    expect(state.budget).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });
  it("never reserves an already recorded transaction twice", async () => {
    state.known.mockResolvedValue({ ...batch, status: "confirmed" });
    expect(await reservePublication(batch, 144, 80)).toBeNull();
    expect(state.spend).not.toHaveBeenCalled();
  });
  it("refuses a second batch in the same ten-minute window even with daily capacity left", async () => {
    state.aggregate.mockResolvedValue({ _sum: { labelCount: 1 } });
    expect(await reservePublication(batch, 144, 80)).toBeNull();
    expect(state.spend).not.toHaveBeenCalled();
    expect(state.aggregate).toHaveBeenCalledWith({
      where: {
        day: batch.day,
        createdAt: { gte: new Date("2026-09-26T12:00:00Z"), lt: new Date("2026-09-26T12:10:00Z") },
      },
      _sum: { labelCount: true },
    });
  });
  it("does not let an empty earlier day turn into a 20-label catch-up batch", async () => {
    state.budget.mockResolvedValue({ used: 0 });
    expect(await reservePublication({ ...batch, labelCount: 20 }, 144, 0)).toBeNull();
    expect(state.spend).not.toHaveBeenCalled();
  });
  it("rejects a transaction prepared before midnight after the day changed", async () => {
    vi.setSystemTime(new Date("2026-09-27T00:00:00Z"));
    expect(await reservePublication(batch, 144, 80)).toBeNull();
    expect(state.budget).not.toHaveBeenCalled();
  });
});
