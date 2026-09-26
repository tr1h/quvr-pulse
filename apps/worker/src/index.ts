/**
 * QUVR Pulse background worker.
 *  - price & liquidity: every 15 s (light, batched Dexscreener)
 *  - holders / full report + alerts: every 5 min (on-chain, incremental logs)
 *  - trader statistics: every 15 min
 *  - social links: every 6 h
 *  - new v4 pools: every 60 s
 *  - social WebSocket alerts: realtime (when FOMO_API_KEY is set)
 * Uses BullMQ repeatable jobs when Redis is reachable, otherwise an in-process scheduler,
 * so `npm run dev` still works without Docker. Read-only: never signs or sends transactions.
 */
import { Queue, Worker } from "bullmq";
import { getProviders } from "@quvr/providers";
import {
  activeTokens,
  bullConnection,
  discoverNewTokens,
  dispatchAlerts,
  evaluateAlerts,
  getAuthorStatsForActive,
  getRedis,
  pruneOldSnapshots,
  backfillBaselines,
  publishOracleLabels,
  recordDueOutcomes,
  recordSourceStatus,
  refreshMarketSnapshots,
  refreshSocialLinks,
  refreshTokenReport,
  cacheGet,
  cacheSet,
  syncLeaderboardWallets,
  storeSocialAlert,
  tokensNeedingLinks,
  workerHeartbeat,
} from "@quvr/services";
import { appMode, logger, serverEnv } from "@quvr/shared";

const log = logger.child({ app: "worker" });
const JOB_QUEUE = "quvr-jobs";
const env = serverEnv();

/** paid: spends FomoAPI credits — never re-run just because the worker restarted. */
type Job = { name: string; everyMs: number; paid?: boolean; run: () => Promise<void> };

let fullRefreshRunning = false;

const jobs: Job[] = [
  {
    name: "market",
    everyMs: 15_000,
    run: async () => {
      const tokens = await activeTokens();
      if (!tokens.length) return;
      await refreshMarketSnapshots(tokens);
    },
  },
  {
    name: "holders",
    everyMs: 5 * 60_000,
    run: async () => {
      if (fullRefreshRunning) return; // never overlap heavy on-chain work
      fullRefreshRunning = true;
      try {
        for (const token of await activeTokens()) {
          try {
            const { report, previous } = await refreshTokenReport(token);
            const candidates = evaluateAlerts(previous, report);
            const delivered = await dispatchAlerts(token, candidates);
            log.info("token refreshed", { address: token, alerts: candidates.length, delivered });
          } catch (e) {
            log.warn("token refresh failed", { address: token, error: (e as Error).message });
          }
        }
      } finally {
        fullRefreshRunning = false;
      }
    },
  },
  {
    name: "traders",
    everyMs: 15 * 60_000,
    paid: true,
    run: async () => {
      if (!getProviders().social.isEnabled()) return;
      const n = await getAuthorStatsForActive();
      log.info("trader stats refreshed", { authors: n });
    },
  },
  {
    // Global Robinhood thesis feed (1 250 credits / 100 theses). The per-token endpoint does not
    // cover Robinhood yet, and the realtime stream only replays recent events on connect.
    name: "theses-feed",
    paid: true,
    everyMs: Math.max(1, Number(process.env.FOMO_FEED_POLL_HOURS ?? "12")) * 3_600_000,
    run: async () => {
      const social = getProviders().social;
      if (!social.isEnabled()) return;
      const theses = await social.getRecentTheses("robinhood", 100);
      let added = 0;
      for (const t of theses) {
        const isNew = await storeSocialAlert({
          eventId: t.id,
          type: "thesis",
          handle: t.handle,
          tokenAddress: t.tokenAddress,
          tradeUsd: t.tradeUsd,
          realizedPnlUsd: null,
          tradeId: t.tradeId,
          text: t.text,
          tokenSymbol: null,
          at: t.createdAt,
        });
        if (isNew) added++;
      }
      log.info("thesis feed polled", { received: theses.length, added });
    },
  },
  {
    // Leaderboard traders come with their EVM wallets: 2 × 250 credits for up to 250 wallets.
    name: "leaderboard-wallets",
    everyMs: 24 * 3_600_000,
    paid: true,
    run: async () => {
      const n = await syncLeaderboardWallets(getProviders().social);
      log.info("leaderboard wallets synced", { wallets: n });
    },
  },
  {
    name: "links",
    everyMs: 6 * 3_600_000,
    run: async () => refreshSocialLinks(await tokensNeedingLinks()),
  },
  {
    // Outcome tracking for survival statistics: baselines + 1h/24h/7d observations.
    name: "outcomes",
    everyMs: 5 * 60_000,
    run: async () => {
      const backfilled = await backfillBaselines();
      const recorded = await recordDueOutcomes();
      if (backfilled || recorded) log.info("outcome tracking", { backfilled, recorded });
    },
  },
  {
    // Risk Oracle: new/changed labels of liquid Robinhood Chain tokens → QuvrRiskOracle.sol.
    // A no-op until ORACLE_ADDRESS and ORACLE_PUBLISHER_KEY are set on the server.
    name: "oracle",
    everyMs: 30 * 60_000,
    run: async () => {
      const n = await publishOracleLabels();
      if (n) log.info("oracle labels published", { count: n });
    },
  },
  {
    name: "retention",
    everyMs: 24 * 3_600_000,
    run: async () => {
      const r = await pruneOldSnapshots();
      log.info("old snapshots pruned", r);
    },
  },
  {
    name: "discovery",
    everyMs: 60_000,
    run: async () => {
      const r = await discoverNewTokens();
      log.debug("discovery", { tokens: r.value.length });
    },
  },
];

