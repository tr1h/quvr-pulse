import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { rateLimit, recordEvent, recordHit, STAT_EVENTS } from "@quvr/services";
import { clientIp, getLocale } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  p: z.string().max(200).startsWith("/"),
  r: z.string().max(500).optional().default(""),
  e: z.enum(STAT_EVENTS).optional(),
});

/** First-party, cookieless page-view / event beacon (see services/stats.ts for privacy notes). */
export async function POST(req: Request) {
  const ip = await clientIp();
  if (!(await rateLimit("hit", ip, 120, 60)).ok) return new NextResponse(null, { status: 204 });
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return new NextResponse(null, { status: 204 });
  const ua = (await headers()).get("user-agent") ?? "";
  if (body.data.e) await recordEvent(body.data.e).catch(() => undefined);
  else
    await recordHit({
      path: body.data.p,
      referrer: body.data.r,
      locale: await getLocale(),
      ip,
      ua,
    }).catch(() => undefined);
  return new NextResponse(null, { status: 204 });
}
