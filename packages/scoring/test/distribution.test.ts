import { describe, expect, it } from "vitest";
import {
  classifyDeployerActions,
  concentrationOf,
  detectMassTransfers,
  distributionHealthScore,
  findRelatedClusters,
  holderCountsAt,
  rankHolders,
  replayTransfers,
  type TransferEvent,
} from "../src/distribution";

const Z = "0x0000000000000000000000000000000000000000";
const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const POOL = a(0xbeef);
const DEPLOYER = a(0xd0);
let idx = 0;
const tr = (from: string, to: string, value: bigint, block: number): TransferEvent => ({
  from,
  to,
  value,
  blockNumber: block,
  txHash: `0x${(++idx).toString(16)}`,
  logIndex: 0,
});

describe("balance replay", () => {
  it("replays mints and transfers exactly", () => {
    const { balances, firstReceiptBlock } = replayTransfers([
      tr(Z, DEPLOYER, 1000n, 1),
      tr(DEPLOYER, a(1), 300n, 2),
      tr(a(1), a(2), 100n, 3),
    ]);
    expect(balances.get(DEPLOYER)).toBe(700n);
    expect(balances.get(a(1))).toBe(200n);
    expect(balances.get(a(2))).toBe(100n);
    expect(firstReceiptBlock.get(a(2))).toBe(3);
  });

  it("counts holders at checkpoints, ignoring excluded addresses", () => {
    const t = [
      tr(Z, POOL, 1000n, 1),
      tr(POOL, a(1), 10n, 5),
      tr(POOL, a(2), 10n, 10),
      tr(a(2), POOL, 10n, 20),
    ];
    expect(holderCountsAt(t, [4, 9, 15, 30], new Set([POOL]))).toEqual([0, 1, 2, 1]);
  });

  it("ranks holders excluding pools", () => {
    const { balances } = replayTransfers([
      tr(Z, POOL, 1000n, 1),
      tr(POOL, a(1), 50n, 2),
      tr(POOL, a(2), 70n, 2),
    ]);
    expect(rankHolders(balances, 5, new Set([POOL])).map(([x]) => x)).toEqual([a(2), a(1)]);
  });

  it("concentration sums shares of the first N rows", () => {
    const c = concentrationOf([{ share: 0.3 }, { share: 0.2 }, { share: 0.1 }]);
    expect(c.top1).toBeCloseTo(0.3);
    expect(c.top5).toBeCloseTo(0.6);
  });
});

describe("possibly related wallets (heuristic)", () => {
  it("links wallets that received tokens from the deployer and flags deployer linkage", () => {
    const t = [tr(Z, DEPLOYER, 1000n, 1), tr(DEPLOYER, a(1), 100n, 2), tr(DEPLOYER, a(2), 100n, 2)];
    const { balances } = replayTransfers(t);
    const clusters = findRelatedClusters(
      {
        holders: [a(1), a(2), DEPLOYER],
        transfers: t,
        deployer: DEPLOYER,
        poolAddresses: new Set([POOL]),
      },
      balances,
      1000n,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.linkedToDeployer).toBe(true);
    expect(clusters[0]!.wallets.sort()).toEqual([DEPLOYER, a(1), a(2)].sort());
    expect(clusters[0]!.signals.every((s) => s.evidence.length > 0)).toBe(true);
  });

  it("groups same-block first buys with low confidence", () => {
    const t = [
      tr(Z, POOL, 1000n, 1),
      tr(POOL, a(1), 10n, 7),
      tr(POOL, a(2), 10n, 7),
      tr(POOL, a(3), 10n, 9),
    ];
    const { balances } = replayTransfers(t);
    const clusters = findRelatedClusters(
      { holders: [a(1), a(2), a(3)], transfers: t, deployer: null, poolAddresses: new Set([POOL]) },
      balances,
      1000n,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.wallets.sort()).toEqual([a(1), a(2)].sort());
    expect(clusters[0]!.confidence).toBe("low");
  });

  it("uses common funding source when explorer data exists", () => {
    const t = [tr(Z, POOL, 1000n, 1), tr(POOL, a(1), 10n, 7), tr(POOL, a(2), 10n, 50)];
    const { balances } = replayTransfers(t);
    const clusters = findRelatedClusters(
      {
        holders: [a(1), a(2)],
        transfers: t,
        deployer: null,
        poolAddresses: new Set([POOL]),
        fundingSources: new Map([
          [a(1), a(99)],
          [a(2), a(99)],
        ]),
      },
      balances,
      1000n,
    );
    expect(clusters[0]!.signals.some((s) => s.signal === "common-funding-source")).toBe(true);
    expect(clusters[0]!.confidence).toBe("medium");
  });
});

describe("mass transfers and deployer actions", () => {
  it("detects a fan-out to many wallets in a short window", () => {
    const sender = a(0x55);
    const t = Array.from({ length: 12 }, (_, i) => tr(sender, a(100 + i), 1n, 1000 + i));
    const m = detectMassTransfers(t, new Set([POOL]));
    expect(m.count).toBe(1);
    expect(m.largestFanOut).toBe(12);
    expect(detectMassTransfers(t, new Set([POOL, sender])).count).toBe(0);
  });

  it("classifies deployer sells to pools", () => {
    const t = [
      tr(Z, DEPLOYER, 10n ** 18n, 1),
      tr(DEPLOYER, POOL, 5n * 10n ** 17n, 2),
      tr(DEPLOYER, a(5), 10n ** 17n, 3),
    ];
    const acts = classifyDeployerActions(t, DEPLOYER, new Set([POOL]), 18, () => null);
    expect(acts.map((x) => x.kind)).toEqual(["transfer-out", "sell", "create"]);
    expect(acts[1]!.amount).toBeCloseTo(0.5);
  });
});

describe("distributionHealthScore", () => {
  const good = {
    concentration: { top1: 0.09, top5: 0.19, top10: 0.28, top20: 0.4 },
    deployerShare: 0.016,
    relatedShare: 0,
    holderGrowth24h: 0.016,
    massTransfers: { count: 0, largestFanOut: 7 },
    holdersCount: 1550,
    now: new Date("2026-09-23T00:00:00Z"),
  };

  it("rates a spread-out token well", () => {
    const s = distributionHealthScore(good);
    expect(s.value).toBeGreaterThanOrEqual(80);
    expect(s.coverage).toBe(1);
  });

  it("concentrated supply and a large deployer bag score low", () => {
    const s = distributionHealthScore({
      ...good,
      concentration: { top1: 0.4, top5: 0.7, top10: 0.85, top20: 0.9 },
      deployerShare: 0.3,
      relatedShare: 0.3,
    });
    expect(s.value!).toBeLessThan(40);
    expect(s.level).toBe("high");
  });

  it("partial data forces low confidence", () => {
    expect(distributionHealthScore({ ...good, partial: true }).confidence).toBe("low");
  });

  it("no data → insufficient", () => {
    const s = distributionHealthScore({
      concentration: null,
      deployerShare: null,
      relatedShare: null,
      holderGrowth24h: null,
      massTransfers: null,
      holdersCount: null,
    });
    expect(s.value).toBeNull();
  });
});
