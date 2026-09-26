import type {
  DeployerAction,
  ExcludedHolder,
  HolderRow,
  LocalizedText,
  RelatedCluster,
  RelationSignal,
  RiskFinding,
  ScoreComponent,
  ScoreReason,
  ScoreResult,
} from "@quvr/shared";
import { ZERO_ADDRESS } from "@quvr/shared";
import { buildScore, interpolate, t } from "./builder";

export type TransferEvent = {
  from: string;
  to: string;
  value: bigint;
  blockNumber: number;
  txHash: string;
  logIndex: number;
};

export const EXCLUSION_LABELS: Record<ExcludedHolder["reason"], LocalizedText> = {
  zero: t("Нулевой адрес", "Zero address"),
  burn: t("Адрес сжигания", "Burn address"),
  "dex-pool": t("Пул DEX", "DEX pool"),
  "pool-manager": t(
    "Uniswap v4 PoolManager (ликвидность всех v4-пулов)",
    "Uniswap v4 PoolManager (liquidity of all v4 pools)",
  ),
  launchpad: t("Контракт лаунчпада / bonding curve", "Launchpad / bonding-curve contract"),
  router: t("Router", "Router"),
  bridge: t("Мост", "Bridge"),
  system: t("Системный контракт", "System contract"),
};

export type HolderState = {
  balances: Map<string, bigint>;
  firstReceiptBlock: Map<string, number>;
};

export function replayTransfers(transfers: TransferEvent[]): HolderState {
  const balances = new Map<string, bigint>();
  const firstReceiptBlock = new Map<string, number>();
  for (const tr of transfers) {
    if (tr.from !== ZERO_ADDRESS) balances.set(tr.from, (balances.get(tr.from) ?? 0n) - tr.value);
    balances.set(tr.to, (balances.get(tr.to) ?? 0n) + tr.value);
    if (!firstReceiptBlock.has(tr.to)) firstReceiptBlock.set(tr.to, tr.blockNumber);
  }
  return { balances, firstReceiptBlock };
}

/** Number of addresses with a positive balance after each checkpoint block (ascending). */
export function holderCountsAt(
  transfers: TransferEvent[],
  checkpoints: number[],
  exclude: Set<string>,
): number[] {
  const sorted = [...checkpoints].sort((a, b) => a - b);
  const balances = new Map<string, bigint>();
  let count = 0;
  const out: number[] = [];
  let ci = 0;
  const apply = (addr: string, delta: bigint) => {
    if (addr === ZERO_ADDRESS || exclude.has(addr)) return;
    const before = balances.get(addr) ?? 0n;
    const after = before + delta;
    balances.set(addr, after);
    if (before <= 0n && after > 0n) count++;
    else if (before > 0n && after <= 0n) count--;
  };
  for (const tr of transfers) {
    while (ci < sorted.length && tr.blockNumber > sorted[ci]!) {
      out.push(count);
      ci++;
    }
    apply(tr.from, -tr.value);
    apply(tr.to, tr.value);
  }
  while (ci < sorted.length) {
    out.push(count);
    ci++;
  }
  return out;
}

export function rankHolders(
  balances: Map<string, bigint>,
  limit: number,
  skip: Set<string>,
): Array<[string, bigint]> {
  return [...balances.entries()]
    .filter(([a, b]) => b > 0n && !skip.has(a))
    .sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0))
    .slice(0, limit);
}

// ------------------------------------------------------------------ relations

class UnionFind {
  private parent = new Map<string, string>();
  find(a: string): string {
    const p = this.parent.get(a);
    if (!p || p === a) {
      this.parent.set(a, a);
      return a;
    }
    const r = this.find(p);
    this.parent.set(a, r);
    return r;
  }
  union(a: string, b: string) {
    this.parent.set(this.find(a), this.find(b));
  }
}

export type RelationInput = {
  holders: string[]; // candidate wallets (top holders, excluded removed)
  transfers: TransferEvent[];
  deployer: string | null;
  poolAddresses: Set<string>;
  /** holder → first funder of native ETH (explorer); undefined when unavailable. */
  fundingSources?: Map<string, string | null>;
  /** holder → set of contracts it interacted with (explorer); undefined when unavailable. */
  contractSets?: Map<string, Set<string>>;
  sequentialWindowBlocks?: number;
};

