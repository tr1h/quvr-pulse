import { getDb } from "@quvr/db";
import { summarizeRugReport, type RugReportSummary, type RugRow } from "@quvr/scoring";
import type { RiskLevel, Severity } from "@quvr/shared";
import { swr } from "./cache";
import { safeDb } from "./persistence";

export const RUG_REPORT_DAYS = 7;

export type RugReportData = RugReportSummary & {
  generatedAt: string;
  from: string;
  to: string;
  windowDays: number;
  /** First token we ever stored — tells readers how much history exists. */
  historySince: string | null;
};

type Raw = {
  address: string;
  chain: string | null;
  symbol: string | null;
  name: string | null;
  cs: string | null;
  lh: string | null;
  dh: string | null;
  findings: Array<{ code: string; severity: string }> | null;
  mcap: number | null;
  liq: number | null;
  vol: number | null;
  top10: number | null;
};

const LEVELS = new Set(["low", "elevated", "high", "insufficient"]);
const level = (v: string | null): RiskLevel =>
  v && LEVELS.has(v) ? (v as RiskLevel) : "insufficient";
/** jsonb text → number; anything non-numeric is "no data", never zero. */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function load(days = RUG_REPORT_DAYS, chainName?: string): Promise<RugReportData> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  // Only the fields the report needs are extracted in SQL (full reports are ~20 KB each).
  const rows = await safeDb(
    "rug-report",
    () =>
      getDb().$queryRaw<Raw[]>`
        SELECT t.address,
          r->>'chainName' AS chain,
          r->'token'->'symbol'->>'value' AS symbol,
          r->'token'->'name'->>'value' AS name,
          r->'scores'->'contractSafety'->>'level' AS cs,
          r->'scores'->'liquidityHealth'->>'level' AS lh,
          r->'scores'->'distributionHealth'->>'level' AS dh,
          (SELECT jsonb_agg(jsonb_build_object('code', f->>'code', 'severity', f->>'severity'))
             FROM jsonb_array_elements(COALESCE(r->'findings', '[]'::jsonb)) f) AS findings,
          r->'market'->'marketCapUsd'->>'value' AS mcap,
          r->'market'->'liquidityUsd'->>'value' AS liq,
          r->'market'->'volume'->'value'->>'h24' AS vol,
          r->'distribution'->'concentration'->'value'->>'top10' AS top10
        FROM "Token" t
        CROSS JOIN LATERAL (SELECT t."lastReport"::jsonb AS r) x
        WHERE t."lastScannedAt" >= ${from} AND r IS NOT NULL AND r->>'chainName' IS NOT NULL`,
    [] as Raw[],
  );
  const since = await safeDb(
    "rug-report:since",
    async () =>
      (await getDb().token.aggregate({ _min: { firstSeenAt: true } }))._min.firstSeenAt ?? null,
    null,
  );
  const parsed: RugRow[] = rows.map((r) => ({
    address: r.address,
    chain: r.chain ?? "unknown",
    symbol: r.symbol,
    name: r.name,
    levels: [level(r.cs), level(r.lh), level(r.dh)],
    findings: (r.findings ?? []).map((f) => ({ code: f.code, severity: f.severity as Severity })),
    marketCapUsd: num(r.mcap),
    liquidityUsd: num(r.liq),
    volume24hUsd: num(r.vol),
    top10: num(r.top10),
  }));
  return {
    ...summarizeRugReport(chainName ? parsed.filter((r) => r.chain === chainName) : parsed),
    generatedAt: to.toISOString(),
    from: from.toISOString(),
    to: to.toISOString(),
    windowDays: days,
    historySince: since ? since.toISOString() : null,
  };
}

/** Cached for 30 minutes: the numbers move slowly and the page is shared a lot. */
export async function getRugReport(): Promise<RugReportData> {
  return (await swr("rug-report:v1", { freshSeconds: 1800, keepSeconds: 86_400 }, load)).value;
}

/** Last-24h summary for one chain (chainName as in reports, e.g. "Robinhood Chain"). */
export async function getRugReport24h(chainName: string): Promise<RugReportData> {
  return (
    await swr(`rug-report:24h:${chainName}`, { freshSeconds: 900, keepSeconds: 86_400 }, () =>
      load(1, chainName),
    )
  ).value;
}
