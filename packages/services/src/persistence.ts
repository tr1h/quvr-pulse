import { getDb, isDbConfigured, toJson, type Prisma } from "@quvr/db";
import { checkOperation, metricsSnapshot } from "@quvr/providers";
import { captureBaseline } from "./outcomes";
import { logger, type LiquidityPoint, type RiskFinding, type TokenReport } from "@quvr/shared";

let dbDownUntil = 0;

/** Runs a DB operation; on failure logs (rate-limited) and returns the fallback. */
export async function safeDb<T>(op: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!isDbConfigured() || Date.now() < dbDownUntil) return fallback;
  try {
    return await fn();
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/Can't reach database|ECONNREFUSED|connect|P1001|P1017/i.test(msg))
      dbDownUntil = Date.now() + 15_000;
    logger.warn("db operation failed", { op, error: msg.split("\n").slice(-1)[0]?.slice(0, 300) });
    return fallback;
  }
}

export function dbAvailable() {
  return isDbConfigured() && Date.now() >= dbDownUntil;
}

const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;

export async function persistReport(report: TokenReport, meta: { codeHash: string | null }) {
  checkOperation();
  const db = getDb();
  const a = report.address;
  await safeDb(
    "persistReport",
    async () => {
      const t = report.token;
      checkOperation();
      await db.token.createMany({
        skipDuplicates: true,
        data: [
          {
            address: a,
            chainId: report.chainId,
            name: t.name.value,
            symbol: t.symbol.value,
            decimals: t.decimals.value,
            imageUrl: t.imageUrl,
            links: toJson(report.links.external.value ?? []),
            lastScannedAt: new Date(report.generatedAt),
            lastReport: toJson(report),
          },
        ],
      });
      checkOperation();
      const accepted = await db.token.updateMany({
        where: {
          address: a,
          OR: [{ lastScannedAt: null }, { lastScannedAt: { lte: new Date(report.generatedAt) } }],
        },
        data: {
          chainId: report.chainId,
          name: t.name.value ?? undefined,
          symbol: t.symbol.value ?? undefined,
          decimals: t.decimals.value ?? undefined,
          imageUrl: t.imageUrl ?? undefined,
          ...(report.links.external.value
            ? { links: toJson(report.links.external.value), socialLinksAt: new Date() }
            : {}),
          lastScannedAt: new Date(report.generatedAt),
          lastReport: toJson(report),
        },
      });
      if (!accepted.count) return;

      await captureBaseline(report);

      const c = report.contract.value;
      const cr = report.creation.value;
      if (c && meta.codeHash) {
        await db.tokenContract.upsert({
          where: { tokenAddress: a },
          create: {
            tokenAddress: a,
            codeHash: meta.codeHash,
            bytecodeSize: c.bytecodeSize ?? 0,
            deployer: cr?.deployer,
            factory: cr?.factory,
            creationTx: cr?.txHash,
            creationBlock: cr?.blockNumber,
            createdAtChain: cr?.timestamp ? new Date(cr.timestamp) : null,
            verified: c.verified,
            isProxy: c.proxy.isProxy,
            implementation: c.proxy.implementation,
            owner: c.owner.address,
            analysis: toJson(c),
          },
          update: {
            codeHash: meta.codeHash,
            bytecodeSize: c.bytecodeSize ?? 0,
            deployer: cr?.deployer ?? undefined,
            factory: cr?.factory ?? undefined,
            creationTx: cr?.txHash ?? undefined,
            creationBlock: cr?.blockNumber ?? undefined,
            verified: c.verified,
            isProxy: c.proxy.isProxy,
            implementation: c.proxy.implementation,
            owner: c.owner.address,
            analysis: toJson(c),
            analyzedAt: new Date(),
          },
        });
      }

      const pairs = report.market.pairs.value ?? [];
      for (const p of pairs) {
        await db.tradingPair.upsert({
          where: { pairAddress: p.pairAddress },
          create: {
            pairAddress: p.pairAddress,
            tokenAddress: a,
            dexId: p.dexId,
            kind: p.kind,
            quoteAddress: p.quoteToken.address,
            quoteSymbol: p.quoteToken.symbol,
            pairCreatedAt: p.pairCreatedAt ? new Date(p.pairCreatedAt) : null,
          },
          update: { dexId: p.dexId, kind: p.kind },
        });
      }

      const m = report.market;
      if (!m.priceUsd.isStale && (m.priceUsd.value !== null || m.liquidityUsd.value !== null)) {
        const main = report.liquidity.mainPair.value;
        await db.marketSnapshot.create({
          data: {
            tokenAddress: a,
            pairAddress: main?.pairAddress ?? null,
            priceUsd: m.priceUsd.value,
            priceNative: m.priceNative.value,
            marketCapUsd: m.marketCapUsd.value,
            fdvUsd: m.fdvUsd.value,
            liquidityUsd: m.liquidityUsd.value,
            volumeH24: m.volume.value?.h24 ?? null,
            volumeH1: m.volume.value?.h1 ?? null,
            buysH24: m.txns.value?.h24?.buys ?? null,
            sellsH24: m.txns.value?.h24?.sells ?? null,
            source: m.priceUsd.source,
            confidence: m.priceUsd.confidence,
          },
        });
        await db.liquiditySnapshot.create({
          data: {
            tokenAddress: a,
            pairAddress: main?.pairAddress ?? null,
            liquidityUsd: m.liquidityUsd.value,
            impacts: report.liquidity.priceImpact.value
              ? toJson(report.liquidity.priceImpact.value)
              : undefined,
            source: m.liquidityUsd.source,
          },
        });
      }

      const d = report.distribution;
      if (d.top.value && !d.top.isStale && report.blockNumber.value) {
        await db.holderSnapshot.create({
          data: {
            tokenAddress: a,
            blockNumber: report.blockNumber.value,
            holdersCount: d.holdersCount.value,
            top1: d.concentration.value?.top1,
            top5: d.concentration.value?.top5,
            top10: d.concentration.value?.top10,
            top20: d.concentration.value?.top20,
            deployerShare: d.deployerShare.value,
            relatedShare: d.relatedShare.value,
            topHolders: toJson(d.top.value),
            excluded: toJson(d.excluded.value ?? []),
            clusters: toJson(d.clusters.value ?? []),
            complete: d.top.confidence !== "low",
            source: d.top.source,
          },
        });
      }

      await persistFindings(a, report.findings);

      const s = report.scores;
      await db.scoreSnapshot.create({
        data: {
          tokenAddress: a,
          contractSafety: s.contractSafety.value,
          liquidityHealth: s.liquidityHealth.value,
          distributionHealth: s.distributionHealth.value,
          socialMomentum: s.socialMomentum.value,
          details: toJson(s),
        },
      });

      for (const th of report.social.theses.value ?? []) {
        const trader = await db.trader.upsert({
          where: { handle: th.authorHandle },
          create: { handle: th.authorHandle, displayName: th.authorName },
          update: {},
        });
        await db.thesis.upsert({
          where: { id: th.id },
          create: {
            id: th.id,
            traderId: trader.id,
            tokenAddress: a,
            text: th.text,
            publishedAt: new Date(th.createdAt),
            likes: th.likes,
            isDev: th.isDev,
            tradeUsd: th.tradeUsd,
            priceAtPublishNative: th.priceAtPublishNative,
            source: th.source,
          },
          update: {
            likes: th.likes,
            // Entry price is written once and never replaced (no look-ahead).
            outcome15m: typeof th.outcomes["15m"] === "number" ? th.outcomes["15m"] : undefined,
            outcome1h: typeof th.outcomes["1h"] === "number" ? th.outcomes["1h"] : undefined,
            outcome6h: typeof th.outcomes["6h"] === "number" ? th.outcomes["6h"] : undefined,
            outcome24h: typeof th.outcomes["24h"] === "number" ? th.outcomes["24h"] : undefined,
          },
        });
        // Stream-collected theses arrive without a price: set the entry once, never overwrite.
        if (th.priceAtPublishNative !== null) {
          await db.thesis.updateMany({
            where: { id: th.id, priceAtPublishNative: null },
            data: { priceAtPublishNative: th.priceAtPublishNative },
          });
        }
      }
      for (const au of report.social.authors.value ?? []) {
        await db.trader.upsert({
          where: { handle: au.handle },
          create: {
            handle: au.handle,
            displayName: au.displayName,
            verified: au.verified,
            stats: toJson(au),
            qualityScore: au.qualityScore,
            qualityTier: au.qualityTier,
            statsAt: new Date(),
          },
          update: {
            displayName: au.displayName,
            verified: au.verified,
            stats: toJson(au),
            qualityScore: au.qualityScore,
            qualityTier: au.qualityTier,
            statsAt: new Date(),
          },
        });
      }
    },
    undefined,
  );
}

