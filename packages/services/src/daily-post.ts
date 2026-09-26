import { getDb } from "@quvr/db";
import { autopsyPost, dailyStatsPost, type Autopsy, type BaselineFeatures } from "@quvr/scoring";
import { chainById, type RiskLevel } from "@quvr/shared";
import { safeDb } from "./persistence";
import { getRugReport24h } from "./rug-report";

export type PostDraft = { title: string; text: string; address?: string };

type Raw = {
  address: string;
  status: "dead" | "no_market";
  observedAt: Date;
  priceRatio: number | null;
  liquidityRatio: number | null;
  capturedAt: Date;
  features: BaselineFeatures;
  symbol: string | null;
  chainId: number;
};

/**
 * Drafts for the admin page: one statistics post per chain and "autopsies" of tokens we labelled
 * risky before they lost 90%+ or their market. Only live baselines (label recorded before the
 * outcome) with real liquidity at the time, so the story is honest and not about dust tokens.
 */
export async function getPostDrafts(appUrl: string): Promise<PostDraft[]> {
  const base = appUrl.replace(/\/$/, "");
  const drafts: PostDraft[] = [];
  for (const chain of ["Robinhood Chain", "Base", "Solana"]) {
    const s = await getRugReport24h(chain).catch(() => null);
    const text = s && dailyStatsPost(s, chain, `${base}/rug-report`);
    if (text) drafts.push({ title: `Stats · ${chain}`, text });
  }
  const rows = await safeDb(
    "post-drafts",
    () =>
      getDb().$queryRaw<Raw[]>`
        SELECT o."tokenAddress" AS address, o.status, o."observedAt", o."priceRatio",
          o."liquidityRatio", b."capturedAt", b.features, t.symbol, t."chainId"
        FROM "TokenOutcome" o
        JOIN "TokenBaseline" b USING ("tokenAddress")
        JOIN "Token" t ON t.address = o."tokenAddress"
        WHERE NOT b.backfilled
          AND (o.status = 'dead' OR (o.status = 'no_market' AND o.horizon <> '1h'))
          AND o."observedAt" > now() - interval '48 hours'
          AND b.features->>'verdict' IN ('high', 'elevated')
          AND b."liquidityUsd" >= 2000
          -- Stablecoins and majors: a missing market for them is a data glitch, not a rug.
          AND (b."priceUsd" IS NULL OR b."priceUsd" NOT BETWEEN 0.97 AND 1.03)
          AND upper(coalesce(t.symbol, '')) NOT IN
            ('USDG', 'USDC', 'USDT', 'DAI', 'PYUSD', 'USDE', 'WETH', 'ETH', 'WBTC', 'SOL', 'WSOL')
        ORDER BY (b.features->>'verdict' = 'high') DESC, b."liquidityUsd" DESC, o."observedAt" ASC
        LIMIT 30`,
    [] as Raw[],
  );
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.address) || seen.size >= 5) continue;
    seen.add(r.address);
    const a: Autopsy = {
      symbol: r.symbol,
      address: r.address,
      chainName: chainById(r.chainId)?.name ?? "Robinhood Chain",
      verdict: r.features.verdict as RiskLevel,
      flags: r.features.flags ?? [],
      top10: r.features.top10 ?? null,
      capturedAt: r.capturedAt.toISOString(),
      observedAt: r.observedAt.toISOString(),
      status: r.status,
      priceRatio: r.priceRatio,
      liquidityRatio: r.liquidityRatio,
    };
    drafts.push({
      title: `Autopsy · ${r.symbol ? `$${r.symbol}` : r.address.slice(0, 10)}`,
      text: autopsyPost(a, `${base}/token/${r.address}`),
      address: r.address,
    });
  }
  return drafts;
}