/**
 * Heuristic "possibly related wallets". It never asserts common ownership: every
 * cluster carries the concrete signals that produced it.
 */
export function findRelatedClusters(
  input: RelationInput,
  balances: Map<string, bigint>,
  totalSupply: bigint,
): RelatedCluster[] {
  const holderSet = new Set(input.holders);
  const uf = new UnionFind();
  const signals = new Map<
    string,
    Array<{ signal: RelationSignal; evidence: string; members: string[] }>
  >();
  const addSignal = (members: string[], signal: RelationSignal, evidence: string) => {
    if (members.length < 2) return;
    for (let i = 1; i < members.length; i++) uf.union(members[0]!, members[i]!);
    const key = members[0]!;
    const list = signals.get(key) ?? [];
    list.push({ signal, evidence, members });
    signals.set(key, list);
  };

  const deployer = input.deployer;
  // 1. Direct transfers from the deployer (not via a pool).
  if (deployer) {
    const recipients = new Set<string>();
    for (const tr of input.transfers) {
      if (tr.from === deployer && holderSet.has(tr.to) && !input.poolAddresses.has(tr.to))
        recipients.add(tr.to);
    }
    for (const r of recipients)
      addSignal([deployer, r], "received-from-deployer", `transfer ${deployer} → ${r}`);
  }

  // 2. Same block of first buy (first receipt coming from a pool).
  const firstBuy = new Map<string, number>();
  for (const tr of input.transfers) {
    if (holderSet.has(tr.to) && input.poolAddresses.has(tr.from) && !firstBuy.has(tr.to))
      firstBuy.set(tr.to, tr.blockNumber);
  }
  const byBlock = new Map<number, string[]>();
  for (const [h, b] of firstBuy) byBlock.set(b, [...(byBlock.get(b) ?? []), h]);
  for (const [block, members] of byBlock) {
    if (members.length >= 2)
      addSignal(members, "same-first-buy-block", `first buy in block ${block}`);
  }

  // 3. Sequential transfers: one non-pool sender → ≥3 holders within a short block window.
  const window = input.sequentialWindowBlocks ?? 100;
  const bySender = new Map<string, TransferEvent[]>();
  for (const tr of input.transfers) {
    if (tr.from === ZERO_ADDRESS || input.poolAddresses.has(tr.from) || !holderSet.has(tr.to))
      continue;
    bySender.set(tr.from, [...(bySender.get(tr.from) ?? []), tr]);
  }
  for (const [sender, list] of bySender) {
    for (let i = 0; i < list.length; i++) {
      const start = list[i]!.blockNumber;
      const burst = new Set(
        list
          .filter((x) => x.blockNumber >= start && x.blockNumber <= start + window)
          .map((x) => x.to),
      );
      if (burst.size >= 3) {
        const members = [...burst];
        if (holderSet.has(sender)) members.unshift(sender);
        addSignal(
          members,
          "sequential-transfers",
          `${sender} sent to ${burst.size} holders within ${window} blocks from block ${start}`,
        );
        break;
      }
    }
  }

  // 4. Common funding source (explorer data).
  if (input.fundingSources) {
    const byFunder = new Map<string, string[]>();
    for (const [h, f] of input.fundingSources)
      if (f) byFunder.set(f, [...(byFunder.get(f) ?? []), h]);
    for (const [funder, members] of byFunder) {
      if (members.length >= 2)
        addSignal(members, "common-funding-source", `first ETH funding from ${funder}`);
      if (deployer && funder === deployer)
        for (const m of members)
          addSignal([deployer, m], "funded-by-deployer", `funded by deployer`);
    }
  }

  // 5. Same set of contracts (explorer data): Jaccard ≥ 0.8 with ≥ 3 contracts.
  if (input.contractSets) {
    const entries = [...input.contractSets.entries()].filter(([, s]) => s.size >= 3);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [a, sa] = entries[i]!;
        const [b, sb] = entries[j]!;
        const inter = [...sa].filter((x) => sb.has(x)).length;
        const jac = inter / (sa.size + sb.size - inter);
        if (jac >= 0.8)
          addSignal(
            [a, b],
            "same-contract-set",
            `Jaccard ${jac.toFixed(2)} over ${inter} contracts`,
          );
      }
    }
  }

  // Assemble clusters.
  const groups = new Map<string, Set<string>>();
  const touched = new Set<string>();
  for (const list of signals.values())
    for (const s of list) for (const m of s.members) touched.add(m);
  for (const m of touched) {
    const root = uf.find(m);
    groups.set(root, (groups.get(root) ?? new Set()).add(m));
  }
  const clusters: RelatedCluster[] = [];
  let idx = 0;
  for (const members of groups.values()) {
    if (members.size < 2) continue;
    const sigs = [...signals.values()].flat().filter((s) => s.members.some((m) => members.has(m)));
    const held = [...members].reduce((s, m) => s + (balances.get(m) ?? 0n), 0n);
    const kinds = new Set(sigs.map((s) => s.signal));
    clusters.push({
      id: `c${++idx}`,
      wallets: [...members],
      signals: sigs.slice(0, 10).map((s) => ({ signal: s.signal, evidence: s.evidence })),
      combinedShareOfTotal:
        totalSupply > 0n ? Number((held * 1_000_000n) / totalSupply) / 1_000_000 : 0,
      linkedToDeployer:
        !!deployer &&
        (members.has(deployer) ||
          kinds.has("received-from-deployer") ||
          kinds.has("funded-by-deployer")),
      // Several independent signal kinds → more confidence; a shared launch block alone is weak.
      confidence:
        kinds.size >= 2
          ? "medium"
          : kinds.has("received-from-deployer") || kinds.has("common-funding-source")
            ? "medium"
            : "low",
    });
  }
  return clusters.sort((a, b) => b.combinedShareOfTotal - a.combinedShareOfTotal);
}

