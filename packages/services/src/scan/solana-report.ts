import {
  describeError,
  getProviders,
  getSolanaRpc,
  metricsSnapshot,
  type SolanaMintInfo,
} from "@quvr/providers";
import {
  analyzeSolanaMint,
  concentrationOf,
  contractSafetyScore,
  distributionFindings,
  distributionHealthScore,
  liquidityFindings,
  liquidityHealthScore,
  mainPoolShare,
  socialMomentumScore,
  solanaWording,
  t,
} from "@quvr/scoring";
import {
  appMode,
  isOnCurve,
  logger,
  serverEnv,
  SOLANA,
  sourced,
  unavailable,
  type DeployerAction,
  type ExcludedHolder,
  type RelatedCluster,
  type HolderRow,
  type PairInfo,
  type RiskFinding,
  type SourceHealth,
  type SourcedValue,
  type TimelineEvent,
  type TokenReport,
} from "@quvr/shared";
import { liquidityHistory, storedThesisEntries } from "../persistence";
import { estimatePriceImpact } from "./pool";
import { mergeWithPrevious } from "./report";
import { loadSocial, type SocialBundle } from "./social";
import {
  detectSolanaCreation,
  solanaCreatorActions,
  solanaRelatedClusters,
  type SolanaCreation,
} from "./solana-creator";

type Settled<T> = { ok: true; value: T } | { ok: false; error: string };
async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

type SolanaHolders = {
  raw: Array<{ owner: string; tokenAccount: string | null; amountRaw: bigint }>;
  top: HolderRow[];
  excluded: ExcludedHolder[];
  concentration: { top1: number; top5: number; top10: number; top20: number };
};

const VAULT_LABEL = t(
  "Хранилище программы (пул, bonding curve или другая программа)",
  "Program vault (pool, bonding curve or other program)",
);

/**
 * Top holders from the 20 largest token accounts. Owners that are program-derived addresses
 * (off the ed25519 curve) are pool/curve vaults and are excluded from concentration. The full
 * holder count is not available from standard RPC, so it stays "no data".
 */
async function loadSolanaHolders(mint: string, info: SolanaMintInfo): Promise<SolanaHolders> {
  const rpc = getSolanaRpc();
  const largest = await rpc.getLargestAccounts(mint);
  const owners = await rpc.getAccountOwners(largest.map((a) => a.account));
  const scale = 10 ** info.decimals;
  const supply = Number(info.supplyRaw) / scale;
  const byOwner = new Map<string, number>();
  const raw = new Map<string, { owner: string; tokenAccount: string | null; amountRaw: bigint }>();
  for (let i = 0; i < largest.length; i++) {
    const owner = owners[i]?.owner ?? largest[i]!.account;
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + Number(largest[i]!.amountRaw) / scale);
    const prev = raw.get(owner);
    raw.set(owner, {
      owner,
      tokenAccount: prev?.tokenAccount ?? largest[i]!.account,
      amountRaw: (prev?.amountRaw ?? 0n) + largest[i]!.amountRaw,
    });
  }
  const excluded: ExcludedHolder[] = [];
  const regular: Array<[string, number]> = [];
  for (const [owner, amount] of byOwner) {
    if (!isOnCurve(owner)) {
      excluded.push({
        address: owner,
        balance: amount,
        shareOfTotal: supply > 0 ? amount / supply : 0,
        reason: "dex-pool",
        label: VAULT_LABEL,
      });
    } else regular.push([owner, amount]);
  }
  const excludedTotal = excluded.reduce((s, e) => s + e.balance, 0);
  const circulating = Math.max(supply - excludedTotal, 0) || supply;
  regular.sort((a, b) => b[1] - a[1]);
  const top: HolderRow[] = regular.slice(0, 20).map(([address, balance]) => ({
    address,
    balance,
    share: circulating > 0 ? balance / circulating : 0,
    shareOfTotal: supply > 0 ? balance / supply : 0,
    isContract: false,
    tags: [],
  }));
  const regularRaw = regular.map(([o]) => raw.get(o)!).filter(Boolean);
  return { raw: regularRaw, top, excluded, concentration: concentrationOf(top) };
}