async function runSafely(job: Job) {
  const t0 = Date.now();
  if (job.paid) {
    const last = await cacheGet<number>(`job-last:${job.name}`);
    if (last && Date.now() - last.value < job.everyMs * 0.9) return;
    await cacheSet(`job-last:${job.name}`, Date.now(), Math.ceil((job.everyMs * 2) / 1000));
  }
  try {
    await job.run();
    log.debug("job done", { job: job.name, ms: Date.now() - t0 });
  } catch (e) {
    log.warn("job failed", { job: job.name, error: (e as Error).message });
  }
}

async function redisUp(): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  // The shared client has no offline queue, so wait for the connection before pinging.
  if (r.status !== "ready") {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      r.once("ready", done);
      setTimeout(done, 5_000);
    });
  }
  if (r.status !== "ready") return false;
  try {
    await r.ping();
    return true;
  } catch {
    return false;
  }
}

async function startBull() {
  const connection = bullConnection();
  // One queue, one worker; each job type is a scheduler (idempotent across restarts).
  const queue = new Queue(JOB_QUEUE, { connection });
  for (const r of await queue.getRepeatableJobs())
    if (!jobs.some((j) => r.key.includes(`${j.name}-every`)))
      await queue.removeRepeatableByKey(r.key);
  for (const job of jobs) {
    await queue.upsertJobScheduler(
      `${job.name}-every`,
      { every: job.everyMs },
      { name: job.name, opts: { removeOnComplete: 100, removeOnFail: 100 } },
    );
  }
  const byName = new Map(jobs.map((j) => [j.name as string, j]));
  const worker = new Worker(
    JOB_QUEUE,
    async (bullJob) => {
      const job = byName.get(bullJob.name);
      if (job) await runSafely(job);
    },
    // Full on-chain refreshes can take minutes under public RPC limits.
    { connection, concurrency: jobs.length, lockDuration: 10 * 60_000 },
  );
  worker.on("error", (e) => log.warn("bullmq worker error", { error: e.message }));
  log.info("scheduler: bullmq", {
    queue: JOB_QUEUE,
    jobs: jobs.map((j) => `${j.name}/${j.everyMs / 1000}s`),
  });
}

function startInProcess() {
  for (const job of jobs) {
    void runSafely(job);
    setInterval(() => void runSafely(job), job.everyMs).unref?.();
  }
  log.warn("scheduler: in-process (Redis unavailable) — start `docker compose up -d` for BullMQ");
  setInterval(() => {}, 1 << 30); // keep alive
}

function startSocialStream() {
  const social = getProviders().social;
  if (!social.isEnabled()) {
    log.info("social stream disabled (onchain-only mode)");
    return;
  }
  let stored = 0;
  social.subscribeAlerts(
    "robinhood",
    (a) => {
      void storeSocialAlert(a)
        .then((newThesis) => {
          if (newThesis) stored++;
          // Buffered history on connect only fills the database; live events trigger refreshes.
          if (a.replay || !a.tokenAddress || (a.type !== "thesis" && a.type !== "sell")) return;
          return activeTokens().then(async (tokens) => {
            if (!tokens.includes(a.tokenAddress!)) return;
            const { report, previous } = await refreshTokenReport(a.tokenAddress!);
            await dispatchAlerts(a.tokenAddress!, evaluateAlerts(previous, report));
          });
        })
        .catch((e) => log.warn("social alert handling failed", { error: (e as Error).message }));
    },
    (status) => log.info("social stream", { status }),
  );
  setInterval(() => {
    if (stored) log.info("social stream: theses stored", { count: stored });
    stored = 0;
  }, 60_000);
}

async function main() {
  log.info("worker starting", {
    mode: appMode(env),
    chainId: env.ROBINHOOD_CHAIN_ID,
    rpc: env.ALCHEMY_API_KEY ? "alchemy" : "public",
  });
  if (await redisUp()) await startBull();
  else startInProcess();
  startSocialStream();
  const beat = async () => {
    await workerHeartbeat();
    await recordSourceStatus("worker", [
      {
        source: "blockscout",
        status: getProviders().explorer.isConfigured() ? "ok" : "disabled",
        note: "BLOCKSCOUT_API_KEY",
      },
      {
        source: "fomoapi",
        status: getProviders().social.isEnabled() ? "ok" : "disabled",
        note: "FOMO_API_KEY",
      },
    ]);
  };
  await beat();
  setInterval(() => void beat(), 30_000);
}

process.on("unhandledRejection", (e) => log.error("unhandled rejection", { error: String(e) }));
void main();