/** Senders (non-pool) that distributed tokens to many distinct wallets in a short window. */
export function detectMassTransfers(
  transfers: TransferEvent[],
  poolAddresses: Set<string>,
  opts: { windowBlocks?: number; minRecipients?: number } = {},
): { count: number; largestFanOut: number; senders: string[] } {
  const window = opts.windowBlocks ?? 600; // ~1 minute at ~10 blocks/s
  const min = opts.minRecipients ?? 10;
  const bySender = new Map<string, TransferEvent[]>();
  for (const tr of transfers) {
    if (tr.from === ZERO_ADDRESS || poolAddresses.has(tr.from)) continue;
    bySender.set(tr.from, [...(bySender.get(tr.from) ?? []), tr]);
  }
  let largest = 0;
  const senders: string[] = [];
  for (const [sender, list] of bySender) {
    let best = 0;
    let lo = 0;
    const recips = new Map<string, number>();
    for (let hi = 0; hi < list.length; hi++) {
      const cur = list[hi]!;
      recips.set(cur.to, (recips.get(cur.to) ?? 0) + 1);
      while (cur.blockNumber - list[lo]!.blockNumber > window) {
        const old = list[lo]!.to;
        const c = (recips.get(old) ?? 1) - 1;
        if (c <= 0) recips.delete(old);
        else recips.set(old, c);
        lo++;
      }
      best = Math.max(best, recips.size);
    }
    if (best >= min) senders.push(sender);
    largest = Math.max(largest, best);
  }
  return { count: senders.length, largestFanOut: largest, senders };
}

export function classifyDeployerActions(
  transfers: TransferEvent[],
  deployer: string,
  poolAddresses: Set<string>,
  decimals: number,
  timestampOf: (block: number) => string | null,
): DeployerAction[] {
  const scale = 10 ** Math.min(decimals, 18);
  const out: DeployerAction[] = [];
  for (const tr of transfers) {
    if (tr.from !== deployer && tr.to !== deployer) continue;
    const amount = Number(tr.value) / scale;
    let kind: DeployerAction["kind"];
    let counterparty: string | null;
    if (tr.from === deployer) {
      kind = poolAddresses.has(tr.to) ? "sell" : "transfer-out";
      counterparty = tr.to;
    } else {
      kind = poolAddresses.has(tr.from)
        ? "buy"
        : tr.from === ZERO_ADDRESS
          ? "create"
          : "transfer-in";
      counterparty = tr.from === ZERO_ADDRESS ? null : tr.from;
    }
    out.push({
      kind,
      amount,
      counterparty,
      txHash: tr.txHash,
      blockNumber: tr.blockNumber,
      timestamp: timestampOf(tr.blockNumber),
    });
  }
  return out.reverse().slice(0, 50);
}

