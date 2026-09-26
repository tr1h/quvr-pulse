import { getDb, toJson } from "@quvr/db";
import { getProviders } from "@quvr/providers";
import {
  baselineFromReport,
  classifyOutcome,
  reportFeatures,
  dueHorizons,
  OUTCOME_HORIZONS,
  type OutcomeHorizon,
} from "@quvr/scoring";
import { logger, type PairInfo, type TokenReport } from "@quvr/shared";
import { safeDb } from "./persistence";

const log = logger.child({ scope: "outcomes" });

/** First report with a price becomes the token's baseline; later reports never overwrite it. */
export async function captureBaseline(report: TokenReport): Promise<void> {
  const b = baselineFromReport(report);
  if (!b) return;
  await safeDb(
    "captureBaseline",
    () =>
      getDb().tokenBaseline.upsert({
        where: { tokenAddress: report.address },
        create: {
          tokenAddress: report.address,
          chain: b.chain,
          capturedAt: new Date(report.generatedAt),
          priceUsd: b.priceUsd,
          liquidityUsd: b.liquidityUsd,
          marketCapUsd: b.marketCapUsd,
          poolAgeHours: b.poolAgeHours,
          features: toJson(b.features),
        },
        update: {},
      }),
    null,
  );
}

/**
 * Tokens checked before outcome tracking existed: take price/liquidity from the earliest stored
 * market snapshot (features come from the latest report — flagged as backfilled).
 */
export async function backfillBaselines(limit = 300): Promise<number> {
  return safeDb(
    "backfillBaselines",
    async () => {
      const db = getDb();
      // Candidates: no baseline yet, and a price at ANY time (earliest snapshot or current report).
      // Selecting only tokens that still have a price would drop dead tokens — survivorship bias.
      const candidates = await db.$queryRaw<Array<{ address: string }>>`
        SELECT t.address FROM "Token" t
        WHERE NOT EXISTS (SELECT 1 FROM "TokenBaseline" b WHERE b."tokenAddress" = t.address)
          AND t."lastReport" IS NOT NULL
          AND (
            EXISTS (SELECT 1 FROM "MarketSnapshot" m WHERE m."tokenAddress" = t.address AND m."priceUsd" > 0)
            OR (t."lastReport"->'market'->'priceUsd'->>'value') IS NOT NULL
          )
        ORDER BY t."firstSeenAt" ASC
        LIMIT ${limit}`;
      let n = 0;
      for (const { address } of candidates) {
        const t = await db.token.findUnique({
          where: { address },
          select: { lastReport: true, lastScannedAt: true },
        });
        const report = t?.lastReport as unknown as TokenReport | null;
        if (!t || !report || typeof report !== "object" || !("scores" in report)) continue;
        const first = await db.marketSnapshot.findFirst({
          where: { tokenAddress: address, priceUsd: { gt: 0 } },
          orderBy: { timestamp: "asc" },
          select: { timestamp: true, priceUsd: true, liquidityUsd: true, marketCapUsd: true },
        });
        const current = baselineFromReport(report);
        const price = first?.priceUsd ?? current?.priceUsd ?? null;
        if (!price) continue;
        const features = reportFeatures(report);
        await db.tokenBaseline.upsert({
          where: { tokenAddress: address },
          create: {
            tokenAddress: address,
            chain: features.chain,
            capturedAt: first?.timestamp ?? t.lastScannedAt ?? new Date(report.generatedAt),
            backfilled: true,
            priceUsd: price,
            liquidityUsd: first ? first.liquidityUsd : (current?.liquidityUsd ?? null),
            marketCapUsd: first ? first.marketCapUsd : (current?.marketCapUsd ?? null),
            poolAgeHours: report.liquidity.poolAgeHours.value,
            features: toJson(features),
          },
          update: {},
        });
        n++;
      }
      return n;
    },
    0,
  );
}

const CHAIN_SLUG: Record<string, string> = { robinhood: "robinhood", base: "base", solana: "solana" };
const sameToken = (chain: string, a: string, b: string) =>
  chain === "solana" ? a === b : a.toLowerCase() === b.toLowerCase();

/** Main pool for a token = its deepest pair (same choice as the report). */
function mainPair(chain: string, token: string, pairs: PairInfo[]): PairInfo | null {
  const own = pairs.filter((p) => sameToken(chain, p.baseToken.address, token));
  if (!own.length) return null;
  return own.reduce((a, b) => ((b.liquidityUsd ?? 0) > (a.liquidityUsd ?? 0) ? b : a));
}

/** Records every due 1h / 24h / 7d observation. Runs every few minutes in the worker. */
export async function recordDueOutcomes(now = new Date(), limit = 300): Promise<number> {
  return safeDb(
    "recordDueOutcomes",
    async () => {
      const db = getDb();
      const baselines = await db.tokenBaseline.findMany({
        where: {
          capturedAt: { lte: new Date(now.getTime() - OUTCOME_HORIZONS["1h"]) },
          outcomes: { none: { horizon: "7d" } },
        },
        select: {
          tokenAddress: true,
          chain: true,
          capturedAt: true,
          priceUsd: true,
          liquidityUsd: true,
          outcomes: { select: { horizon: true } },
        },
        orderBy: { capturedAt: "asc" },
        take: 2_000,
      });
      const due = baselines
        .map((b) => ({
          b,
          horizons: dueHorizons(
            b.capturedAt,
            b.outcomes.map((o) => o.horizon as OutcomeHorizon),
            now,
          ),
        }))
        .filter((x) => x.horizons.length)
        .slice(0, limit);
      if (!due.length) return 0;

      const byChain = new Map<string, string[]>();
      for (const { b } of due)
        byChain.set(b.chain, [...(byChain.get(b.chain) ?? []), b.tokenAddress]);
      const pairs = new Map<string, PairInfo[]>();
      for (const [chain, tokens] of byChain) {
        const slug = CHAIN_SLUG[chain];
        if (!slug) continue;
        pairs.set(chain, await getProviders().market.getTokensPairs(slug, tokens));
      }

      const rows = due.flatMap(({ b, horizons }) => {
        const pair = mainPair(b.chain, b.tokenAddress, pairs.get(b.chain) ?? []);
        const obs = {
          found: !!pair,
          priceUsd: pair?.priceUsd ?? null,
          liquidityUsd: pair?.liquidityUsd ?? null,
        };
        const verdict = classifyOutcome(b, obs);
        return horizons.map((h) => ({
          tokenAddress: b.tokenAddress,
          horizon: h,
          observedAt: now,
          delayMinutes: Math.round(
            (now.getTime() - b.capturedAt.getTime() - OUTCOME_HORIZONS[h]) / 60_000,
          ),
          status: verdict.status,
          priceUsd: obs.priceUsd,
          liquidityUsd: obs.liquidityUsd,
          priceRatio: verdict.priceRatio,
          liquidityRatio: verdict.liquidityRatio,
        }));
      });
      const r = await db.tokenOutcome.createMany({ data: rows, skipDuplicates: true });
      log.info("outcomes recorded", { rows: r.count, tokens: due.length });
      return r.count;
    },
    0,
  );
}
