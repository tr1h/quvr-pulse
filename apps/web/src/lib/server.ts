import "server-only";
import { cookies, headers } from "next/headers";
import { isLocale, type Locale } from "@quvr/shared";

export async function getLocale(): Promise<Locale> {
  const q = (await headers()).get("x-qp-lang");
  if (isLocale(q)) return q;
  const c = (await cookies()).get("qp_lang")?.value;
  return isLocale(c) ? c : "en";
}

/** Anonymous per-browser owner id for the web watchlist (set by middleware). */
export async function getOwnerId(): Promise<string | null> {
  const v = (await cookies()).get("qp_uid")?.value;
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local")
    .trim()
    .slice(0, 64);
}

const CRAWLER =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|preview|whatsapp|vkshare|yandex|headless/i;

/** Search engines and link-preview fetchers (served stored reports only, never fresh scans). */
export async function isCrawler(): Promise<boolean> {
  return CRAWLER.test((await headers()).get("user-agent") ?? "");
}
