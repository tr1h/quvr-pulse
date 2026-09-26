import { getDb } from "@quvr/db";
import { summarizeTrackRecord, type TrackCountRow, type TrackRecord } from "@quvr/scoring";
import { swr } from "./cache";
import { safeDb } from "./persistence";

export const TRACK_CHAINS = ["all", "robinhood", "base", "solana"] as const;
export type TrackChain = (typeof TRACK_CHAINS)[number];

export type TrackRecordData = TrackRecord & {
  chain: TrackChain;
  generatedAt: string;
  /** Tokens with a recorded baseline (live + reconstructed). */
  tracked: number;
  /** First live baseline: when honest forecasting started. */
  liveSince: string | null;
};

type Raw = {
  horizon: string;
  verdict: string | null;
  backfilled: boolean;
  status: string;
  n: bigint;
};

async function load(chain: TrackChain): Promise<TrackRecordData> {
  const chainFilter = chain === "all" ? null : chain;
  // Late observations are dropped: a "24h" sample taken at 40h would flatter or hurt the numbers.
  const rows = await safeDb(
    "track-record",
    () =>
      getDb().$queryRaw<Raw[]>`
        SELECT o.horizon, b.features->>'verdict' AS verdict, b.backfilled, o.status, count(*) AS n
        FROM "TokenOutcome" o
        JOIN "TokenBaseline" b USING ("tokenAddress")
        WHERE (${chainFilter}::text IS NULL OR b.chain = ${chainFilter}::text)
          AND o."delayMinutes" < CASE o.horizon WHEN '1h' THEN 30 WHEN '24h' THEN 180 ELSE 720 END
        GROUP BY 1, 2, 3, 4`,
    [] as Raw[],
  );
  const meta = await safeDb(
    "track-record:meta",
    () =>
      getDb().$queryRaw<Array<{ tracked: bigint; since: Date | null }>>`
        SELECT count(*) AS tracked,
          min("capturedAt") FILTER (WHERE NOT backfilled) AS since
        FROM "TokenBaseline"
        WHERE ${chainFilter}::text IS NULL OR chain = ${chainFilter}::text`,
    [] as Array<{ tracked: bigint; since: Date | null }>,
  );
  const counts: TrackCountRow[] = rows.map((r) => ({
    horizon: r.horizon,
    verdict: r.verdict ?? "insufficient",
    backfilled: r.backfilled,
    status: r.status,
    n: Number(r.n),
  }));
  return {
    ...summarizeTrackRecord(counts),
    chain,
    generatedAt: new Date().toISOString(),
    tracked: Number(meta[0]?.tracked ?? 0),
    liveSince: meta[0]?.since ? meta[0].since.toISOString() : null,
  };
}

/** Cached 15 minutes per chain: outcomes are recorded every 5 minutes and move slowly. */
export async function getTrackRecord(chain: TrackChain = "all"): Promise<TrackRecordData> {
  return (
    await swr(`track-record:v1:${chain}`, { freshSeconds: 900, keepSeconds: 86_400 }, () =>
      load(chain),
    )
  ).value;
}
