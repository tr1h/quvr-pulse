import type { Locale } from "./report";

const INTL: Record<Locale, string> = {
  ru: "ru-RU",
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  zh: "zh-CN",
};
const intl = (locale: Locale) => INTL[locale];

export function formatUsd(value: number | null | undefined, locale: Locale = "ru"): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return compact(value, locale, "$");
  if (abs >= 100_000) return compact(value, locale, "$");
  if (abs >= 1) {
    return new Intl.NumberFormat(intl(locale), {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: abs >= 1000 ? 0 : 2,
    }).format(value);
  }
  return formatSmallPrice(value, locale, "$");
}

function compact(value: number, locale: Locale, prefix: string) {
  const s = new Intl.NumberFormat(intl(locale), {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
  return `${prefix}${s}`;
}

/** Very small token prices: $0.0₄2573 style is hard to read on mobile, use significant digits. */
export function formatSmallPrice(value: number, locale: Locale = "ru", prefix = "$"): string {
  if (value === 0) return `${prefix}0`;
  return `${prefix}${new Intl.NumberFormat(intl(locale), { maximumSignificantDigits: 4 }).format(value)}`;
}

export function formatNumber(
  value: number | null | undefined,
  locale: Locale = "ru",
  digits = 2,
): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat(intl(locale), {
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPct(
  value: number | null | undefined,
  locale: Locale = "ru",
  digits = 1,
): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${new Intl.NumberFormat(intl(locale), { maximumFractionDigits: digits }).format(value * 100)}%`;
}

/** For values already expressed in percent (e.g. Dexscreener priceChange). */
export function formatSignedPercent(
  value: number | null | undefined,
  locale: Locale = "ru",
): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const s = new Intl.NumberFormat(intl(locale), { maximumFractionDigits: 2 }).format(value);
  return `${value > 0 ? "+" : ""}${s}%`;
}

export function formatAge(
  fromIso: string | null | undefined,
  locale: Locale = "ru",
  now = Date.now(),
): string | null {
  if (!fromIso) return null;
  const t = Date.parse(fromIso);
  if (!Number.isFinite(t)) return null;
  const sec = Math.max(0, Math.round((now - t) / 1000));
  const ru = locale === "ru";
  if (sec < 60) return ru ? `${sec} с` : `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return ru ? `${min} мин` : `${min}m`;
  const h = Math.round(min / 60);
  if (h < 48) return ru ? `${h} ч` : `${h}h`;
  const d = Math.round(h / 24);
  return ru ? `${d} д` : `${d}d`;
}