async function persistFindings(token: string, findings: RiskFinding[]) {
  const db = getDb();
  const codes = findings.map((f) => f.code);
  await db.riskFinding.updateMany({
    where: { tokenAddress: token, code: { notIn: codes }, active: true },
    data: { active: false },
  });
  for (const f of findings) {
    const severity = SEVERITIES.includes(f.severity) ? f.severity : "info";
    await db.riskFinding.upsert({
      where: { tokenAddress_code: { tokenAddress: token, code: f.code } },
      create: {
        tokenAddress: token,
        code: f.code,
        category: f.category,
        severity,
        title: toJson(f.title),
        explanation: toJson(f.explanation),
        evidence: toJson(f.evidence),
        source: f.source,
        confidence: f.confidence,
      },
      update: {
        severity,
        title: toJson(f.title),
        explanation: toJson(f.explanation),
        evidence: toJson(f.evidence),
        active: true,
        lastSeenAt: new Date(),
      },
    });
  }
}

export async function loadLastReport(address: string): Promise<TokenReport | null> {
  return safeDb(
    "loadLastReport",
    async () => {
      const t = await getDb().token.findUnique({
        where: { address },
        select: { lastReport: true },
      });
      return (t?.lastReport as unknown as TokenReport) ?? null;
    },
    null,
  );
}

