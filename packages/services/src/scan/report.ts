import type { Hex } from "viem";
import {
  describeError,
  getProviders, getChainProviders,
  metricsSnapshot,
  readBalances,
  toUnits,
  type Erc20Metadata,
  type ExplorerContractSource,
  type Providers,
} from "@quvr/providers";
import {
  contractFindings,
  contractSafetyScore,
  distributionFindings,
  distributionHealthScore,
  liquidityFindings,
  liquidityHealthScore,
  mainPoolShare,
  socialMomentumScore,
  t,
} from "@quvr/scoring";
import {
  appMode,
  hasValue,
  logger,
  serverEnv,
  sourced,
  toChecksum,
  unavailable,
  type Confidence,
  type ContractAnalysis,
  type CreationInfo,
  type ExternalLink,
  type PairInfo,
  type RiskFinding,
  type SimulationResult,
  type SourceHealth,
  type SourcedValue,
  type TimelineEvent,
  type TokenReport,
} from "@quvr/shared";
import { cacheGet, cacheSet, swr } from "../cache";
import { liquidityHistory, storedThesisEntries } from "../persistence";
import { ChainClock } from "./clock";
import { analyzeContract } from "./contract";
import { detectCreation } from "./creation";
import { analyzeDistribution, type DistributionResult } from "./distribution";
import { analyzeDistributionFromExplorer } from "./explorer-distribution";
import { estimatePriceImpact, loadV4Activity, type ImpactResult, type PoolActivity } from "./pool";
import { simulateBuySell } from "./simulation";
import { loadSocial, type SocialBundle } from "./social";
import { cachedErc20Metadata } from "./erc20-meta";
import { loadTransferHistory } from "./transfers";

type Settled<T> = { ok: true; value: T } | { ok: false; error: string };
async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** Whether the explorer can be used: keyed PRO API, or a public instance that answered recently. */
async function explorerUsable(p: Providers): Promise<{ usable: boolean; reason: string | null }> {
  if (p.explorer.isConfigured()) return { usable: true, reason: null };
  const cached = await cacheGet<{ usable: boolean; reason: string | null }>(
    `explorer:public-probe:${p.chain.chain.id}`,
  );
  if (cached) return cached.value;
  let result: { usable: boolean; reason: string | null };
  try {
    await p.explorer.getAddressInfo("0x0000000000000000000000000000000000000000");
    result = { usable: true, reason: null };
  } catch (e) {
    result = { usable: false, reason: `${describeError(e)} — set BLOCKSCOUT_API_KEY` };
  }
  await cacheSet(`explorer:public-probe:${p.chain.chain.id}`, result, 900);
  return result;
}

export type BuildResult = { report: TokenReport; codeHash: string | null };

/** Shown while the full build is still running (the page and bot recognise this phrase). */
export const QUICK_PENDING = "loading in the background — the full report is being built";

