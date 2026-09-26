import { NextResponse, type NextRequest } from "next/server";
import { getSystemStatus } from "@quvr/services";
import { isAdminKey } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Internal source health (JSON): ?key=<ADMIN_STATS_KEY> or x-admin-key header. */
export async function GET(req: NextRequest) {
  const key = req.headers.get("x-admin-key") ?? req.nextUrl.searchParams.get("key");
  if (!isAdminKey(key)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(await getSystemStatus(), { headers: { "cache-control": "no-store" } });
}
