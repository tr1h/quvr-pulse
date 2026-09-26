"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { isLocale, LOCALES, type Locale } from "@quvr/shared";

const NAMES: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
  de: "Deutsch",
  es: "Español",
  zh: "中文",
};

export function LanguageSwitch({ locale }: { locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (l: string) => {
    if (!isLocale(l)) return;
    document.cookie = `qp_lang=${l}; path=/; max-age=31536000; samesite=lax`;
    // Drop ?lang= so the chosen cookie language applies; otherwise just re-render.
    if (params.has("lang")) {
      const rest = new URLSearchParams(params);
      rest.delete("lang");
      const q = rest.toString();
      start(() => router.replace(q ? `${pathname}?${q}` : pathname));
    } else start(() => router.refresh());
  };
  return (
    <label className="relative flex items-center rounded border border-rule text-xs">
      <span className="sr-only">Language</span>
      <select
        aria-label="Language"
        data-testid="language-select"
        value={locale}
        disabled={pending}
        onChange={(e) => set(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent py-1 pl-2 pr-6 font-mono uppercase text-paper outline-none focus-visible:ring-1 focus-visible:ring-signal"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} className="bg-ink normal-case text-paper">
            {l.toUpperCase()} · {NAMES[l]}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute right-2 text-signal">
        ▾
      </span>
    </label>
  );
}
