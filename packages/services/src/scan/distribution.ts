import { readBalances, type ChainProvider, type ExplorerProvider } from "@quvr/providers";
import {
  classifyDeployerActions,
  concentrationOf,
  detectMassTransfers,
  EXCLUSION_LABELS,
  findRelatedClusters,
  holderCountsAt,
  rankHolders,
  replayTransfers,
} from "@quvr/scoring";
import {
  BURN_ADDRESSES,
  isContractCode,
  isDelegatedEoaCode,
  ZERO_ADDRESS,
  type DeployerAction,
  type ExcludedHolder,
  type HolderRow,
  type RelatedCluster,
} from "@quvr/shared";
import type { ChainClock } from "./clock";
import type { TransferHistory } from "./transfers";

export type DistributionResult = {
  holdersCount: number;
  top: HolderRow[];
  concentration: { top1: number; top5: number; top10: number; top20: number };
  excluded: ExcludedHolder[];
  deployerShare: number | null;
  relatedShare: number;
  clusteredShare: number;
  clusters: RelatedCluster[];
  holderGrowth: { h1: number; h24: number } | null;
  /** null when not measurable on this chain (explorer-based distribution). */
  newWallets24h: number | null;
  freshWalletShare: number | null;
  massTransfers: { count: number; largestFanOut: number } | null;
  deployerActions: DeployerAction[] | null;
  firstBuys: Array<{ block: number; txHash: string; to: string }>;
  complete: boolean;
  balanceCheck: { checked: number; mismatches: number };
  infra: Set<string>;
};

export type DistributionContext = {
  token: string;
  decimals: number;
  totalSupplyRaw: bigint;
  deployer: string | null;
  initialMintTo: string | null;
  poolManager: string | null;
  pairAddresses: string[]; // 20-byte pool contracts (v2/v3)
  hasV4Pool: boolean;
  clock: ChainClock;
  explorerUsable: boolean;
};

const shareOf = (v: bigint, total: bigint) =>
  total > 0n ? Number((v * 1_000_000_000n) / total) / 1_000_000_000 : 0;

