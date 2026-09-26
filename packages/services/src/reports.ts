import { checkOperation, withOperationTimeout } from "@quvr/providers";
import { acquireLease } from "./lease";
import { withLiveMarket } from "./report-market";
import {
  logger,
  normalizeTokenAddress,
  parseTokenRef,
  type SourcedValue,
  type TokenReport,
} from "@quvr/shared";
import { cacheGet, cacheSet, swr } from "./cache";
import { resolveTokenChain } from "./chain-resolve";
import {
  loadLastReport as loadAnyChainReport,
  persistReport,
  recordSourceStatus,
} from "./persistence";
import { buildTokenReport } from "./scan/report";
import { buildSolanaTokenReport } from "./scan/solana-report";

/**
 * Routes a token to its chain builder: base58 → Solana; 0x… → Robinhood Chain or Base, whichever
 * the token actually lives on (see resolveTokenChain). A previous report from another chain is
 * never used as a baseline.
 */
async function buildAny(
  token: string,
  prev: TokenReport | null,
  opts: { historyBudgetMs?: number; quick?: boolean } = {},
) {
  if (parseTokenRef(token)?.chain === "solana") return buildSolanaTokenReport(token, prev);
  const chainId = await resolveTokenChain(token);
  return buildTokenReport(token, prev?.chainId === chainId ? prev : null, { ...opts, chainId });
}

/** Last stored report, only if it belongs to the chain the token resolves to now. */
async function loadLastReport(token: string): Promise<TokenReport | null> {
  const last = await loadAnyChainReport(token);
  if (!last || parseTokenRef(token)?.chain === "solana") return last;
  return last.chainId === (await resolveTokenChain(token)) ? last : null;
}

const FRESH_SECONDS = 5 * 60; // Heavy risk analysis; display prices refresh independently.
const KEEP_SECONDS = 3_600;
let lastStatusWrite = 0;

function deepMarkStale<T>(v: T): T {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    if ("value" in v && "source" in v && "fetchedAt" in v && "isStale" in v)
      return { ...(v as unknown as SourcedValue<unknown>), isStale: true } as T;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = deepMarkStale(x);
    return out as T;
  }
  return v;
}

/**
 * Forces a rebuild (worker refresh) and stores it for readers. Returns the previous
 * report too, so alert rules can diff old vs new state.
 */
export async function refreshTokenReport(
  address: string,
): Promise<{ report: TokenReport; previous: TokenReport | null }> {
  const token = normalizeTokenAddress(address);
  const previous =
    (await cacheGet<TokenReport>(`report:${token}`))?.value ?? (await loadLastReport(token));
  const report = await buildInBackground(token);
  return { report, previous };
}

async function produce(token: string): Promise<TokenReport> {
  const release = await acquireLease(`report:${token}`, 7 * 60_000);
  try {
    const prev =
      (await cacheGet<TokenReport>(`report:${token}`))?.value ?? (await loadLastReport(token));
    if (!release) {
      if (prev) return prev;
      throw new Error("report is being built by another worker or Redis is unavailable");
    }
    if (prev && Date.now() - Date.parse(prev.generatedAt) < FRESH_SECONDS * 1000) return prev;
    return await withOperationTimeout(6 * 60_000, async () => {
      const { report, codeHash } = await buildAny(token, prev, { historyBudgetMs: 300_000 });
      checkOperation();
      await persistReport(report, { codeHash });
      checkOperation();
      await cacheSet(`report:${token}`, report, KEEP_SECONDS);
      if (Date.now() - lastStatusWrite > 30_000) {
        lastStatusWrite = Date.now();
        void recordSourceStatus("web");
      }
      return report;
    });
  } finally {
    await release?.();
  }
}

export type ReportResponse = {
  report: TokenReport;
  /** "quick" = partial first answer; the full report is being built in the background. */
  servedFrom: "fresh" | "cache" | "stale-cache" | "database" | "quick";
};

/** Shared by page refreshes, worker jobs and social events in this process. */
const BACKGROUND = new Map<string, Promise<TokenReport>>();

function buildInBackground(token: string): Promise<TokenReport> {
  const running = BACKGROUND.get(token);
  if (running) return running;
  const p = produce(token).finally(() => {
    if (BACKGROUND.get(token) === p) BACKGROUND.delete(token);
  });
  p.catch((e) => logger.warn("background report failed", { token, error: (e as Error).message }));
  BACKGROUND.set(token, p);
  return p;
}

/** Waits (bounded) for a background full build started by a quick answer; null on timeout. */
export async function waitForFullReport(
  address: string,
  timeoutMs: number,
): Promise<TokenReport | null> {
  const p = BACKGROUND.get(normalizeTokenAddress(address));
  if (!p) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p.catch(() => null),
      new Promise<null>((res) => {
        timer = setTimeout(() => res(null), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const RECENT_MS = 10 * 60_000;

/**
 * Stale-while-revalidate report access for pages and bots.
 * If everything fails, the last good report from the database is served, marked stale.
 */
export async function getTokenReport(
  address: string,
  opts: { crawler?: boolean } = {},
): Promise<ReportResponse> {
  const token = normalizeTokenAddress(address);
  // Search/social crawlers read the last stored report and never trigger a scan: hundreds of
  // sitemap URLs must not burn RPC budget or paid FomoAPI credits meant for real users.
  if (opts.crawler) {
    const cached = await cacheGet<TokenReport>(`report:${token}`);
    if (cached) return { report: cached.value, servedFrom: "cache" };
    const last = await loadLastReport(token);
    if (last) return { report: last, servedFrom: "database" };
  }
  const cached = await cacheGet<TokenReport>(`report:${token}`);
  const last = cached?.value ?? (await loadLastReport(token));
  if (last) {
    const age = Date.now() - Date.parse(last.generatedAt);
    if (age >= FRESH_SECONDS * 1000) void buildInBackground(token).catch(() => undefined);
    const report = age >= RECENT_MS ? deepMarkStale(last) : last;
    return {
      report: await withLiveMarket(report),
      servedFrom: age >= RECENT_MS ? "stale-cache" : cached ? "cache" : "database",
    };
  }
  if (parseTokenRef(token)?.chain !== "solana") {
    const quick = await swr(`report-quick:${token}`, { freshSeconds: 60, keepSeconds: 60 }, () =>
      buildAny(token, null, { quick: true }).then((r) => r.report),
    );
    void buildInBackground(token).catch(() => undefined);
    return { report: quick.value, servedFrom: "quick" };
  }
  return { report: await buildInBackground(token), servedFrom: "fresh" };
}