export function concentrationOf(rows: Array<{ share: number }>) {
  const sum = (n: number) => rows.slice(0, n).reduce((s, r) => s + r.share, 0);
  return { top1: sum(1), top5: sum(5), top10: sum(10), top20: sum(20) };
}

// ------------------------------------------------------------------ score

export type DistributionInput = {
  concentration: { top1: number; top5: number; top10: number; top20: number } | null;
  deployerShare: number | null;
  relatedShare: number | null;
  holderGrowth24h: number | null; // relative, e.g. 0.05 = +5%
  massTransfers: { count: number; largestFanOut: number } | null;
  holdersCount: number | null;
  /** When holders come from partial data (e.g. capped log scan). */
  partial?: boolean;
  now?: Date;
};

export function distributionHealthScore(i: DistributionInput): ScoreResult {
  const reasons: ScoreReason[] = [];
  const components: ScoreComponent[] = [];
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  // Top holders concentration (35)
  let topPts: number | null = null;
  if (i.concentration) {
    const c = i.concentration;
    topPts = interpolate(c.top10, [
      [0.2, 35],
      [0.3, 28],
      [0.4, 20],
      [0.5, 12],
      [0.7, 5],
      [0.85, 0],
    ]);
    if (c.top1 > 0.2) topPts = Math.max(0, topPts - 5);
    reasons.push({
      text: t(
        `Top-10 держат ${pct(c.top10)} обращения`,
        `Top-10 hold ${pct(c.top10)} of circulating supply`,
      ),
      impact: c.top10 > 0.4 ? "negative" : "positive",
    });
  }
  components.push({
    id: "top",
    label: t("Концентрация top-держателей", "Top holder concentration"),
    points: topPts,
    max: 35,
  });

  // Deployer share (20)
  let depPts: number | null = null;
  if (i.deployerShare !== null) {
    depPts = interpolate(i.deployerShare, [
      [0, 20],
      [0.01, 18],
      [0.05, 12],
      [0.1, 6],
      [0.2, 0],
    ]);
    if (i.deployerShare > 0.05)
      reasons.push({
        text: t(
          `Deployer держит ${pct(i.deployerShare)}`,
          `Deployer holds ${pct(i.deployerShare)}`,
        ),
        impact: "negative",
      });
    else
      reasons.push({
        text: t(
          `Доля deployer: ${pct(i.deployerShare)}`,
          `Deployer share: ${pct(i.deployerShare)}`,
        ),
        impact: "positive",
      });
  }
  components.push({
    id: "deployer",
    label: t("Доля deployer", "Deployer share"),
    points: depPts,
    max: 20,
  });

  // Related clusters (20)
  let relPts: number | null = null;
  if (i.relatedShare !== null) {
    relPts = interpolate(i.relatedShare, [
      [0, 20],
      [0.05, 15],
      [0.1, 10],
      [0.2, 5],
      [0.3, 0],
    ]);
    if (i.relatedShare > 0.05) {
      reasons.push({
        text: t(
          `Возможно связанные кошельки: ${pct(i.relatedShare)}`,
          `Possibly related wallets: ${pct(i.relatedShare)}`,
        ),
        impact: "negative",
      });
    }
  }
  components.push({
    id: "clusters",
    label: t("Связанные кластеры", "Related clusters"),
    points: relPts,
    max: 20,
  });

  // Holder growth (10)
  let growthPts: number | null = null;
  if (i.holderGrowth24h !== null) {
    growthPts =
      i.holderGrowth24h >= 0.05 ? 10 : i.holderGrowth24h > 0 ? 7 : i.holderGrowth24h === 0 ? 5 : 2;
    reasons.push({
      text: t(
        `Держатели за 24ч: ${i.holderGrowth24h >= 0 ? "+" : ""}${pct(i.holderGrowth24h)}`,
        `Holders 24h: ${i.holderGrowth24h >= 0 ? "+" : ""}${pct(i.holderGrowth24h)}`,
      ),
      impact: i.holderGrowth24h < 0 ? "negative" : "neutral",
    });
  }
  components.push({
    id: "growth",
    label: t("Рост числа держателей", "Holder growth"),
    points: growthPts,
    max: 10,
  });

  // Mass transfers (15)
  let massPts: number | null = null;
  if (i.massTransfers) {
    const m = i.massTransfers;
    massPts = m.count === 0 ? 15 : m.largestFanOut < 20 ? 10 : m.largestFanOut < 50 ? 5 : 0;
    if (m.count > 0) {
      reasons.push({
        text: t(
          `Массовые рассылки токена: ${m.count} (до ${m.largestFanOut} адресов)`,
          `Mass token distributions: ${m.count} (up to ${m.largestFanOut} wallets)`,
        ),
        impact: "negative",
      });
    }
  }
  components.push({
    id: "mass",
    label: t("Нет массовых переводов", "No suspicious mass transfers"),
    points: massPts,
    max: 15,
  });

  return buildScore({
    key: "distributionHealth",
    components,
    reasons,
    inputConfidence: i.partial ? "low" : "medium", // holder relations are heuristic by nature
    now: i.now,
  });
}

