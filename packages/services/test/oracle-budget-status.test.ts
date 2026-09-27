import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  find: vi.fn(),
  get: vi.fn(),
  aggregate: vi.fn(),
  redisReady: true,
}));
vi.mock("@quvr/db", () => ({
  getDb: () => ({
    oracleDayBudget: { findUnique: state.find },
    oraclePublication: { aggregate: state.aggregate },
  }),
}));
vi.mock("../src/redis", () => ({
  getRedis: () => ({ status: state.redisReady ? "ready" : "connecting", get: state.get }),
}));
import { oraclePublicationBudget } from "../src/oracle/budget";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ORACLE_DAILY_LIMIT", "100");
  state.redisReady = true;
  state.find.mockResolvedValue(null);
  state.get.mockResolvedValue(null);
  state.aggregate.mockResolvedValue({ _sum: { labelCount: null } });
});
afterEach(() => vi.unstubAllEnvs());

describe("public oracle budget", () => {
  it("uses durable reservations, including pending writes, instead of an older legacy counter", async () => {
    state.find.mockResolvedValue({ used: 100 });
    const result = await oraclePublicationBudget(new Date("2026-09-27T09:00:00Z"));
    expect(result).toMatchObject({
      limit: 100,
      used: 100,
      remaining: 0,
      resetsAt: "2026-09-28T00:00:00.000Z",
    });
    expect(state.get).not.toHaveBeenCalled();
  });
  it("includes pre-migration spending and clamps remaining after a limit reduction", async () => {
    state.get.mockResolvedValue(JSON.stringify({ value: 120 }));
    expect(await oraclePublicationBudget()).toMatchObject({ used: 120, remaining: 0 });
  });
  it("uses the UTC day across local midnight", async () => {
    const result = await oraclePublicationBudget(new Date("2026-09-28T01:00:00+03:00"));
    expect(state.find).toHaveBeenCalledWith({ where: { day: "2026-09-27" } });
    expect(result.resetsAt).toBe("2026-09-28T00:00:00.000Z");
  });
  it("does not report zero usage when storage is unavailable", async () => {
    state.redisReady = false;
    await expect(oraclePublicationBudget()).rejects.toThrow("unavailable");
    state.find.mockRejectedValue(new Error("database unavailable"));
    await expect(oraclePublicationBudget()).rejects.toThrow("database unavailable");
  });
  it("rejects malformed spending instead of claiming capacity is available", async () => {
    state.get.mockResolvedValue('{"value":"bad"}');
    await expect(oraclePublicationBudget()).rejects.toThrow("Invalid oracle budget");
  });
  it("shows the next UTC window without letting old unused slots build a burst", async () => {
    vi.stubEnv("ORACLE_DAILY_LIMIT", "144");
    state.find.mockResolvedValue({ used: 10 });
    state.aggregate.mockResolvedValue({ _sum: { labelCount: 1 } });
    expect(await oraclePublicationBudget(new Date("2026-09-27T10:12:00Z"))).toMatchObject({
      remaining: 134,
      windowAllowance: 1,
      windowRemaining: 0,
      nextWindowAt: "2026-09-27T10:20:00.000Z",
    });
  });
});
