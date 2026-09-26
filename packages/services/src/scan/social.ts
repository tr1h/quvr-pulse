import type { SocialProvider, SocialThesis } from "@quvr/providers";
import { authorQuality, thesisOutcomes, type SocialThesisSignal } from "@quvr/scoring";
import type { AuthorStats, ThesisView } from "@quvr/shared";
import { getDb } from "@quvr/db";
import { swr } from "../cache";
import { safeDb } from "../persistence";
import { onchainAuthorStats, walletTokenActivity } from "../onchain/author-trades";
import { resolveAuthorWallet } from "../onchain/author-wallets";

/** Resolves with null after ms; the underlying work keeps running (and fills the cache). */
function withinBudget<T>(p: Promise<T>, ms: number): Promise<T | null> {
  p.catch(() => undefined);
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** Theses of one author across tokens (for "how fast does the author sell after a thesis"). */
async function authorTheses(handle: string) {
  return safeDb(
    "social:authorTheses",
    async () =>
      (
        await getDb().thesis.findMany({
          where: { trader: { handle } },
          select: { tokenAddress: true, publishedAt: true },
          take: 200,
        })
      ).map((t) => ({ token: t.tokenAddress, publishedAt: t.publishedAt.getTime() })),
    [] as Array<{ token: string; publishedAt: number }>,
  );
}

/** Theses and author trades collected from the realtime stream (no credit cost). */
async function streamData(token: string) {
  return safeDb(
    "social:streamData",
    async () => {
      const db = getDb();
      const [theses, signals] = await Promise.all([
        db.thesis.findMany({
          where: { tokenAddress: token },
          orderBy: { publishedAt: "desc" },
          take: 50,
          include: { trader: { select: { handle: true, displayName: true } } },
        }),
        db.tradeSignal.findMany({
          where: { tokenAddress: token, kind: { in: ["buy", "sell"] } },
          orderBy: { timestamp: "asc" },
          take: 2_000,
          include: { trader: { select: { handle: true } } },
        }),
      ]);
      return {
        theses: theses.map((t): SocialThesis => ({
          id: t.id,
          tradeId: t.tradeId,
          handle: t.trader.handle,
          displayName: t.trader.displayName,
          userId: null,
          text: t.text,
          createdAt: t.publishedAt.toISOString(),
          likes: t.likes,
          isDev: t.isDev,
          tradeUsd: t.tradeUsd,
          tokenAddress: t.tokenAddress,
          chain: "robinhood",
        })),
        signals: signals
          .filter((x) => x.trader)
          .map((x) => ({
            handle: x.trader!.handle.toLowerCase(),
            kind: x.kind,
            at: x.timestamp.getTime(),
          })),
      };
    },
    {
      theses: [] as SocialThesis[],
      signals: [] as Array<{ handle: string; kind: string; at: number }>,
    },
  );
}

async function streamSells(handle: string) {
  return safeDb(
    "social:streamSells",
    async () => {
      const rows = await getDb().tradeSignal.findMany({
        where: { kind: "sell", trader: { handle } },
        orderBy: { timestamp: "asc" },
        take: 500,
      });
      return rows.flatMap((r) => {
        const raw =
          r.raw && typeof r.raw === "object" && !Array.isArray(r.raw)
            ? (r.raw as { realizedPnlUsd?: unknown })
            : null;
        const pnl = raw?.realizedPnlUsd;
        return typeof pnl === "number"
          ? [
              {
                sizeUsd: null,
                realizedPnlUsd: pnl,
                openedAt: null,
                closedAt: r.timestamp.toISOString(),
                status: "closed" as const,
              },
            ]
          : [];
      });
    },
    [] as Array<{
      sizeUsd: null;
      realizedPnlUsd: number;
      openedAt: null;
      closedAt: string;
      status: "closed";
    }>,
  );
}

export type SocialBundle = {
  theses: ThesisView[];
  authors: AuthorStats[];
  signals: SocialThesisSignal[];
  trendingRank: number | null;
  trackedHolders: Array<{ handle: string; valueUsd: number | null }>;
  fetchedAt: string;
  isStale: boolean;
};

/**
 * Author statistics come from the trade history only (250 credits). Wallet resolution
 * (/v2/users, 2 500 credits, ~45 s) is not needed for quality and is used only on the trader
 * page. Refresh period: FOMO_STATS_REFRESH_MINUTES (spec target 15; default 360 so the free
 * 250 000-credit plan is not exhausted in days).
 */
export function authorRefreshSeconds(): number {
  const m = Number(process.env.FOMO_STATS_REFRESH_MINUTES ?? "360");
  return Math.max(15, Number.isFinite(m) ? m : 360) * 60;
}

/**
 * Author quality, best source first:
 *  1. on-chain trades of the author's confirmed wallet (free, complete for the window);
 *  2. FomoAPI trade history (250 credits, often unavailable upstream);
 *  3. realized sells seen on the realtime stream (low confidence).
 * allowPaid=false (page scans) never spends credits on wallet lookups; budgetMs bounds the
 * time a page waits for a first on-chain load (it continues in the background).
 */
export async function getAuthorStats(
  social: SocialProvider,
  handle: string,
  opts: { allowPaid?: boolean; budgetMs?: number } = {},
): Promise<AuthorStats> {
  const lookup = await resolveAuthorWallet(social, handle, { allowPaid: opts.allowPaid ?? false });
  if (lookup.wallet) {
    const onchain = await withinBudget(
      authorTheses(handle).then((th) => onchainAuthorStats(handle, lookup.wallet!, th)),
      opts.budgetMs ?? 8_000,
    ).catch(() => null);
    if (onchain) return onchain;
  }
  return providerAuthorStats(social, handle);
}

async function providerAuthorStats(social: SocialProvider, handle: string): Promise<AuthorStats> {
  const r = await swr(
    `social:author:${handle.toLowerCase()}`,
    { freshSeconds: authorRefreshSeconds(), keepSeconds: 7 * 86_400 },
    async () => {
      let closed;
      let source = "fomoapi trades";
      try {
        const trades = await social.getUserTrades(handle);
        closed = trades.filter((tr) => tr.status === "closed" || tr.closedAt);
      } catch (e) {
        // Provider history unavailable (upstream timeouts are common): fall back to realized
        // sells of this author seen on our realtime stream. No size, so no ROI; low confidence.
        const own = await streamSells(handle);
        if (own.length === 0) throw e;
        closed = own;
        source = "fomoapi-ws realized sells";
      }
      const stats = authorQuality({
        handle,
        displayName: null,
        verified: null,
        evmWallet: null,
        trades: closed.map((tr) => ({
          sizeUsd: tr.sizeUsd,
          realizedPnlUsd: tr.realizedPnlUsd,
          openedAt: tr.openedAt,
          closedAt: tr.closedAt,
        })),
      });
      return {
        ...stats,
        source,
        qualityConfidence: source === "fomoapi trades" ? stats.qualityConfidence : ("low" as const),
      };
    },
  );
  return r.value;
}

export async function loadSocial(
  social: SocialProvider,
  token: string,
  priceSeries: Array<{ t: number; priceNative: number }>,
  storedEntries: Map<string, number | null>,
  opts: { chain?: "robinhood" | "solana" } = {},
): Promise<SocialBundle> {
  const solana = opts.chain === "solana";
  const [thesesR, trendingR, holdersR] = await Promise.allSettled([
    solana
      ? // Solana mints are covered by the per-token endpoint (1 250 credits when theses exist,
        // 0 when none) — cached for an hour and bounded by the daily credit cap.
        swr(`social:theses-sol:${token}`, { freshSeconds: 3_600, keepSeconds: 7 * 86_400 }, () =>
          social.getTokenTheses(token, 50, "sol"),
        )
      : // The per-token thesis endpoint does not cover Robinhood yet but can still bill 1 250
        // credits; theses come from the realtime stream and the global feed instead.
        Promise.resolve({
          value: [] as SocialThesis[],
          fetchedAt: new Date().toISOString(),
          isStale: false,
        }),
    solana
      ? swr(`social:trending:solana`, { freshSeconds: 3_600, keepSeconds: 86_400 }, () =>
          social.getTrendingTokens("1399811149", 50),
        )
      : swr(`social:trending`, { freshSeconds: 3_600, keepSeconds: 86_400 }, () =>
          social.getTrendingTokens("robinhood", 50),
        ),
    swr(`social:holders:${token}`, { freshSeconds: 6 * 3_600, keepSeconds: 7 * 86_400 }, () =>
      social.getTokenTrackedHolders(token),
    ),
  ]);
  // The per-token endpoint does not cover Robinhood yet (answers available:false, 0 credits),
  // so theses collected from /ws/alerts are merged in.
  const stream = await streamData(token);
  if (thesesR.status === "rejected" && stream.theses.length === 0) throw thesesR.reason;
  const apiTheses = thesesR.status === "fulfilled" ? thesesR.value.value : [];
  const byId = new Map<string, SocialThesis>();
  for (const t of [...apiTheses, ...stream.theses])
    if (!t.tokenAddress || t.tokenAddress === token) byId.set(t.id, t);
  const raw = [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const fetched =
    thesesR.status === "fulfilled"
      ? thesesR.value
      : { fetchedAt: new Date().toISOString(), isStale: false };
  const trackedHolders = holdersR.status === "fulfilled" ? holdersR.value.value : [];
  const holdingHandles = new Set(trackedHolders.map((h) => h.handle.toLowerCase()));
  const trendingRank =
    trendingR.status === "fulfilled"
      ? (trendingR.value.value.find((x) => x.address === token)?.rank ?? null)
      : null;

  const handles = [...new Set(raw.map((t) => t.handle))].slice(
    0,
    Number(process.env.FOMO_MAX_AUTHORS_PER_TOKEN ?? "3"),
  );
  const authors: AuthorStats[] = [];
  for (const h of handles) {
    try {
      authors.push(await getAuthorStats(social, h));
    } catch {
      /* author stats are optional; thesis stays with unknown quality */
    }
  }
  const byHandle = new Map(authors.map((a) => [a.handle.toLowerCase(), a]));
  const onchainActivity = new Map<string, Awaited<ReturnType<typeof walletTokenActivity>>>();
  for (const a of authors)
    if (a.evmWallet)
      onchainActivity.set(a.evmWallet, await walletTokenActivity(a.evmWallet, token));

  const series = priceSeries.map((p) => ({ t: p.t, price: p.priceNative }));
  const now = Date.now();
  const theses: ThesisView[] = raw.slice(0, 50).map((th) => {
    const published = Date.parse(th.createdAt);
    const { entry, outcomes } = thesisOutcomes(
      published,
      series,
      now,
      storedEntries.get(th.id) ?? null,
    );
    return {
      id: th.id,
      authorHandle: th.handle,
      authorName: th.displayName,
      text: th.text,
      createdAt: th.createdAt,
      likes: th.likes,
      isDev: th.isDev,
      tradeUsd: th.tradeUsd,
      priceAtPublishNative: entry,
      outcomes,
      source: social.name,
    };
  });

  const signals: SocialThesisSignal[] = raw.map((th) => {
    const a = byHandle.get(th.handle.toLowerCase());
    const h = th.handle.toLowerCase();
    const published = Date.parse(th.createdAt);
    // Real author trades from the stream beat the holders snapshot when available.
    const chainAct = a?.evmWallet ? onchainActivity.get(a.evmWallet) : undefined;
    const own = chainAct?.known
      ? [
          ...chainAct.buys.map((at) => ({ handle: h, kind: "buy", at })),
          ...chainAct.sells.map((at) => ({ handle: h, kind: "sell", at })),
        ]
      : stream.signals.filter((x) => x.handle === h);
    const boughtBefore = own.some((x) => x.kind === "buy" && x.at <= published + 3_600_000);
    const soldAfter = own.some((x) => x.kind === "sell" && x.at >= published);
    // The tracked-holders list covers only some traders: presence proves holding, absence proves nothing.
    const fromHolders = holdingHandles.has(h) ? true : null;
    const holds = own.length ? !soldAfter : fromHolders;
    return {
      authorHandle: th.handle,
      createdAt: th.createdAt,
      authorTier: a?.qualityTier ?? "insufficient",
      authorQuality: a?.qualityScore ?? null,
      confirmedBuy:
        boughtBefore || th.tradeId || (th.tradeUsd ?? 0) > 0 ? true : own.length ? false : null,
      authorStillHolds: holds,
      // "Sold" only from an observed sell (on-chain or stream), never from absence in a list.
      authorSold: own.length ? soldAfter : null,
      authorWallet: a?.evmWallet ?? null,
    };
  });

  return {
    theses,
    authors,
    signals,
    trendingRank,
    trackedHolders,
    fetchedAt: fetched.fetchedAt,
    isStale: fetched.isStale,
  };
}

/** Worker job (15 min): refresh statistics of every author who wrote about an active token. */
export async function refreshAuthorsFor(social: SocialProvider, tokens: string[]): Promise<number> {
  const handles = new Set<string>();
  for (const token of tokens) {
    // Theses collected from the stream/feed (free) — not the per-token endpoint.
    for (const th of (await streamData(token)).theses) handles.add(th.handle);
  }
  let n = 0;
  for (const h of [...handles].slice(0, 15)) {
    try {
      await getAuthorStats(social, h, { allowPaid: true, budgetMs: 300_000 });
      n++;
    } catch {
      /* next cycle */
    }
  }
  return n;
}