export function distributionFindings(
  i: DistributionInput & { clusters: RelatedCluster[] | null; top: HolderRow[] | null },
  source: string,
): RiskFinding[] {
  const out: RiskFinding[] = [];
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  if (i.concentration && i.concentration.top10 > 0.5) {
    out.push({
      code: "distribution.concentrated",
      category: "distribution",
      severity: i.concentration.top10 > 0.7 ? "high" : "medium",
      title: t("Высокая концентрация держателей", "High holder concentration"),
      explanation: t(
        `Десять крупнейших кошельков (без пулов и burn) держат ${pct(i.concentration.top10)} обращения. Их продажа может резко обвалить цену.`,
        `The ten largest wallets (pools and burn excluded) hold ${pct(i.concentration.top10)} of circulating supply. Their selling can crash the price.`,
      ),
      evidence: (i.top ?? []).slice(0, 3).map((h) => `${h.address}: ${pct(h.share)}`),
      source,
      confidence: i.partial ? "low" : "high",
    });
  }
  if (i.deployerShare !== null && i.deployerShare > 0.05) {
    out.push({
      code: "distribution.deployer-share",
      category: "distribution",
      severity: i.deployerShare > 0.15 ? "high" : "medium",
      title: t("Deployer держит крупную долю", "Deployer holds a large share"),
      explanation: t(
        `Кошелёк создателя держит ${pct(i.deployerShare)} предложения.`,
        `The creator wallet holds ${pct(i.deployerShare)} of supply.`,
      ),
      evidence: [`deployer share ${pct(i.deployerShare)}`],
      source,
      confidence: "high",
    });
  }
  const big = (i.clusters ?? []).filter((c) => c.combinedShareOfTotal > 0.05);
  for (const c of big.slice(0, 3)) {
    out.push({
      code: `distribution.cluster.${c.id}`,
      category: "distribution",
      severity: c.linkedToDeployer ? "high" : "medium",
      title: t("Возможно связанные кошельки", "Possibly related wallets"),
      explanation: t(
        `${c.wallets.length} кошельков с общими признаками держат ${pct(c.combinedShareOfTotal)}. Это эвристика и не доказывает общего владельца.`,
        `${c.wallets.length} wallets sharing signals hold ${pct(c.combinedShareOfTotal)}. This is a heuristic and does not prove common ownership.`,
      ),
      evidence: c.signals.slice(0, 4).map((s) => `${s.signal}: ${s.evidence}`),
      source,
      confidence: c.confidence,
    });
  }
  if (i.massTransfers && i.massTransfers.count > 0) {
    out.push({
      code: "distribution.mass-transfers",
      category: "distribution",
      severity: i.massTransfers.largestFanOut >= 50 ? "medium" : "low",
      title: t("Массовые рассылки токена", "Mass token distributions"),
      explanation: t(
        "Один адрес разослал токен многим кошелькам за короткое время — так иногда искусственно увеличивают число держателей.",
        "A single address sent the token to many wallets within a short window — sometimes used to inflate holder counts.",
      ),
      evidence: [
        `senders: ${i.massTransfers.count}`,
        `max recipients in window: ${i.massTransfers.largestFanOut}`,
      ],
      source,
      confidence: "medium",
    });
  }
  return out;
}
