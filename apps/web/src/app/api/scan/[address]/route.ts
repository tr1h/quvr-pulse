import { NextResponse } from "next/server";
import { getTokenReport, rateLimit } from "@quvr/services";
import { tokenRefSchema } from "@quvr/shared";
import { clientIp } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const parsed = tokenRefSchema.safeParse((await params).address);
  if (!parsed.success) return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  const rl = await rateLimit("scan", await clientIp(), 30, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } },
    );
  }
  try {
    const { report, servedFrom } = await getTokenReport(parsed.data.address);
    return NextResponse.json({ servedFrom, report }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "providers_unavailable" }, { status: 503 });
  }
}
