import { timingSafeEqual } from "node:crypto";

/** Admin pages (/admin/*) and /api/status: ?key=<ADMIN_STATS_KEY>. Anything else is a plain 404. */
export function isAdminKey(key: string | null | undefined): boolean {
  const secret = process.env.ADMIN_STATS_KEY ?? "";
  if (secret.length < 24 || !key) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
