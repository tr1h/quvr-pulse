import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request CSP nonce (Next.js applies it to its own scripts), strict source lists,
 * and an anonymous watchlist id cookie (random, httpOnly — no accounts, no personal data).
 */
const TOKEN_ROUTE = /^\/token\/([^/]+)\/?$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const SITE_LOCALES = new Set(["en", "ru", "de", "es", "zh"]);
/** Browser language → site language (Ukrainian, Belarusian, Kazakh readers mostly read Russian). */
const BROWSER_TO_SITE: Record<string, string> = {
  ru: "ru",
  uk: "ru",
  be: "ru",
  kk: "ru",
  de: "de",
  es: "es",
  zh: "zh",
};

/** Site language for the primary Accept-Language tag; null keeps the English default. */
function browserLocale(header: string | null): string | null {
  const first = (header ?? "").split(",")[0]?.trim().toLowerCase().split(/[-;]/)[0] ?? "";
  return BROWSER_TO_SITE[first] ?? null;
}

export function middleware(req: NextRequest) {
  // Invalid addresses get a real 404 before any streaming starts.
  const m = TOKEN_ROUTE.exec(req.nextUrl.pathname);
  const raw = m ? decodeURIComponent(m[1]!) : "";
  if (m && !EVM.test(raw) && !SOLANA.test(raw)) {
    return NextResponse.rewrite(new URL("/_not-found-token", req.url), { status: 404 });
  }
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Yandex.Metrika (only active when YANDEX_METRIKA_ID is set) needs its own endpoints.
    "img-src 'self' data: https://cdn.dexscreener.com https://dd.dexscreener.com https://mc.yandex.ru https://mc.yandex.com",
    "font-src 'self'",
    `connect-src 'self' https://mc.yandex.ru https://mc.yandex.com wss://mc.yandex.ru${dev ? " ws: wss:" : ""}`,
    "frame-src blob: https://mc.yandex.ru https://mc.yandex.com",
    "child-src blob: https://mc.yandex.ru https://mc.yandex.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  // ?lang=xx gives every page a crawlable URL per language (hreflang); the cookie is the fallback.
  const langParam = req.nextUrl.searchParams.get("lang");
  const lang = langParam && SITE_LOCALES.has(langParam) ? langParam : null;
  // First visit without a choice: follow the browser language (not IP — VPNs are common in
  // crypto). Crawlers send English or no Accept-Language, so plain URLs stay English for search.
  const firstVisit =
    !lang && !req.cookies.get("qp_lang") ? browserLocale(req.headers.get("accept-language")) : null;
  if (lang) headers.set("x-qp-lang", lang);
  else if (firstVisit) headers.set("x-qp-lang", firstVisit);
  else headers.delete("x-qp-lang");
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", csp);

  if (firstVisit)
    res.cookies.set("qp_lang", firstVisit, {
      sameSite: "lax",
      secure: !dev,
      path: "/",
      maxAge: 31_536_000,
    });
  res.headers.append("vary", "Accept-Language");

  if (!req.cookies.get("qp_uid")) {
    res.cookies.set("qp_uid", crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: !dev,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)" }],
};
