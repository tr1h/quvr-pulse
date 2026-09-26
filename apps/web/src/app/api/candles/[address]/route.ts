import { NextResponse } from "next/server";
import { z } from "zod";
import { getPriceCandles, getTokenReport, rateLimit } from "@quvr/services";
import { chainSlug, tokenRefSchema } from "@quvr/shared";
import { clientIp } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const tfSchema = z.enum(["5m", "15m", "1h", "4h", "1D"]);

/** USD candles of the token's main pool for the interactive chart (server-side fetch only). */
export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const parsed = tokenRefSchema.safeParse((await params).address);
  if (!parsed.success) return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  const tf = tfSchema.safeParse(new URL(req.url).searchParams.get("tf") ?? "15m");
  if (!tf.success) return NextResponse.json({ error: "invalid_timeframe" }, { status: 400 });
  const rl = await rateLimit("candles", await clientIp(), 60, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } },
    );
  }
  try {
    // Stored/cached report only for the pool lookup: a chart refresh must never start a scan.
    const { report } = await getTokenReport(parsed.data.address, { crawler: true });
    const pair = report.liquidity.mainPair.value;
    if (!pair) return NextResponse.json({ candles: [], pool: null }, { status: 200 });
    const data = await getPriceCandles(
      chainSlug(report.chainId),
      report.address,
      pair,
      tf.data,
    );
    if (!data) return NextResponse.json({ error: "source_unavailable" }, { status: 503 });
    return NextResponse.json(
      {
        candles: data.candles,
        source: "geckoterminal",
        pool: `${pair.baseToken.symbol ?? "?"}/${pair.quoteToken.symbol ?? "?"} · ${pair.dexId}`,
        fetchedAt: data.fetchedAt,
        stale: data.isStale,
      },
      { headers: { "cache-control": "public, max-age=30" } },
    );
  } catch {
    return NextResponse.json({ error: "providers_unavailable" }, { status: 503 });
  }
}