export async function liquidityHistory(address: string, hours: number): Promise<LiquidityPoint[]> {
  return safeDb(
    "liquidityHistory",
    async () => {
      const rows = await getDb().marketSnapshot.findMany({
        where: {
          tokenAddress: address,
          timestamp: { gte: new Date(Date.now() - hours * 3_600_000) },
          liquidityUsd: { not: null },
        },
        orderBy: { timestamp: "asc" },
        select: { timestamp: true, liquidityUsd: true },
        take: 5_000,
      });
      return rows.map((r) => ({ t: r.timestamp.getTime(), liquidityUsd: r.liquidityUsd! }));
    },
    [],
  );
}

export async function storedThesisEntries(address: string): Promise<Map<string, number | null>> {
  return safeDb(
    "storedThesisEntries",
    async () => {
      const rows = await getDb().thesis.findMany({
        where: { tokenAddress: address },
        select: { id: true, priceAtPublishNative: true },
      });
      return new Map(rows.map((r) => [r.id, r.priceAtPublishNative]));
    },
    new Map(),
  );
}

export async function recordSourceStatus(
  reporter: string,
  extra: Array<{ source: string; status: string; note: string }> = [],
) {
  await safeDb(
    "recordSourceStatus",
    async () => {
      for (const m of metricsSnapshot()) {
        const status =
          m.circuit === "open"
            ? "down"
            : m.successRate !== null && m.successRate < 0.8
              ? "degraded"
              : "ok";
        const data = {
          status,
          successRate: m.successRate,
          p50LatencyMs: m.p50LatencyMs,
          p95LatencyMs: m.p95LatencyMs,
          calls: m.calls,
          failures: m.failures,
          lastSuccessAt: m.lastSuccessAt ? new Date(m.lastSuccessAt) : null,
          lastErrorAt: m.lastErrorAt ? new Date(m.lastErrorAt) : null,
          lastError: m.lastError,
          reporter,
        };
        await getDb().dataSourceStatus.upsert({
          where: { source: `${reporter}:${m.source}` },
          create: { source: `${reporter}:${m.source}`, ...data },
          update: data,
        });
      }
      for (const e of extra) {
        await getDb().dataSourceStatus.upsert({
          where: { source: `${reporter}:${e.source}` },
          create: { source: `${reporter}:${e.source}`, status: e.status, note: e.note, reporter },
          update: { status: e.status, note: e.note },
        });
      }
    },
    undefined,
  );
}

export async function recentFindings(limit = 10) {
  return safeDb(
    "recentFindings",
    () =>
      getDb().riskFinding.findMany({
        where: { active: true, severity: { in: ["high", "critical"] } },
        orderBy: { lastSeenAt: "desc" },
        take: limit,
        include: { token: { select: { symbol: true, name: true } } },
      }),
    [] as Array<
      Prisma.RiskFindingGetPayload<{ include: { token: { select: { symbol: true; name: true } } } }>
    >,
  );
}