export async function analyzeDistribution(
  chain: ChainProvider,
  explorer: ExplorerProvider,
  history: TransferHistory,
  ctx: DistributionContext,
): Promise<DistributionResult> {
  const { transfers } = history;
  const { balances, firstReceiptBlock } = replayTransfers(transfers);
  const scale = 10 ** Math.min(ctx.decimals, 18);
  const toUnitsNum = (v: bigint) => Number(v) / scale;

  // ---- infrastructure (excluded from concentration, shown separately)
  const exclusions = new Map<string, ExcludedHolder["reason"]>();
  exclusions.set(ZERO_ADDRESS, "zero");
  for (const b of BURN_ADDRESSES) if (b !== ZERO_ADDRESS) exclusions.set(b, "burn");
  if (ctx.poolManager && ctx.hasV4Pool) exclusions.set(ctx.poolManager, "pool-manager");
  for (const p of ctx.pairAddresses) exclusions.set(p, "dex-pool");

  // Launchpad / bonding curve: the contract that received the initial mint.
  const mintTo = ctx.initialMintTo;
  const candidates = [
    ...new Set(
      [mintTo, ...rankHolders(balances, 40, new Set(exclusions.keys())).map(([a]) => a)].filter(
        (a): a is string => !!a,
      ),
    ),
  ];
  const codes = await chain.getCodes(candidates);
  const isContract = new Map<string, boolean | null>();
  const delegated = new Set<string>();
  const classify = (a: string, code: string | null | undefined) => {
    isContract.set(a, code === null || code === undefined ? null : isContractCode(code));
    if (isDelegatedEoaCode(code)) delegated.add(a);
  };
  candidates.forEach((a, i) => classify(a, codes[i]));
  if (mintTo && isContract.get(mintTo) && mintTo !== ctx.deployer)
    exclusions.set(mintTo, "launchpad");

  // Routers: contract senders that fan out to many wallets (transient balances).
  const poolLike = new Set(exclusions.keys());
  const mass = detectMassTransfers(transfers, poolLike);
  if (mass.senders.length) {
    const senderCodes = await chain.getCodes(mass.senders);
    mass.senders.forEach((s, i) => {
      const c = senderCodes[i];
      if (isContractCode(c)) {
        poolLike.add(s);
        if ((balances.get(s) ?? 0n) > 0n) exclusions.set(s, "router");
      }
    });
  }
  const massFinal = detectMassTransfers(transfers, poolLike);

  // ---- ranking of regular holders
  const excludedSet = new Set(exclusions.keys());
  let ranked = rankHolders(balances, 30, excludedSet);

  // Verify top balances on-chain (catches non-standard tokens where logs ≠ state).
  let mismatches = 0;
  const onchain = await readBalances(
    chain,
    ctx.token,
    ranked.map(([a]) => a),
  ).catch(() => null);
  if (onchain) {
    ranked = ranked.map(([a, b]) => {
      const real = onchain.get(a);
      if (real !== null && real !== undefined && real !== b) {
        mismatches++;
        return [a, real] as [string, bigint];
      }
      return [a, b];
    });
    ranked.sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0));
  }

  const excludedTotal = [...exclusions.keys()].reduce(
    (s, a) => s + ((balances.get(a) ?? 0n) > 0n ? balances.get(a)! : 0n),
    0n,
  );
  const circulating =
    ctx.totalSupplyRaw > excludedTotal ? ctx.totalSupplyRaw - excludedTotal : ctx.totalSupplyRaw;

  // Freshness: EOAs with ≤ 2 outgoing transactions (nonce) — a heuristic, not identity.
  const top20 = ranked.slice(0, 20).map(([a]) => a);
  const unknownCode = top20.filter((a) => !isContract.has(a));
  if (unknownCode.length) {
    const c = await chain.getCodes(unknownCode);
    unknownCode.forEach((a, i) => classify(a, c[i]));
  }
  const eoas = top20.filter((a) => isContract.get(a) === false);
  const nonces = await chain.getNonces(eoas).catch(() => eoas.map(() => null));
  const fresh = new Set(eoas.filter((_, i) => nonces[i] !== null && nonces[i]! <= 2));
  const knownNonce = nonces.filter((n) => n !== null).length;

  // ---- related wallets
  let fundingSources: Map<string, string | null> | undefined;
  if (ctx.explorerUsable) {
    fundingSources = new Map();
    for (const a of eoas.slice(0, 12)) {
      try {
        const txs = await explorer.getFirstIncomingTransactions(a, 1);
        fundingSources.set(a, txs[0]?.from ?? null);
      } catch {
        fundingSources = undefined;
        break;
      }
    }
  }
  const relationHolders = [
    ...new Set([...ranked.map(([a]) => a), ...(ctx.deployer ? [ctx.deployer] : [])]),
  ];
  const clusters = findRelatedClusters(
    {
      holders: relationHolders,
      transfers,
      deployer: ctx.deployer,
      poolAddresses: poolLike,
      fundingSources,
    },
    balances,
    ctx.totalSupplyRaw,
  );
  const inCluster = new Set(clusters.flatMap((c) => c.wallets));
  const deployerLinked = new Set(
    clusters.filter((c) => c.linkedToDeployer).flatMap((c) => c.wallets),
  );
  if (ctx.deployer) deployerLinked.delete(ctx.deployer);

  const top: HolderRow[] = ranked.slice(0, 20).map(([address, bal]) => {
    const tags: HolderRow["tags"] = [];
    if (address === ctx.deployer) tags.push("deployer");
    if (inCluster.has(address)) tags.push("possibly-related");
    if (fresh.has(address)) tags.push("fresh");
    if (isContract.get(address)) tags.push("contract");
    if (delegated.has(address)) tags.push("eip7702");
    return {
      address,
      balance: toUnitsNum(bal),
      share: shareOf(bal, circulating),
      shareOfTotal: shareOf(bal, ctx.totalSupplyRaw),
      isContract: isContract.get(address) ?? null,
      tags,
    };
  });

  const excluded: ExcludedHolder[] = [...exclusions.entries()]
    .map(([address, reason]) => ({
      address,
      reason,
      balance: toUnitsNum(balances.get(address) ?? 0n),
      shareOfTotal: shareOf(balances.get(address) ?? 0n, ctx.totalSupplyRaw),
      label: EXCLUSION_LABELS[reason],
    }))
    .filter((e) => e.balance > 0 || e.reason === "pool-manager" || e.reason === "launchpad");

  // ---- growth
  const head = ctx.clock.headBlock;
  const b24 = ctx.clock.blockAt(ctx.clock.headTs - 86_400);
  const b1 = ctx.clock.blockAt(ctx.clock.headTs - 3_600);
  const [c24, c1, cNow] = holderCountsAt(transfers, [b24, b1, head], excludedSet);
  const holderGrowth =
    history.complete &&
    history.fromBlock <= b24 &&
    c24 !== undefined &&
    c1 !== undefined &&
    cNow !== undefined
      ? { h24: c24 > 0 ? (cNow - c24) / c24 : 0, h1: c1 > 0 ? (cNow - c1) / c1 : 0 }
      : null;
  let newWallets24h = 0;
  for (const [a, blk] of firstReceiptBlock)
    if (blk >= b24 && !excludedSet.has(a) && (balances.get(a) ?? 0n) > 0n) newWallets24h++;

  const deployerBal = ctx.deployer ? (balances.get(ctx.deployer) ?? 0n) : null;
  const deployerOnchain = ctx.deployer
    ? await readBalances(chain, ctx.token, [ctx.deployer])
        .then((m) => m.get(ctx.deployer!) ?? null)
        .catch(() => null)
    : null;
  const effectiveDeployerBal = deployerOnchain ?? deployerBal;

  const relatedShare = [...deployerLinked].reduce(
    (s, a) => s + shareOf(balances.get(a) ?? 0n, ctx.totalSupplyRaw),
    0,
  );
  const clusteredShare = clusters
    .filter((c) => c.confidence !== "low")
    .reduce((s, c) => s + c.combinedShareOfTotal, 0);

  const firstBuys = transfers
    .filter((tr) => poolLike.has(tr.from) && !poolLike.has(tr.to) && tr.to !== ZERO_ADDRESS)
    .slice(0, 3)
    .map((tr) => ({ block: tr.blockNumber, txHash: tr.txHash, to: tr.to }));

  return {
    holdersCount: cNow ?? 0,
    top,
    concentration: concentrationOf(top),
    excluded,
    deployerShare:
      effectiveDeployerBal === null ? null : shareOf(effectiveDeployerBal, ctx.totalSupplyRaw),
    relatedShare,
    clusteredShare,
    clusters,
    holderGrowth,
    newWallets24h,
    // Share among top-20 wallets whose nonce was actually checked.
    freshWalletShare: knownNonce > 0 ? fresh.size / knownNonce : null,
    massTransfers: { count: massFinal.count, largestFanOut: massFinal.largestFanOut },
    deployerActions: ctx.deployer
      ? classifyDeployerActions(transfers, ctx.deployer, poolLike, ctx.decimals, (b) =>
          ctx.clock.isoAt(b),
        )
      : [],
    firstBuys,
    complete: history.complete,
    balanceCheck: { checked: onchain?.size ?? 0, mismatches },
    infra: poolLike,
  };
}