export async function buildSolanaTokenReport(
  mint: string,
  prev: TokenReport | null = null,
): Promise<{ report: TokenReport; codeHash: string | null }> {
  const env = serverEnv();
  const p = getProviders();
  const rpc = getSolanaRpc();
  const now = new Date();
  const solscan = `${SOLANA.explorerUrl}/token/${mint}`;
  const dexUrl = p.market.tokenUrl("solana", mint);
  const rpcSrc = rpc.keyed ? "solana rpc (keyed)" : "solana public rpc";

  const [mintR, marketR] = await Promise.all([
    settle(rpc.getMint(mint)),
    settle(p.market.getTokenPairs("solana", mint)),
  ]);
  const info = mintR.ok ? mintR.value : null;
  const pairs: PairInfo[] = marketR.ok ? marketR.value.pairs : [];
  const mainPair = pairs[0] ?? null;

  const holdersP: Promise<Settled<SolanaHolders>> = info
    ? settle(loadSolanaHolders(mint, info))
    : Promise.resolve({ ok: false, error: mintR.ok ? "not a token mint" : mintR.error });
  const impactP =
    mainPair && info
      ? settle(estimatePriceImpact(p.chain, null, mainPair, mint, info.decimals))
      : Promise.resolve<Settled<null>>({ ok: true, value: null });
  const [holdersR, impactR, liqHist] = await Promise.all([
    holdersP,
    impactP,
    liquidityHistory(mint, 24),
  ]);
  const holders = holdersR.ok ? holdersR.value : null;
  const impact = impactR.ok ? impactR.value : null;
  const holdersError = holdersR.ok
    ? null
    : /rate|429|personal token|upgrade/i.test(holdersR.error) && !rpc.keyed
      ? "top holders need a keyed Solana RPC (SOLANA_RPC_URL): the public endpoint blocks getTokenLargestAccounts"
      : holdersR.error;

  // ---------------------------------------------------------------- creator & relations
  const creationR: Settled<SolanaCreation> = rpc.keyed
    ? await settle(detectSolanaCreation(mint))
    : { ok: false, error: "creator detection needs a keyed Solana RPC (SOLANA_RPC_URL)" };
  const creation = creationR.ok ? creationR.value : null;
  const creator = creation?.creator ?? null;
  const [actionsR, creatorBalR] = await Promise.all([
    creator
      ? settle(solanaCreatorActions(mint, creator))
      : Promise.resolve<Settled<{ actions: DeployerAction[]; txs: null }>>({
          ok: false,
          error: "creator unknown",
        }),
    creator
      ? settle(rpc.getOwnerBalance(creator, mint))
      : Promise.resolve<Settled<bigint>>({ ok: false, error: "creator unknown" }),
  ]);
  const creatorActions = actionsR.ok ? actionsR.value : null;
  const deployerShare =
    creatorBalR.ok && info && info.supplyRaw > 0n
      ? Number((creatorBalR.value * 1_000_000_000n) / info.supplyRaw) / 1e9
      : null;
  const relR: Settled<{
    clusters: RelatedCluster[];
    coverage: { funders: number; firstBuys: number; checked: number; serviceFunders: number };
  }> =
    holders && info && rpc.keyed
      ? await settle(
          solanaRelatedClusters({
            holders: holders.raw,
            creator,
            creatorTxs: creatorActions?.txs ?? null,
            mint,
            supplyRaw: info.supplyRaw,
          }),
        )
      : { ok: false, error: holdersError ?? "holders unavailable" };
  const clusters = relR.ok ? relR.value.clusters : null;
  if (holders) {
    const inCluster = new Set((clusters ?? []).flatMap((c) => c.wallets));
    for (const h of holders.top) {
      if (creator && h.address === creator) h.tags.push("deployer");
      if (inCluster.has(h.address)) h.tags.push("possibly-related");
    }
  }
  const deployerLinked = new Set(
    (clusters ?? []).filter((c) => c.linkedToDeployer).flatMap((c) => c.wallets),
  );
  if (creator) deployerLinked.delete(creator);
  const shareOfTotal = new Map((holders?.top ?? []).map((h) => [h.address, h.shareOfTotal]));
  const relatedShare = clusters
    ? [...deployerLinked].reduce((sum, a) => sum + (shareOfTotal.get(a) ?? 0), 0)
    : null;
  const clusteredShare = clusters
    ? clusters
        .filter((c) => c.confidence !== "low")
        .reduce((sum, c) => sum + c.combinedShareOfTotal, 0)
    : null;
  const deployerSelling24h = !!creatorActions?.actions.some(
    (a) => a.kind === "sell" && a.timestamp && now.getTime() - Date.parse(a.timestamp) < 86_400_000,
  );

  const mintAnalysis = info
    ? analyzeSolanaMint(info, (a) => {
        try {
          return isOnCurve(a);
        } catch {
          return null;
        }
      })
    : null;

  let social: SocialBundle | null = null;
  let socialError: string | null = null;
  if (p.social.isEnabled()) {
    const r = await settle(
      loadSocial(p.social, mint, [], await storedThesisEntries(mint), { chain: "solana" }),
    );
    if (r.ok) social = r.value;
    else socialError = r.error;
  }

  // ---------------------------------------------------------------- values
  const totalLiq = pairs.reduce((s, x) => s + (x.liquidityUsd ?? 0), 0);
  const liquidityUsd = pairs.some((x) => x.liquidityUsd !== null) ? totalLiq : null;
  const mcap = mainPair?.marketCapUsd ?? mainPair?.fdvUsd ?? null;
  const poolAgeHours = (() => {
    const c = pairs
      .map((x) => (x.pairCreatedAt ? Date.parse(x.pairCreatedAt) : NaN))
      .filter(Number.isFinite);
    return c.length ? (now.getTime() - Math.min(...c)) / 3_600_000 : null;
  })();
  const liqTrend = (() => {
    const pts = [
      ...liqHist,
      ...(liquidityUsd !== null ? [{ t: now.getTime(), liquidityUsd }] : []),
    ];
    if (pts.length < 2) return null;
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    const hours = (b.t - a.t) / 3_600_000;
    return hours < 0.5 || a.liquidityUsd <= 0
      ? null
      : {
          changePct: ((b.liquidityUsd - a.liquidityUsd) / a.liquidityUsd) * 100,
          windowHours: Math.round(hours * 10) / 10,
        };
  })();
  const mSrc = (v: number | null | undefined): SourcedValue<number> =>
    marketR.ok
      ? mainPair
        ? sourced(v ?? null, "dexscreener", {
            sourceUrl: mainPair.url ?? dexUrl,
            error: v === null || v === undefined ? "field not reported" : undefined,
          })
        : unavailable("dexscreener", "no trading pairs found")
      : unavailable("dexscreener", marketR.error);
  const hv = <T>(
    v: T | null | undefined,
    conf: "low" | "medium" | "high" = "medium",
  ): SourcedValue<T> =>
    holders
      ? sourced(v ?? null, rpcSrc, { confidence: conf, approximate: true })
      : unavailable(rpcSrc, holdersError ?? "unknown");
  const noHistory = (what: string) =>
    unavailable<never>(rpcSrc, `${what} is not implemented for Solana yet`);

  const scores = {
    contractSafety: solanaWording(
      contractSafetyScore({ analysis: mintAnalysis?.analysis ?? null, simulation: null, now }),
    ),
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
      concentration: holders?.concentration ?? null,
      deployerShare,
      relatedShare: clusteredShare,
      holderGrowth24h: null,
      massTransfers: null,
      holdersCount: null,
      partial: true,
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

  const findings: RiskFinding[] = [...(mintAnalysis?.findings ?? [])];
  if (mintR.ok && !info) {
    findings.unshift({
      code: "solana.not-a-mint",
      category: "contract",
      severity: "high",
      title: t("Это не адрес токена", "Not a token mint"),
      explanation: t(
        "По адресу нет mint-аккаунта SPL: это кошелёк или другой аккаунт.",
        "No SPL mint account at this address: it is a wallet or another account.",
      ),
      evidence: ["getAccountInfo: not a mint"],
      source: rpcSrc,
      confidence: "high",
    });
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
      "dexscreener",
    ),
  );
  if (holders) {
    findings.push(
      ...distributionFindings(
        {
          concentration: holders.concentration,
          deployerShare,
          relatedShare,
          holderGrowth24h: null,
          massTransfers: null,
          holdersCount: null,
          partial: true,
          clusters,
          top: holders.top,
        },
        rpcSrc,
      ),
    );
  }
  if (deployerSelling24h) {
    findings.push({
      code: "distribution.deployer-selling",
      category: "distribution",
      severity: "high",
      title: t("Создатель продаёт", "Creator is selling"),
      explanation: t(
        "За последние 24 часа кошелёк создателя продавал этот токен.",
        "In the last 24 hours the creator wallet sold this token.",
      ),
      evidence: (creatorActions?.actions ?? [])
        .filter((a) => a.kind === "sell")
        .slice(0, 3)
        .map((a) => `tx ${a.txHash}: ${a.amount?.toFixed(0)} tokens`),
      source: "helius enhanced transactions",
      confidence: "high",
    });
  }
  findings.push({
    code: "data.solana-scope",
    category: "data",
    severity: "info",
    title: t("Solana: часть проверок пока недоступна", "Solana: some checks are not available yet"),
    explanation: t(
      "Для Solana пока нет симуляции продажи, истории цены по блокчейну, числа держателей и роста держателей. Эти показатели отмечены «Нет данных». Связанные кошельки проверяются для 12 крупнейших держателей.",
      "For Solana there is no sell simulation, on-chain price history, holder count or holder growth yet. They are shown as “No data”. Related wallets are checked for the 12 largest holders.",
    ),
    evidence: [holdersError ?? "top holders: largest token accounts"],
    source: "quvr",
    confidence: "high",
  });
  const sev = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
  findings.sort((a, b) => sev[a.severity] - sev[b.severity]);

  const timeline: TimelineEvent[] = [];
  const firstPair = [...pairs]
    .filter((x) => x.pairCreatedAt)
    .sort((a, b) => Date.parse(a.pairCreatedAt!) - Date.parse(b.pairCreatedAt!))[0];
  if (creation?.createdAt) {
    timeline.push({
      at: creation.createdAt,
      blockNumber: creation.slot,
      kind: "created",
      title: t("Создание токена", "Token created"),
      txHash: creation.txSignature ?? undefined,
      source: creation.method ?? "helius",
    });
  }
  for (const a of (creatorActions?.actions ?? []).filter((x) => x.kind === "sell").slice(0, 5)) {
    timeline.push({
      at: a.timestamp,
      blockNumber: null,
      kind: "deployer-sell",
      title: t("Создатель продал", "Creator sold"),
      txHash: a.txHash,
      source: "helius",
    });
  }
  if (firstPair)
    timeline.push({
      at: firstPair.pairCreatedAt,
      blockNumber: null,
      kind: "first-pool",
      title: t(`Первый пул (${firstPair.dexId})`, `First pool (${firstPair.dexId})`),
      source: "dexscreener",
    });
  for (const th of (social?.theses ?? []).slice(0, 5))
    timeline.push({
      at: th.createdAt,
      blockNumber: null,
      kind: "thesis",
      title: t(`Тезис @${th.authorHandle}`, `Thesis by @${th.authorHandle}`),
      source: th.source,
    });
  timeline.sort((a, b) => (a.at ? Date.parse(a.at) : 0) - (b.at ? Date.parse(b.at) : 0));

  const metrics = new Map(metricsSnapshot().map((m) => [m.source, m]));
  const health = (source: string, enabled: boolean, note?: string): SourceHealth => {
    const m = metrics.get(source);
    return {
      source,
      status: !enabled
        ? "disabled"
        : !m
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
  const name = mainPair?.baseToken.name ?? null;
  const symbol = mainPair?.baseToken.symbol ?? null;

  const report: TokenReport = {
    chainId: SOLANA.id,
    chainName: SOLANA.name,
    chainFamily: "solana",
    address: mint,
    checksumAddress: mint,
    generatedAt: now.toISOString(),
    mode: appMode(env),
    blockNumber: unavailable(rpcSrc, "slot not tracked"),
    token: {
      name: name
        ? sourced(name, "dexscreener", { confidence: "medium" })
        : unavailable("dexscreener", "name not reported"),
      symbol: symbol
        ? sourced(symbol, "dexscreener", { confidence: "medium" })
        : unavailable("dexscreener", "symbol not reported"),
      decimals: info
        ? sourced(info.decimals, rpcSrc)
        : unavailable(rpcSrc, mintR.ok ? "not a mint" : mintR.error),
      totalSupply: info
        ? sourced(Number(info.supplyRaw) / 10 ** info.decimals, rpcSrc)
        : unavailable(rpcSrc, mintR.ok ? "not a mint" : mintR.error),
      imageUrl: marketR.ok ? marketR.value.imageUrl : null,
    },
    links: {
      blockscout: solscan,
      dexscreener: dexUrl,
      fomo: null,
      external: marketR.ok
        ? sourced(marketR.value.links, "dexscreener", { confidence: "medium" })
        : unavailable("dexscreener", marketR.error),
    },
    market: {
      priceUsd: mSrc(mainPair?.priceUsd),
      priceNative: mSrc(mainPair?.priceNative),
      marketCapUsd: mSrc(mainPair?.marketCapUsd),
      fdvUsd: mSrc(mainPair?.fdvUsd),
      liquidityUsd: marketR.ok
        ? pairs.length
          ? sourced(liquidityUsd, "dexscreener", { sourceUrl: dexUrl })
          : unavailable("dexscreener", "no trading pairs found")
        : unavailable("dexscreener", marketR.error),
      volume:
        marketR.ok && mainPair
          ? sourced(mainPair.volume, "dexscreener")
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
      netFlowNative: noHistory("on-chain net flow"),
      priceImpact: impact
        ? sourced(impact.impacts, "dexscreener reserves", {
            approximate: true,
            confidence: "medium",
          })
        : unavailable(
            "dexscreener reserves",
            !impactR.ok
              ? impactR.error
              : mainPair?.kind === "v3"
                ? "concentrated-liquidity pool: x*y=k does not apply"
                : "no constant-product reserves",
          ),
      liquidityTrend: liqTrend
        ? sourced(liqTrend, "quvr snapshots", { confidence: "medium" })
        : unavailable("quvr snapshots", "not enough snapshot history yet"),
    },
    contract: mintAnalysis
      ? sourced(mintAnalysis.analysis, `${rpcSrc} mint account`, { sourceUrl: solscan })
      : unavailable(rpcSrc, mintR.ok ? "not a token mint" : mintR.error),
    creation: creation
      ? sourced(
          {
            deployer: creator,
            factory: null,
            txHash: creation.txSignature,
            blockNumber: creation.slot,
            timestamp: creation.createdAt,
            initialMintTo: null,
            method: "rpc-mint-log" as const,
          },
          creation.method ?? "helius",
          {
            confidence: creation.method === "pump.fun bonding curve" ? "high" : "medium",
            sourceUrl: creation.txSignature
              ? `${SOLANA.explorerUrl}/tx/${creation.txSignature}`
              : undefined,
          },
        )
      : unavailable(rpcSrc, creationR.ok ? "creator not found" : creationR.error),
    simulation: unavailable(rpcSrc, "Sell simulation unavailable (Solana)"),
    distribution: {
      holdersCount: unavailable(
        rpcSrc,
        "holder count needs an indexer (not available from standard RPC)",
      ),
      top: hv(holders?.top),
      concentration: hv(holders?.concentration),
      excluded: hv(holders?.excluded, "high"),
      deployerShare:
        deployerShare !== null
          ? sourced(deployerShare, rpcSrc, { confidence: "high" })
          : unavailable(rpcSrc, creatorBalR.ok ? "unknown" : creatorBalR.error),
      relatedShare: clusters
        ? sourced(relatedShare, "helius history (heuristic)", { confidence: "low" })
        : unavailable(rpcSrc, relR.ok ? "unknown" : relR.error),
      clusters: clusters
        ? sourced(clusters, "helius history (heuristic)", { confidence: "low" })
        : unavailable(rpcSrc, relR.ok ? "unknown" : relR.error),
      holderGrowth: noHistory("holder history"),
      newWallets24h: noHistory("holder history"),
      freshWalletShare: noHistory("wallet freshness"),
      massTransfers: noHistory("transfer history"),
    },
    deployerActions: creatorActions
      ? sourced(creatorActions.actions, "helius enhanced transactions", { confidence: "medium" })
      : unavailable("helius enhanced transactions", actionsR.ok ? "unknown" : actionsR.error),
    social: {
      available: !!social,
      reason: socialReason,
      theses: socialSv(social?.theses),
      authors: socialSv(social?.authors),
      trendingRank: socialSv(social?.trendingRank),
      trackedHolders: socialSv(social?.trackedHolders),
    },
    history: {
      price: noHistory("on-chain price history"),
      liquidity: sourced(
        liqHist.concat(liquidityUsd !== null ? [{ t: now.getTime(), liquidityUsd }] : []),
        "quvr snapshots (dexscreener)",
        { confidence: "medium" },
      ),
    },
    timeline,
    findings,
    scores,
    sources: [
      health("solana-rpc", true, rpc.keyed ? "keyed RPC" : "public RPC (holders limited)"),
      health("dexscreener", true),
      health("fomoapi", p.social.isEnabled()),
    ],
  };
  logger.child({ scope: "scan", chain: "solana", mint }).info("report built", {
    ms: Date.now() - now.getTime(),
    findings: findings.length,
    pairs: pairs.length,
    holders: holders?.top.length ?? null,
  });
  return { report: prev ? mergeWithPrevious(report, prev) : report, codeHash: null };
}
