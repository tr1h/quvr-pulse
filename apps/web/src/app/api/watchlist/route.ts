import { NextResponse } from "next/server";
import { z } from "zod";
import { addToWatchlist, listWatchlist, rateLimit, removeFromWatchlist } from "@quvr/services";
import { tokenRefSchema } from "@quvr/shared";
import { clientIp, getOwnerId } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ address: tokenRefSchema.transform((r) => r.address) }).strict();

async function guard(req: Request) {
  // Same-origin only (CSRF defence in addition to SameSite=Lax cookies).
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host)
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  const owner = await getOwnerId();
  if (!owner) return { error: NextResponse.json({ error: "no_session" }, { status: 401 }) };
  const rl = await rateLimit("watchlist", await clientIp(), 30, 60);
  if (!rl.ok) return { error: NextResponse.json({ error: "rate_limited" }, { status: 429 }) };
  return { owner };
}

export async function GET(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const items = await listWatchlist("web", g.owner!);
  return NextResponse.json({
    items: items.map((i) => ({ address: i.tokenAddress, symbol: i.token.symbol })),
  });
}

export async function POST(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  const ok = await addToWatchlist("web", g.owner!, parsed.data.address);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "database_unavailable" }, { status: 503 });
}

export async function DELETE(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  await removeFromWatchlist("web", g.owner!, parsed.data.address);
  return NextResponse.json({ ok: true });
}
