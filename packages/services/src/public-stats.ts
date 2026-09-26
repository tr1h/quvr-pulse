import { getDb } from "@quvr/db";
import { swr } from "./cache";
import { safeDb } from "./persistence";
import { getTrackRecord, type TrackRecordData } from "./track-record";

export type PublicStats = {
  /** Every token we have analyzed at least once. */
  tokensAnalyzed: number;
  /** Tokens seen for the first time in the last 24 hours. */
  newTokens24h: number;
  /** Tokens (re)analyzed in the last 24 hours. */
  analyzed24h: number;
  /** Chains with at least one analyzed token. */
  chains: number;
  /** First analyzed token: how long the numbers have been collected. */
  since: string | null;
  track: TrackRecordData | null;
  generatedAt: string;
};

type Raw = { total: bigint; new24: bigint; scanned24: bigint; chains: bigint; since: Date | null };

/** Aggregate, public-safe numbers for the home and About pages. Cached 10 minutes. */
export async function getPublicStats(): Promise<PublicStats> {
  const load = async (): Promise<PublicStats> => {
    const rows = await safeDb(
      "public-stats",
      () =>
        getDb().$queryRaw<Raw[]>`
          SELECT count(*) AS total,
            count(*) FILTER (WHERE "firstSeenAt" > now() - interval '24 hours') AS new24,
            count(*) FILTER (WHERE "lastScannedAt" > now() - interval '24 hours') AS scanned24,
            count(DISTINCT "chainId") AS chains,
            min("firstSeenAt") AS since
          FROM "Token"
          WHERE "lastScannedAt" IS NOT NULL`,
      [] as Raw[],
    );
    const r = rows[0];
    return {
      tokensAnalyzed: Number(r?.total ?? 0),
      newTokens24h: Number(r?.new24 ?? 0),
      analyzed24h: Number(r?.scanned24 ?? 0),
      chains: Number(r?.chains ?? 0),
      since: r?.since ? r.since.toISOString() : null,
      track: await getTrackRecord("robinhood").catch(() => null),
      generatedAt: new Date().toISOString(),
    };
  };
  return (await swr("public-stats:v1", { freshSeconds: 600, keepSeconds: 86_400 }, load)).value;
}
