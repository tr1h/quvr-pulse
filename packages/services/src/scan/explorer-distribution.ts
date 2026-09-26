import { readBalances, type ChainProvider, type ExplorerProvider } from "@quvr/providers";
import { concentrationOf, EXCLUSION_LABELS, findRelatedClusters } from "@quvr/scoring";
import {
  BURN_ADDRESSES,
  isContractCode,
  isDelegatedEoaCode,
  ZERO_ADDRESS,
  type ExcludedHolder,
  type HolderRow,
} from "@quvr/shared";
import type { DistributionContext, DistributionResult } from "./distribution";

/**
 * Holder distribution from the explorer's holder list (Blockscout), for chains where replaying
 * the full Transfer history is impractical (Base: millions of blocks, 2 000-block log windows).
 *
 * Measured: holder count, top holders, concentration without pools/burn, creator share, fresh
 * wallets, possibly related wallets by common funding source. Not measured (shown as
 * "No data", never zero): holder growth, new wallets 24h, mass transfers, creator actions.
 */
const shareOf = (v: bigint, total: bigint) =>
  total > 0n ? Number((v * 1_000_000_000n) / total) / 1_000_000_000 : 0;

export async function analyzeDistributionFromExplorer(
  chain: ChainProvider,
  explorer: ExplorerProvider,
  ctx: Omit<DistributionContext, "clock" | "initialMintTo">,
): Promise<DistributionResult> {
  const [list, holdersCount] = await Promise.all([
    explorer.getTokenHolders(ctx.token, 50),
    explorer.getTokenHoldersCount(ctx.token).catch(() => null),
  ]);
  if (!list.length) throw new Error("explorer returned no holders");
  const scale = 10 ** Math.min(ctx.decimals, 18);
  const units = (v: bigint) => Number(v) / scale;

  const exclusions = new Map<string, ExcludedHolder["reason"]>();
  exclusions.set(ZERO_ADDRESS, "zero");
  for (const b of BURN_ADDRESSES) if (b !== ZERO_ADDRESS) exclusions.set(b, "burn");
  if (ctx.poolManager && ctx.hasV4Pool) exclusions.set(ctx.poolManager.toLowerCase(), "pool-manager");
  for (const p of ctx.pairAddresses) exclusions.set(p.toLowerCase(), "dex-pool");

  const balances = new Map(list.map((h) => [h.address, h.valueRaw]));
  const excludedSet = new Set(exclusions.keys());
  const ranked = list.filter((h) => !excludedSet.has(h.address)).slice(0, 30);

  // Contract / EIP-7702 detection from bytecode (the explorer flag is only a hint).
  const top20 = ranked.slice(0, 20).map((h) => h.address);
  const codes = await chain.getCodes(top20).catch(() => top20.map(() => null));
  const isContract = new Map<string, boolean | null>();
  const delegated = new Set<string>();
  top20.forEach((a, i) => {
    const c = codes[i];
    isContract.set(a, c === null || c === undefined ? null : isContractCode(c));
    if (isDelegatedEoaCode(c)) delegated.add(a);
  });

  const excludedTotal = [...exclusions.keys()].reduce((s, a) => s + (balances.get(a) ?? 0n), 0n);
  const circulating =
    ctx.totalSupplyRaw > excludedTotal ? ctx.totalSupplyRaw - excludedTotal : ctx.totalSupplyRaw;

  const eoas = top20.filter((a) => isContract.get(a) === false);
  const nonces = await chain.getNonces(eoas).catch(() => eoas.map(() => null));
  const fresh = new Set(eoas.filter((_, i) => nonces[i] !== null && nonces[i]! <= 2));
  const knownNonce = nonces.filter((n) => n !== null).length;

  // Possibly related wallets: common first funder only (no transfer history on this path).
  const fundingSources = new Map<string, string | null>();
  for (const a of eoas.slice(0, 12)) {
    try {
      const txs = await explorer.getFirstIncomingTransactions(a, 1);
      fundingSources.set(a, txs[0]?.from ?? null);
    } catch {
      break;
    }
  }
  const clusters = findRelatedClusters(
    {
      holders: [...new Set([...ranked.map((h) => h.address), ...(ctx.deployer ? [ctx.deployer] : [])])],
      transfers: [],
      deployer: ctx.deployer,
      poolAddresses: excludedSet,
      fundingSources,
    },
    balances,
    ctx.totalSupplyRaw,
  );
  const inCluster = new Set(clusters.flatMap((c) => c.wallets));
  const deployerLinked = new Set(clusters.filter((c) => c.linkedToDeployer).flatMap((c) => c.wallets));
  if (ctx.deployer) deployerLinked.delete(ctx.deployer);

  const top: HolderRow[] = ranked.slice(0, 20).map((h) => {
    const tags: HolderRow["tags"] = [];
    if (h.address === ctx.deployer) tags.push("deployer");
    if (inCluster.has(h.address)) tags.push("possibly-related");
    if (fresh.has(h.address)) tags.push("fresh");
    if (isContract.get(h.address)) tags.push("contract");
    if (delegated.has(h.address)) tags.push("eip7702");
    return {
      address: h.address,
      balance: units(h.valueRaw),
      share: shareOf(h.valueRaw, circulating),
      shareOfTotal: shareOf(h.valueRaw, ctx.totalSupplyRaw),
      isContract: isContract.get(h.address) ?? h.isContract,
      tags,
    };
  });

  const excluded: ExcludedHolder[] = [...exclusions.entries()]
    .map(([address, reason]) => ({
      address,
      reason,
      balance: units(balances.get(address) ?? 0n),
      shareOfTotal: shareOf(balances.get(address) ?? 0n, ctx.totalSupplyRaw),
      label: EXCLUSION_LABELS[reason],
    }))
    .filter((e) => e.balance > 0);

  const deployerBal = ctx.deployer
    ? await readBalances(chain, ctx.token, [ctx.deployer])
        .then((m) => m.get(ctx.deployer!) ?? null)
        .catch(() => balances.get(ctx.deployer!) ?? null)
    : null;

  return {
    holdersCount: holdersCount ?? list.length,
    top,
    concentration: concentrationOf(top),
    excluded,
    deployerShare: deployerBal !== null ? shareOf(deployerBal, ctx.totalSupplyRaw) : null,
    relatedShare: [...deployerLinked].reduce(
      (s, a) => s + shareOf(balances.get(a) ?? 0n, ctx.totalSupplyRaw),
      0,
    ),
    clusteredShare: clusters
      .filter((c) => c.confidence !== "low")
      .reduce((s, c) => s + c.combinedShareOfTotal, 0),
    clusters,
    holderGrowth: null,
    newWallets24h: null,
    freshWalletShare: knownNonce > 0 ? fresh.size / knownNonce : null,
    massTransfers: null,
    deployerActions: null,
    firstBuys: [],
    complete: false,
    balanceCheck: { checked: 0, mismatches: 0 },
    infra: excludedSet,
  };
}