export async function buildTokenReport(
  address: string,
  prev: TokenReport | null = null,
  opts: { historyBudgetMs?: number; quick?: boolean; chainId?: number } = {},
): Promise<BuildResult> {
  // Quick mode: market, contract and liquidity in a few seconds; creator, holders, simulation
  // and social are filled by the full build running in the background right after.
  const quick = opts.quick === true;
  const env = serverEnv();
  const p = opts.chainId ? getChainProviders(opts.chainId) : getProviders();
  const chainCfg = p.chain.chain;
  // Chains whose full Transfer history is impractical to replay use the explorer holder list.
  const explorerHolders = chainCfg.key === "base";
  const now = new Date();
  const nowIso = now.toISOString();
  const rpcSrc = p.chain.name;
  const dexSlug = chainCfg.dexscreenerChainId;
  const blockscoutUrl = `${chainCfg.explorerUrl}/token/${toChecksum(address)}`;
  const log = logger.child({ scope: "scan", token: address });

  // ---------------------------------------------------------------- stage 1 (parallel)
  const explorerState = await explorerUsable(p);
  const [clockR, codeR, metaR, marketR, sourceR] = await Promise.all([
    settle(ChainClock.create(p.chain)),
    settle(p.chain.getCode(address)),
    settle(cachedErc20Metadata(p.chain, address)),
    dexSlug
      ? settle(p.market.getTokenPairs(dexSlug, address))
      : Promise.resolve<Settled<never>>({ ok: false, error: "chain not indexed by Dexscreener" }),
    explorerState.usable
      ? settle(p.explorer.getContractSource(address))
      : Promise.resolve<Settled<ExplorerContractSource | null>>({
          ok: false,
          error: explorerState.reason ?? "explorer unavailable",
        }),
  ]);
  const clock = clockR.ok ? clockR.value : null;
  const meta: Erc20Metadata | null = metaR.ok ? metaR.value : null;
  const pairs: PairInfo[] = marketR.ok ? marketR.value.pairs : [];
  const mainPair = pairs[0] ?? null;
  const code = codeR.ok ? (codeR.value as Hex) : null;
  const isContract = code ? code !== "0x" : null;

  // ---------------------------------------------------------------- stage 2
  const creationP = quick
    ? Promise.resolve<Settled<CreationInfo | null>>({ ok: false, error: QUICK_PENDING })
    : isContract
      ? settle(
          swr(
            `creation:${chainCfg.id}:${address}`,
            { freshSeconds: 86_400, keepSeconds: 30 * 86_400 },
            () => detectCreation(p.chain, p.explorer, address, explorerState.usable),
          ).then((r) => r.value),
        )
      : Promise.resolve<Settled<CreationInfo | null>>({
          ok: false,
          error: isContract === false ? "not a contract" : "RPC unavailable",
        });
  const contractP = code
    ? settle(analyzeContract(p.chain, address, code, sourceR.ok ? sourceR.value : null))
    : Promise.resolve<Settled<never>>({ ok: false, error: codeR.ok ? "no code" : codeR.error });
  const creationR = await creationP;
  const creation = creationR.ok ? creationR.value : null;

  const decimals = meta?.decimals ?? null;
  const totalSupplyRaw = meta?.totalSupplyRaw ?? null;
  const poolManager = chainCfg.uniswapV4PoolManager;
  const hasV4 = pairs.some((x) => x.kind === "v4");
  const quoteUsd =
    mainPair?.priceUsd && mainPair.priceNative ? mainPair.priceUsd / mainPair.priceNative : null;

  const distributionP: Promise<Settled<DistributionResult>> = quick
    ? Promise.resolve({ ok: false, error: QUICK_PENDING })
    : explorerHolders
      ? isContract && decimals !== null && totalSupplyRaw !== null && explorerState.usable
        ? settle(
            analyzeDistributionFromExplorer(p.chain, p.explorer, {
              token: address,
              decimals,
              totalSupplyRaw,
              deployer: creation?.deployer ?? null,
              poolManager,
              pairAddresses: pairs.filter((x) => x.pairAddress.length === 42).map((x) => x.pairAddress),
              hasV4Pool: hasV4,
              explorerUsable: true,
            }),
          )
        : Promise.resolve({ ok: false, error: "explorer holder list unavailable" })
    : isContract && clock && decimals !== null && totalSupplyRaw !== null
      ? settle(
          (async () => {
            const fromBlock = creation?.blockNumber ?? Math.max(0, clock.headBlock - 2_000_000);
            const history = await loadTransferHistory(
              p.chain,
              address,
              fromBlock,
              clock.headBlock,
              opts.historyBudgetMs ?? 15_000,
            );
            const res = await analyzeDistribution(p.chain, p.explorer, history, {
              token: address,
              decimals,
              totalSupplyRaw,
              deployer: creation?.deployer ?? null,
              initialMintTo: creation?.initialMintTo ?? null,
              poolManager,
              pairAddresses: pairs
                .filter((x) => x.pairAddress.length === 42)
                .map((x) => x.pairAddress),
              hasV4Pool: hasV4,
              clock,
              explorerUsable: explorerState.usable,
            });
            if (!creation) res.complete = false;
            return res;
          })(),
        )
      : Promise.resolve({ ok: false, error: "token metadata or RPC unavailable" });

  const activityP: Promise<Settled<PoolActivity | null>> = quick
    ? Promise.resolve({ ok: true, value: null })
    : mainPair?.kind === "v4" && poolManager && clock && decimals !== null
      ? settle(
          (async () => {
            const quote = mainPair.quoteToken.address;
            const quoteDecimals = /^0x0{40}$/.test(quote)
              ? 18
              : (await cachedErc20Metadata(p.chain, quote)).decimals;
            if (quoteDecimals === null) throw new Error("quote token decimals unavailable");
            return (
              await swr(
                `v4activity:${address}:${mainPair.pairAddress}`,
                { freshSeconds: 60, keepSeconds: 3_600 },
                () =>
                  loadV4Activity(
                    p.chain,
                    poolManager,
                    mainPair,
                    address,
                    decimals,
                    quoteDecimals,
                    clock,
                    { nativeUsd: quoteUsd, largeSellUsd: 1_000 },
                  ),
              )
            ).value;
          })(),
        )
      : Promise.resolve({ ok: true, value: null });
  const impactP: Promise<Settled<ImpactResult | null>> =
    mainPair && decimals !== null
      ? settle(estimatePriceImpact(p.chain, poolManager, mainPair, address, decimals))
      : Promise.resolve({ ok: true, value: null });

  const [contractR, distR, activityR, impactR, liqHist] = await Promise.all([
    contractP,
    distributionP,
    activityP,
    impactP,
    liquidityHistory(address, 24),
  ]);
  const contract = contractR.ok ? contractR.value : null;
  const dist = distR.ok ? distR.value : null;
  const activity = activityR.ok ? activityR.value : null;
  const impact = impactR.ok ? impactR.value : null;

  // ---------------------------------------------------------------- simulation
  let simR: Settled<SimulationResult>;
  if (quick) simR = { ok: false, error: QUICK_PENDING };
  else if (!isContract) simR = { ok: false, error: "not a contract" };
  else {
    const poolTarget = mainPair
      ? mainPair.kind === "v4"
        ? poolManager
        : mainPair.pairAddress.length === 42
          ? mainPair.pairAddress
          : null
      : (dist?.excluded.find((e) => e.reason === "launchpad")?.address ?? null);
    const holderRow = dist?.top.find((h) => h.isContract === false && h.balance > 0);
    simR = await settle(
      (async () => {
        const addrs = [holderRow?.address, poolTarget].filter((x): x is string => !!x);
        const bals = addrs.length
          ? await readBalances(p.chain, address, addrs)
          : new Map<string, bigint | null>();
        const hb = holderRow ? (bals.get(holderRow.address) ?? null) : null;
        const pb = poolTarget ? (bals.get(poolTarget) ?? null) : null;
        return simulateBuySell(p.chain, {
          token: address,
          poolTarget,
          holder: holderRow && hb ? { address: holderRow.address, balance: hb } : null,
          poolHolder: poolTarget && pb ? { address: poolTarget, balance: pb } : null,
        });
      })(),
    );
  }
  const simulation = simR.ok ? simR.value : null;

  // ---------------------------------------------------------------- social
  let social: SocialBundle | null = null;
  let socialError: string | null = null;
  if (quick) socialError = QUICK_PENDING;
  else if (chainCfg.key !== "robinhood") socialError = `social data covers Robinhood Chain and Solana, not ${chainCfg.name}`;
  else if (p.social.isEnabled()) {
    const r = await settle(
      loadSocial(
        p.social,
        address,
        activity?.priceSeries ?? [],
        await storedThesisEntries(address),
      ),
    );
    if (r.ok) social = r.value;
    else socialError = r.error;
  }

  // ---------------------------------------------------------------- assemble values
  const dexUrl = dexSlug ? p.market.tokenUrl(dexSlug, address) : null;
  const mSrc = (v: number | null | undefined): SourcedValue<number> =>
    marketR.ok
      ? mainPair
        ? sourced(v ?? null, "dexscreener", {
            sourceUrl: mainPair.url ?? dexUrl ?? undefined,
            confidence: "high",
            error: v === null || v === undefined ? "field not reported" : undefined,
          })
        : unavailable("dexscreener", "no trading pairs found")
      : unavailable("dexscreener", marketR.error);
  const totalLiquidity = pairs.reduce((s, x) => s + (x.liquidityUsd ?? 0), 0);
  const liquidityUsd = pairs.some((x) => x.liquidityUsd !== null) ? totalLiquidity : null;
  const mcap = mainPair?.marketCapUsd ?? mainPair?.fdvUsd ?? null;
  const supplyUnits =
    totalSupplyRaw !== null && decimals !== null ? toUnits(totalSupplyRaw, decimals) : null;

  const contractAnalysis: ContractAnalysis | null = contract?.analysis ?? null;
  const cVal: SourcedValue<ContractAnalysis> = contractAnalysis
    ? sourced(
        contractAnalysis,
        contractAnalysis.verified === null ? `${rpcSrc} bytecode` : `${rpcSrc} + blockscout`,
        { confidence: contractAnalysis.verified ? "high" : "medium", sourceUrl: blockscoutUrl },
      )
    : unavailable(rpcSrc, contractR.ok ? "unknown" : contractR.error);

  const liqTrend = (() => {
    const pts = [...liqHist];
    if (liquidityUsd !== null) pts.push({ t: now.getTime(), liquidityUsd });
    if (pts.length < 2) return null;
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    const hours = (last.t - first.t) / 3_600_000;
    if (hours < 0.5 || first.liquidityUsd <= 0) return null;
    return {
      changePct: ((last.liquidityUsd - first.liquidityUsd) / first.liquidityUsd) * 100,
      windowHours: Math.round(hours * 10) / 10,
    };
  })();

  const poolAgeHours = (() => {
    const created = pairs
      .map((x) => (x.pairCreatedAt ? Date.parse(x.pairCreatedAt) : NaN))
      .filter(Number.isFinite);
    return created.length ? (now.getTime() - Math.min(...created)) / 3_600_000 : null;
  })();

  const deployerSelling24h = !!dist?.deployerActions?.some(
    (a) => a.kind === "sell" && a.timestamp && now.getTime() - Date.parse(a.timestamp) < 86_400_000,
  );
  const distSource = explorerHolders ? "blockscout holders" : `${rpcSrc} Transfer logs`;
  const distConfidence: Confidence = dist
    ? dist.complete && dist.balanceCheck.mismatches === 0
      ? "high"
      : "low"
    : "low";
  const dv = <T>(
    v: T | null | undefined,
    conf: Confidence = distConfidence,
    opts: { approximate?: boolean } = {},
  ): SourcedValue<T> =>
    dist
      ? sourced(v ?? null, distSource, {
          confidence: conf,
          approximate: opts.approximate || !dist.complete,
          error: v === null || v === undefined ? "not computable" : undefined,
        })
      : unavailable(distSource, distR.ok ? "unknown" : distR.error);

  // ---------------------------------------------------------------- scores
  const scores = {
    contractSafety: contractSafetyScore({ analysis: contractAnalysis, simulation, now }),
    liquidityHealth: liquidityHealthScore({
      liquidityUsd,
      marketCapUsd: mcap,
      impacts: impact?.impacts ?? null,
      impactsApproximate: true,
      poolAgeHours,
      priceChange24hPct: mainPair?.priceChange.h24 ?? null,
      mainPoolShare: mainPoolShare(pairs),
      pairCount: pairs.length,
      liquidityTrendPct: liqTrend?.changePct ?? null,
      now,
    }),
    distributionHealth: distributionHealthScore({
      concentration: dist?.concentration ?? null,
      deployerShare: dist?.deployerShare ?? null,
      relatedShare: dist ? dist.clusteredShare : null,
      holderGrowth24h: dist?.holderGrowth?.h24 ?? null,
      massTransfers: dist?.massTransfers ?? null,
      holdersCount: dist?.holdersCount ?? null,
      partial: dist ? !dist.complete : undefined,
      now,
    }),
    socialMomentum: socialMomentumScore({
      available: !!social,
      theses: social?.signals ?? [],
      deployerSelling: deployerSelling24h,
      liquidityDeclining: (liqTrend?.changePct ?? 0) < -10,
      washTradingSuspected: false,
      relatedAuthorShare: null,
      now,
    }),
  };

  // ---------------------------------------------------------------- findings
  const findings: RiskFinding[] = [];
  if (explorerHolders) {
    findings.push({
      code: "data.chain-scope",
      category: "data",
      severity: "info",
      title: t(`${chainCfg.name}: часть проверок пока недоступна`, `${chainCfg.name}: some checks are not available yet`),
      explanation: t(
        "Держатели и их концентрация берутся из списка Blockscout. Рост числа держателей, новые кошельки, массовые рассылки и действия создателя для этой сети пока не отслеживаются — они отмечены «Нет данных». Связи кошельков ищутся только по общему источнику финансирования.",
        "Holders and concentration come from the Blockscout holder list. Holder growth, new wallets, mass transfers and creator activity are not tracked on this chain yet — they are marked “No data”. Wallet links use common funding sources only.",
      ),
      evidence: [],
      source: "blockscout",
      confidence: "high",
    });
  }
  if (contractAnalysis)
    findings.push(...contractFindings(contractAnalysis, simulation, cVal.source, blockscoutUrl));
  if (dist) {
    findings.push(
      ...distributionFindings(
        {
          concentration: dist.concentration,
          deployerShare: dist.deployerShare,
          relatedShare: dist.relatedShare,
          holderGrowth24h: dist.holderGrowth?.h24 ?? null,
          massTransfers: dist.massTransfers,
          holdersCount: dist.holdersCount,
          partial: !dist.complete,
          clusters: dist.clusters,
          top: dist.top,
        },
        distSource,
      ),
    );
    if (deployerSelling24h) {
      const sells = (dist.deployerActions ?? []).filter((a) => a.kind === "sell");
      findings.push({
        code: "distribution.deployer-selling",
        category: "distribution",
        severity: "high",
        title: t("Deployer продаёт", "Deployer is selling"),
        explanation: t(
          "За последние 24 часа кошелёк создателя отправлял токены в пул (продажа).",
          "In the last 24 hours the creator wallet sent tokens to a pool (a sell).",
        ),
        evidence: sells.slice(0, 3).map((s) => `tx ${s.txHash}: ${s.amount?.toFixed(2)} tokens`),
        source: distSource,
        confidence: "high",
      });
    }
    if (!dist.complete && !explorerHolders) {
      findings.push({
        code: "data.holders-partial",
        category: "data",
        severity: "info",
        title: t("Распределение рассчитано частично", "Distribution is partial"),
        explanation: t(
          "История переводов загружена не полностью, показатели держателей приблизительны.",
          "Transfer history was not fully loaded; holder metrics are approximate.",
        ),
        evidence: [creation ? "log cap reached" : "creation block unknown"],
        source: distSource,
        confidence: "high",
      });
    }
  }
  findings.push(
    ...liquidityFindings(
      {
        liquidityUsd,
        marketCapUsd: mcap,
        impacts: impact?.impacts ?? null,
        impactsApproximate: true,
        poolAgeHours,
        priceChange24hPct: mainPair?.priceChange.h24 ?? null,
        mainPoolShare: mainPoolShare(pairs),
        pairCount: pairs.length,
        liquidityTrendPct: liqTrend?.changePct ?? null,
      },
      "dexscreener + rpc",
    ),
  );
  if (
    activity?.poolKey &&
    activity.poolKey.hooks !== "0x0000000000000000000000000000000000000000"
  ) {
    findings.push({
      code: "liquidity.v4-hooks",
      category: "liquidity",
      severity: "info",
      title: t("Пул использует hook-контракт", "Pool uses a hooks contract"),
      explanation: t(
        "Основной пул Uniswap v4 подключён к hook-контракту: он может брать свои комиссии или менять логику свопа. Оценки price impact это не учитывают.",
        "The main Uniswap v4 pool is attached to a hooks contract that may charge its own fees or alter swap logic. Price impact estimates do not account for it.",
      ),
      evidence: [
        `hooks: ${activity.poolKey.hooks}`,
        `fee: ${activity.poolKey.fee}`,
        `tickSpacing: ${activity.poolKey.tickSpacing}`,
      ],
      source: `${rpcSrc} Initialize log`,
      confidence: "high",
    });
  }
  if (!explorerState.usable) {
    findings.push({
      code: "data.explorer-unavailable",
      category: "data",
      severity: "info",
      title: t("Верификация кода не проверена", "Source verification not checked"),
      explanation: t(
        "Blockscout API недоступен без ключа (защита от ботов на публичном API). Анализ выполнен по байткоду и read-only вызовам.",
        "The Blockscout API is unavailable without a key (bot protection on the public API). Analysis is based on bytecode and read-only calls.",
      ),
      evidence: [explorerState.reason ?? ""],
      source: "blockscout",
      confidence: "high",
    });
  }
  const sevRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
  findings.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  // ---------------------------------------------------------------- timeline
  const timeline: TimelineEvent[] = [];
  if (creation)
    timeline.push({
      at: creation.timestamp,
      blockNumber: creation.blockNumber,
      kind: "created",
      title: t("Создание токена", "Token created"),
      txHash: creation.txHash ?? undefined,
      source: creation.method,
    });
  const firstPair = [...pairs]
    .filter((x) => x.pairCreatedAt)
    .sort((a, b) => Date.parse(a.pairCreatedAt!) - Date.parse(b.pairCreatedAt!))[0];
  if (firstPair)
    timeline.push({
      at: firstPair.pairCreatedAt,
      blockNumber: null,
      kind: "first-pool",
      title: t(
        `Первый пул (${firstPair.dexId} ${firstPair.kind})`,
        `First pool (${firstPair.dexId} ${firstPair.kind})`,
      ),
      source: "dexscreener",
    });
  if (dist?.firstBuys[0] && clock)
    timeline.push({
      at: clock.isoAt(dist.firstBuys[0].block),
      blockNumber: dist.firstBuys[0].block,
      kind: "first-buys",
      title: t("Первые покупки", "First buys"),
      txHash: dist.firstBuys[0].txHash,
      source: distSource,
    });
  for (const th of (social?.theses ?? []).slice(0, 5))
    timeline.push({
      at: th.createdAt,
      blockNumber: null,
      kind: "thesis",
      title: t(`Тезис @${th.authorHandle}`, `Thesis by @${th.authorHandle}`),
      source: th.source,
    });
  for (const s of (dist?.deployerActions ?? []).filter((a) => a.kind === "sell").slice(0, 5))
    timeline.push({
      at: s.timestamp,
      blockNumber: s.blockNumber,
      kind: "deployer-sell",
      title: t("Deployer продал", "Deployer sold"),
      txHash: s.txHash,
      source: distSource,
    });
  for (const s of (activity?.largeSells ?? []).slice(-5))
    timeline.push({
      at: s.at,
      blockNumber: s.block,
      kind: "large-sell",
      title: t(
        `Крупная продажа ≈ $${Math.round(s.usd ?? 0)}`,
        `Large sell ≈ $${Math.round(s.usd ?? 0)}`,
      ),
      txHash: s.txHash,
      source: `${rpcSrc} Swap logs`,
    });
  for (const sg of (social?.signals ?? []).filter((x) => x.authorSold).slice(0, 5))
    timeline.push({
      at: null,
      blockNumber: null,
      kind: "author-exit",
      title: t(`@${sg.authorHandle} вышел из позиции`, `@${sg.authorHandle} exited`),
      source: "fomoapi",
    });
  timeline.sort(
    (a, b) => (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity),
  );

  // ---------------------------------------------------------------- sources
  const metrics = new Map(metricsSnapshot().map((m) => [m.source, m]));
  const health = (source: string, enabled: boolean, note?: string): SourceHealth => {
    const m = metrics.get(source);
    if (!enabled)
      return {
        source,
        status: "disabled",
        circuit: "closed",
        successRate: null,
        p50LatencyMs: null,
        lastSuccessAt: null,
        lastError: null,
        note,
      };
    return {
      source,
      status: !m
        ? "ok"
        : m.circuit === "open"
          ? "down"
          : m.successRate !== null && m.successRate < 0.8
            ? "degraded"
            : "ok",
      circuit: m?.circuit ?? "closed",
      successRate: m?.successRate ?? null,
      p50LatencyMs: m?.p50LatencyMs ?? null,
      lastSuccessAt: m?.lastSuccessAt ?? null,
      lastError: m?.lastError ?? null,
      note,
    };
  };
  const sources: SourceHealth[] = [
    health(rpcSrc, true),
    health("dexscreener", true),
    health(
      "blockscout",
      explorerState.usable,
      explorerState.usable ? undefined : "BLOCKSCOUT_API_KEY not set",
    ),
    health("fomoapi", p.social.isEnabled(), p.social.isEnabled() ? undefined : "onchain-only mode"),
  ];

  const socialReason = !p.social.isEnabled()
    ? t(
        "Социальные данные недоступны: FOMO_API_KEY не задан (режим onchain-only).",
        "Social data unavailable: FOMO_API_KEY is not set (onchain-only mode).",
      )
    : socialError
      ? t(
          `Социальный источник не ответил: ${socialError}`,
          `Social provider failed: ${socialError}`,
        )
      : null;
  const socialSv = <T>(v: T | null | undefined): SourcedValue<T> =>
    social
      ? sourced(v ?? null, "fomoapi", {
          confidence: "medium",
          fetchedAt: social.fetchedAt,
          isStale: social.isStale,
        })
      : unavailable("fomoapi", socialReason?.en ?? "unavailable");

  const links: ExternalLink[] = marketR.ok ? marketR.value.links : [];
  const report: TokenReport = {
    chainId: chainCfg.id,
    chainName: chainCfg.name,
    address,
    checksumAddress: toChecksum(address),
    generatedAt: nowIso,
    mode: appMode(env),
    blockNumber: clock
      ? sourced(clock.headBlock, rpcSrc)
      : unavailable(rpcSrc, clockR.ok ? "unknown" : clockR.error),
    token: {
      name: meta?.name
        ? sourced(meta.name, `${rpcSrc} name()`)
        : mainPair?.baseToken.name
          ? sourced(mainPair.baseToken.name, "dexscreener", { confidence: "medium" })
          : unavailable(rpcSrc, metaR.ok ? "name() not available" : metaR.error),
      symbol: meta?.symbol
        ? sourced(meta.symbol, `${rpcSrc} symbol()`)
        : mainPair?.baseToken.symbol
          ? sourced(mainPair.baseToken.symbol, "dexscreener", { confidence: "medium" })
          : unavailable(rpcSrc, metaR.ok ? "symbol() not available" : metaR.error),
      decimals:
        decimals !== null
          ? sourced(decimals, `${rpcSrc} decimals()`)
          : unavailable(rpcSrc, "decimals() not available"),
      totalSupply:
        supplyUnits !== null
          ? sourced(supplyUnits, `${rpcSrc} totalSupply()`)
          : unavailable(rpcSrc, "totalSupply() not available"),
      imageUrl: marketR.ok ? marketR.value.imageUrl : null,
    },
    links: {
      blockscout: blockscoutUrl,
      dexscreener: dexUrl,
      fomo: null, // no public, stable token URL format confirmed — not guessed
      external: marketR.ok
        ? sourced(links, "dexscreener", { confidence: "medium" })
        : unavailable("dexscreener", marketR.error),
    },
    market: {
      priceUsd: mSrc(mainPair?.priceUsd),
      priceNative: mSrc(mainPair?.priceNative),
      marketCapUsd: mSrc(mainPair?.marketCapUsd),
      fdvUsd: mSrc(mainPair?.fdvUsd),
      liquidityUsd: marketR.ok
        ? pairs.length
          ? sourced(liquidityUsd, "dexscreener", { sourceUrl: dexUrl ?? undefined })
          : unavailable("dexscreener", "no trading pairs found")
        : unavailable("dexscreener", marketR.error),
      volume:
        marketR.ok && mainPair
          ? sourced(mainPair.volume, "dexscreener", { sourceUrl: mainPair.url ?? undefined })
          : unavailable("dexscreener", marketR.ok ? "no trading pairs found" : marketR.error),
      txns:
        marketR.ok && mainPair
          ? sourced(mainPair.txns, "dexscreener")
          : unavailable("dexscreener", marketR.ok ? "no trading pairs found" : marketR.error),
      priceChange:
        marketR.ok && mainPair
          ? sourced(mainPair.priceChange, "dexscreener")
          : unavailable("dexscreener", marketR.ok ? "no trading pairs found" : marketR.error),
      pairs: marketR.ok ? sourced(pairs, "dexscreener") : unavailable("dexscreener", marketR.error),
    },
    liquidity: {
      mainPair: mainPair
        ? sourced(mainPair, "dexscreener", { sourceUrl: mainPair.url ?? undefined })
        : unavailable("dexscreener", marketR.ok ? "no trading pairs found" : marketR.error),
      mainPoolShare: marketR.ok
        ? sourced(mainPoolShare(pairs), "dexscreener")
        : unavailable("dexscreener", marketR.error),
      liquidityToMcap:
        liquidityUsd !== null && mcap
          ? sourced(liquidityUsd / mcap, "dexscreener")
          : unavailable("dexscreener", "liquidity or market cap missing"),
      poolAgeHours:
        poolAgeHours !== null
          ? sourced(poolAgeHours, "dexscreener")
          : unavailable("dexscreener", "pair creation time missing"),
      netFlowNative: activity
        ? sourced(activity.netFlow, `${rpcSrc} v4 Swap logs`, {
            confidence: activity.complete ? "high" : "low",
          })
        : unavailable(
            `${rpcSrc} Swap logs`,
            activityR.ok ? "only available for Uniswap v4 main pools" : activityR.error,
          ),
      priceImpact: impact
        ? sourced(impact.impacts, `${rpcSrc} pool state`, {
            approximate: true,
            confidence: "medium",
          })
        : unavailable(
            `${rpcSrc} pool state`,
            impactR.ok ? "pool state not readable for this pool type" : impactR.error,
          ),
      liquidityTrend: liqTrend
        ? sourced(liqTrend, "quvr snapshots", { confidence: "medium" })
        : unavailable("quvr snapshots", "not enough snapshot history yet"),
    },
    contract: cVal,
    creation: creation
      ? sourced(creation, creation.method === "explorer" ? "blockscout" : `${rpcSrc} mint log`, {
          sourceUrl: creation.txHash ? `${chainCfg.explorerUrl}/tx/${creation.txHash}` : undefined,
        })
      : unavailable(rpcSrc, creationR.ok ? "no mint event found" : creationR.error),
    simulation: simulation
      ? sourced(simulation, `${rpcSrc} eth_call`, {
          confidence: simulation.status === "unavailable" ? "low" : "medium",
        })
      : unavailable(`${rpcSrc} eth_call`, simR.ok ? "unknown" : simR.error),
    distribution: {
      holdersCount: dv(dist?.holdersCount),
      top: dv(dist?.top),
      concentration: dv(dist?.concentration),
      excluded: dv(dist?.excluded, "high"),
      deployerShare: dv(dist?.deployerShare, "high"),
      relatedShare: dv(dist?.relatedShare, "low"),
      clusters: dv(dist?.clusters, "low"),
      holderGrowth: dv(dist?.holderGrowth),
      newWallets24h: dv(dist?.newWallets24h),
      freshWalletShare: dv(dist?.freshWalletShare, "medium"),
      massTransfers: dv(dist?.massTransfers, "medium"),
    },
    deployerActions: dist?.deployerActions
      ? sourced(dist.deployerActions, distSource, { confidence: creation ? "high" : "low" })
      : dist
        ? unavailable(distSource, `creator activity is not tracked on ${chainCfg.name} yet`)
      : unavailable(distSource, distR.ok ? "unknown" : distR.error),
    social: {
      available: !!social,
      reason: socialReason,
      theses: socialSv(social?.theses),
      authors: socialSv(social?.authors),
      trendingRank: socialSv(social?.trendingRank),
      trackedHolders: socialSv(social?.trackedHolders),
    },
    history: {
      price: activity
        ? sourced(
            activity.priceSeries.map((x) => ({
              t: x.t,
              priceNative: x.priceNative,
              priceUsd: quoteUsd ? x.priceNative * quoteUsd : null,
            })),
            `${rpcSrc} v4 Swap logs`,
            { confidence: "high" },
          )
        : unavailable(
            `${rpcSrc} Swap logs`,
            activityR.ok ? "only available for Uniswap v4 main pools" : activityR.error,
          ),
      liquidity: sourced(
        liqHist.concat(liquidityUsd !== null ? [{ t: now.getTime(), liquidityUsd }] : []),
        "quvr snapshots (dexscreener)",
        { confidence: "medium" },
      ),
    },
    timeline,
    findings,
    scores,
    sources,
  };

  const merged = prev ? mergeWithPrevious(report, prev) : report;
  log.info("report built", {
    ms: Date.now() - now.getTime(),
    findings: findings.length,
    pairs: pairs.length,
    holders: dist?.holdersCount ?? null,
  });
  return { report: merged, codeHash: contract?.codeHash ?? null };
}

function isSourced(v: unknown): v is SourcedValue<unknown> {
  return (
    !!v &&
    typeof v === "object" &&
    "value" in v &&
    "source" in v &&
    "fetchedAt" in v &&
    "isStale" in v
  );
}

/**
 * Provider failures must not blank the page: when a fresh value failed (value null + error)
 * but the previous report had a good value, the old value is shown, marked stale with its
 * original fetchedAt.
 */
export function mergeWithPrevious<T>(fresh: T, prev: unknown): T {
  if (isSourced(fresh)) {
    if (fresh.value === null && fresh.error && isSourced(prev) && hasValue(prev)) {
      return { ...prev, isStale: true, error: fresh.error } as T;
    }
    return fresh;
  }
  if (
    fresh &&
    typeof fresh === "object" &&
    !Array.isArray(fresh) &&
    prev &&
    typeof prev === "object"
  ) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fresh))
      out[k] = mergeWithPrevious(v, (prev as Record<string, unknown>)[k]);
    return out as T;
  }
  return fresh;
}
