import {
  logger,
  normalizeTokenAddress,
  parseTokenRef,
  type SourcedValue,
  type TokenReport,
} from "@quvr/shared";
import { cacheGet, cacheSet, swr } from "./cache";
import { resolveTokenChain } from "./chain-resolve";
import { loadLastReport as loadAnyChainReport, persistReport, recordSourceStatus } from "./persistence";
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

const FRESH_SECONDS = 20; // price & liquidity refresh target: 10–20 s
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
  const prevCached = await cacheGet<TokenReport>(`report:${token}`);
  const previous = prevCached?.value ?? (await loadLastReport(token));
  // Background refresh may wait for the full transfer history (public RPC log budget).
  const { report, codeHash } = await buildAny(token, previous, {
    historyBudgetMs: 300_000,
  });
  await persistReport(report, { codeHash });
  await cacheSet(`report:${token}`, report, KEEP_SECONDS);
  return { report, previous };
}

async function produce(token: string): Promise<TokenReport> {
  const prevCached = await cacheGet<TokenReport>(`report:${token}`);
  const prev = prevCached?.value ?? (await loadLastReport(token));
  const { report, codeHash } = await buildAny(token, prev);
  await persistReport(report, { codeHash });
  if (Date.now() - lastStatusWrite > 30_000) {
    lastStatusWrite = Date.now();
    void recordSourceStatus("web");
  }
  return report;
}

export type ReportResponse = {
  report: TokenReport;
  /** "quick" = partial first answer; the full report is being built in the background. */
  servedFrom: "fresh" | "cache" | "stale-cache" | "database" | "quick";
};

/** Full builds started for first visitors (deduplicated per token). */
const BACKGROUND = new Map<string, Promise<TokenReport>>();

function buildInBackground(token: string): Promise<TokenReport> {
  const running = BACKGROUND.get(token);
  if (running) return running;
  const p = produce(token)
    .then(async (report) => {
      await cacheSet(`report:${token}`, report, KEEP_SECONDS);
      return report;
    })
    .finally(() => BACKGROUND.delete(token));
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
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((res) => setTimeout(() => res(null), timeoutMs)),
  ]);
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
  // First visitor for this token in this process (nothing in the fast cache): answer at once.
  if (!(await cacheGet<TokenReport>(`report:${token}`))) {
    const last = await loadLastReport(token);
    if (last) {
      // Stored by the worker or an earlier visit: show it now, refresh behind the scenes.
      void buildInBackground(token).catch(() => undefined);
      const recent = Date.now() - Date.parse(last.generatedAt) < RECENT_MS;
      return recent
        ? { report: last, servedFrom: "cache" }
        : { report: deepMarkStale(last), servedFrom: "database" };
    }
    if (parseTokenRef(token)?.chain !== "solana") {
      // Brand-new token: a quick partial report in seconds (Solana builds are fast anyway).
      const quickKey = `report-quick:${token}`;
      const hit = await cacheGet<TokenReport>(quickKey);
      const quick =
        hit?.value ??
        (await buildAny(token, null, { quick: true })
          .then(async ({ report }) => {
            await cacheSet(quickKey, report, 60);
            return report;
          })
          .catch(() => null));
      if (quick) {
        void buildInBackground(token).catch(() => undefined);
        return { report: quick, servedFrom: "quick" };
      }
    }
  }
  try {
    const r = await swr(
      `report:${token}`,
      { freshSeconds: FRESH_SECONDS, keepSeconds: KEEP_SECONDS },
      () => produce(token),
    );
    if (!r.isStale)
      return {
        report: r.value,
        servedFrom: Date.now() - Date.parse(r.fetchedAt) < 2_000 ? "fresh" : "cache",
      };
    const ageMs = Date.now() - Date.parse(r.fetchedAt);
    return { report: ageMs > 60_000 ? deepMarkStale(r.value) : r.value, servedFrom: "stale-cache" };
  } catch (e) {
    logger.error("report build failed", { token, error: (e as Error).message });
    const last = await loadLastReport(token);
    if (last) return { report: deepMarkStale(last), servedFrom: "database" };
    throw e;
  }
}
