import "server-only";
import type { Metadata } from "next";
import { LOCALES, serverEnv, type Locale } from "@quvr/shared";

/** Public origin used for canonical URLs, sitemap and Open Graph (NEXT_PUBLIC_APP_URL). */
/** Official X account (footer link, twitter:site, JSON-LD sameAs). */
export const X_HANDLE = "@quvrpulse";
export const X_URL = "https://x.com/quvrpulse";

export function siteUrl(): string {
  return serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

/** English lives at the plain URL, other languages at ?lang=xx; all are hreflang alternates. */
export function localizedPath(path: string, locale: Locale): string {
  return locale === "en" ? path : `${path}${path.includes("?") ? "&" : "?"}lang=${locale}`;
}

export const OG_LOCALE: Record<Locale, string> = {
  en: "en_US",
  ru: "ru_RU",
  de: "de_DE",
  es: "es_ES",
  zh: "zh_CN",
};

/** hreflang map for one path: every language plus x-default (English). */
export function hreflangs(path: string): Record<string, string> {
  const abs = (p: string) => `${siteUrl()}${p}`;
  return {
    ...Object.fromEntries(LOCALES.map((l) => [l, abs(localizedPath(path, l))])),
    "x-default": abs(path),
  };
}

/** Absolute URLs: Next drops the query string of relative "/?lang=ru" on the home page. */
export function alternates(path: string, locale: Locale): Metadata["alternates"] {
  const abs = (p: string) => `${siteUrl()}${p}`;
  return { canonical: abs(localizedPath(path, locale)), languages: hreflangs(path) };
}

/** Page metadata with canonical, hreflang and social cards in one place. */
export function pageMetadata(opts: {
  path: string;
  locale: Locale;
  title: string;
  description: string;
  noindex?: boolean;
  /** Skip the "| QUVR Pulse" template (home page already contains the brand). */
  absoluteTitle?: boolean;
}): Metadata {
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    alternates: alternates(opts.path, opts.locale),
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: `${siteUrl()}${localizedPath(opts.path, opts.locale)}`,
      siteName: "QUVR Pulse",
      locale: OG_LOCALE[opts.locale],
      alternateLocale: LOCALES.filter((l) => l !== opts.locale).map((l) => OG_LOCALE[l]),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      site: X_HANDLE,
      title: opts.title,
      description: opts.description,
    },
    ...(opts.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** JSON-LD must not break out of its <script>: escape "<". */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
