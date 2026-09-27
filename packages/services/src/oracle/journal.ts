import { getDb, toJson } from "@quvr/db";
import type { OracleLabel } from "@quvr/scoring";
import type { Hex } from "viem";
import { oracleWindow } from "./pacing";

export type PublishedLabel = {
  token: string;
  symbol: string | null;
  sig: string;
  label: OracleLabel;
};
export type Publication = {
  hash: string;
  chainId: number;
  oracle: string;
  rawTransaction: string;
  labels: unknown;
  labelCount: number;
  day: string;
  status: string;
};

export function dailyLimit(value = process.env.ORACLE_DAILY_LIMIT): number {
  if (value === undefined) return 144;
  const parsed = Number(value);
  if (!value.trim() || !Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error("ORACLE_DAILY_LIMIT must be a non-negative integer");
  return parsed;
}

export async function pendingPublication() {
  return getDb().oraclePublication.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });
}

/** Atomic reservation. Never broadcast a signed transaction unless this succeeds. */
export async function reservePublication(
  publication: Omit<Publication, "status">,
  cap: number,
  legacySpent: number,
): Promise<Publication | null> {
  return getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(4663, 7713)`;
    const pending = await tx.oraclePublication.findFirst({ where: { status: "pending" } });
    if (pending) return pending;
    // Repeated recovery cannot reserve the same transaction twice.
    if (await tx.oraclePublication.findUnique({ where: { hash: publication.hash } })) return null;
    const now = new Date();
    const window = oracleWindow(cap, now);
    // Preparing/signing may cross midnight. Never charge a new write to yesterday's budget.
    if (publication.day !== window.day) return null;
    if (!Number.isSafeInteger(publication.labelCount) || publication.labelCount <= 0) return null;
    const budget = await tx.oracleDayBudget.upsert({
      where: { day: publication.day },
      create: { day: publication.day, used: legacySpent },
      update: {},
    });
    if (budget.used + publication.labelCount > cap) return null;
    // Same lock as the daily reservation: concurrent workers/restarts cannot reuse a slot.
    // Pending and reverted transactions count too, since they have reserved/spent gas.
    const slot = await tx.oraclePublication.aggregate({
      where: { day: window.day, createdAt: { gte: window.start, lt: window.end } },
      _sum: { labelCount: true },
    });
    if ((slot._sum.labelCount ?? 0) + publication.labelCount > window.allowance) return null;
    await tx.oracleDayBudget.update({
      where: { day: publication.day },
      data: { used: { increment: publication.labelCount } },
    });
    return tx.oraclePublication.create({
      data: { ...publication, labels: toJson(publication.labels), createdAt: now },
    });
  });
}

/** Ambiguous RPC outcomes retain the reservation and block new sends until reconciled. */
export async function deliverPublication(
  entry: Publication,
  io: {
    receipt: (hash: Hex) => Promise<{ status: "success" | "reverted" } | null>;
    send: (raw: Hex) => Promise<unknown>;
    wait: (hash: Hex) => Promise<{ status: "success" | "reverted" }>;
    finalize: (entry: Publication, status: "success" | "reverted") => Promise<void>;
  },
): Promise<number> {
  let receipt = await io.receipt(entry.hash as Hex);
  if (!receipt) {
    // "Already known" and response loss are both reconciled by the stored hash.
    try {
      await io.send(entry.rawTransaction as Hex);
    } catch {
      /* inspect receipt below */
    }
    receipt = await io.wait(entry.hash as Hex);
  }
  await io.finalize(entry, receipt.status);
  return receipt.status === "success" ? entry.labelCount : 0;
}
