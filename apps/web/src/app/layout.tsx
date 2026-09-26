import { pickText } from "@quvr/shared";
import type { Metadata, Viewport } from "next";
import type { Locale } from "@quvr/shared";
import { IBM_Plex_Mono, IBM_Plex_Sans, Unbounded } from "next/font/google";
import Link from "next/link";
import { headers } from "next/headers";
import { Suspense } from "react";
import { YandexMetrika } from "@/components/YandexMetrika";
import { Beacon } from "@/components/Beacon";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { PulseMark } from "@/components/PulseMark";
import { makeT, tx } from "@/lib/i18n";
import { LANDINGS } from "@/lib/landing";
import { OG_LOCALE, siteUrl, X_HANDLE, X_URL } from "@/lib/seo";
import { FollowX } from "@/components/FollowX";
import { getLocale } from "@/lib/server";
import "./globals.css";

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "700"],
  variable: "--font-unbounded",
  display: "swap",
});
const plex = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

const SITE_META: Record<Locale, { title: string; description: string; keywords: string[] }> = {
  en: {
    title: "QUVR Pulse — token scam & rug-pull checker for Robinhood Chain, Base and Solana",
    description:
      "Free memecoin check before you buy: contract, liquidity, holders, creator and possibly related wallets. Robinhood Chain, Base and Solana (pump.fun). No wallet, no sign-up.",
    keywords: [
      "token checker",
      "rug pull checker",
      "scam token check",
      "memecoin scanner",
      "Robinhood Chain",
      "Solana",
      "pump.fun",
      "token holders",
      "honeypot check",
    ],
  },
  ru: {
    title: "QUVR Pulse — проверка токенов на скам: Robinhood Chain, Base и Solana",
    description:
      "Бесплатная проверка мемкоинов перед покупкой: контракт, ликвидность, держатели, создатель и связанные кошельки. Robinhood Chain, Base и Solana (pump.fun). Без кошелька и регистрации.",
    keywords: [
      "проверка токена",
      "проверка на скам",
      "rug pull",
      "мемкоины",
      "Robinhood Chain",
      "Solana",
      "pump.fun",
      "холдеры токена",
      "сканер токенов",
    ],
  },
  de: {
    title: "QUVR Pulse — Token-Check auf Scam & Rug Pull für Robinhood Chain, Base und Solana",
    description:
      "Kostenloser Memecoin-Check vor dem Kauf: Contract, Liquidität, Holder, Creator und möglicherweise verbundene Wallets. Robinhood Chain, Base und Solana (pump.fun). Ohne Wallet, ohne Anmeldung.",
    keywords: [
      "Token prüfen",
      "Scam Check",
      "Rug Pull erkennen",
      "Memecoin Scanner",
      "Robinhood Chain",
      "Solana",
      "pump.fun",
      "Token Holder",
      "Honeypot Check",
    ],
  },
  es: {
    title:
      "QUVR Pulse — verificador de estafas y rug pulls para tokens de Robinhood Chain, Base y Solana",
    description:
      "Revisión gratuita de memecoins antes de comprar: contrato, liquidez, holders, creador y wallets posiblemente vinculadas. Robinhood Chain, Base y Solana (pump.fun). Sin wallet ni registro.",
    keywords: [
      "verificar token",
      "detectar estafa cripto",
      "rug pull",
      "escáner de memecoins",
      "Robinhood Chain",
      "Solana",
      "pump.fun",
      "holders del token",
      "honeypot",
    ],
  },
  zh: {
    title: "QUVR Pulse — Robinhood Chain、Base 与 Solana 代币骗局与跑路检测",
    description:
      "买入前免费检查 Memecoin：合约、流动性、持有人、创建者及可能关联的钱包。支持 Robinhood Chain、Base 与 Solana（pump.fun）。无需钱包，无需注册。",
    keywords: [
      "代币检测",
      "骗局检测",
      "跑路检测",
      "Memecoin 扫描",
      "Robinhood Chain",
      "Solana",
      "pump.fun",
      "代币持有人",
      "貔貅盘检测",
    ],
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const m = SITE_META[locale];
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: m.title, template: "%s | QUVR Pulse" },
    description: m.description,
    applicationName: "QUVR Pulse",
    keywords: m.keywords,
    openGraph: { siteName: "QUVR Pulse", type: "website", locale: OG_LOCALE[locale] },
    twitter: { card: "summary_large_image", site: X_HANDLE },
    robots: { index: true, follow: true },
    formatDetection: { telephone: false, address: false, email: false },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0e0f0d" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Analytics is opt-in per deployment: set YANDEX_METRIKA_ID on the server.
  const metrikaRaw = process.env.YANDEX_METRIKA_ID ?? "";
  const metrikaId = /^\d{5,12}$/.test(metrikaRaw) ? Number(metrikaRaw) : null;
  const t = makeT(locale);
  return (
    <html lang={locale} className={`${unbounded.variable} ${plex.variable} ${plexMono.variable}`}>
      <body>
        <Suspense fallback={null}>
          <Beacon />
        </Suspense>
        {metrikaId && (
          <Suspense fallback={null}>
            <YandexMetrika id={metrikaId} nonce={nonce} />
          </Suspense>
        )}
        <header className="sticky top-0 z-30 border-b border-rule bg-ink/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2" aria-label="QUVR Pulse">
              <PulseMark />
              <span className="font-display text-[0.95rem] font-bold tracking-tight">
                QUVR<span className="text-signal"> Pulse</span>
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-2 sm:order-last sm:ml-0">
              <FollowX
                compact
                label={tx(locale, {
                  ru: "Подписаться",
                  en: "Follow",
                  de: "Folgen",
                  es: "Seguir",
                  zh: "关注",
                })}
              />
              <Suspense fallback={null}>
                <LanguageSwitch locale={locale} />
              </Suspense>
            </div>
            <nav
              className="-mx-2 flex w-full items-center gap-1 text-sm sm:mx-0 sm:ml-auto sm:w-auto"
              aria-label="main"
            >
              {(
                [
                  ["/", t("navHome")],
                  ["/radar", t("navRadar")],
                  ["/watchlist", t("navWatch")],
                ] as const
              ).map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded px-2 py-1 whitespace-nowrap text-muted hover:bg-panel hover:text-paper"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{children}</main>
        <footer className="border-t border-rule">
          <div
            className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-dim"
            data-testid="disclaimer"
          >
            <nav className="mb-3 flex flex-wrap gap-x-4 gap-y-1" aria-label="guides">
              <Link href="/rug-report" className="text-signal hover:underline">
                Rug Report
              </Link>
              <Link href="/oracle" className="text-signal hover:underline">
                Oracle
              </Link>
              <Link href="/about" className="text-signal hover:underline">
                About
              </Link>
              <Link href="/track-record" className="text-signal hover:underline">
                Track record
              </Link>
              <Link href="/learn" className="text-signal hover:underline">
                Learn
              </Link>
              <a
                href={X_URL}
                target="_blank"
                rel="me noopener noreferrer"
                className="text-signal hover:underline"
                data-testid="link-x"
              >
                X {X_HANDLE} ↗
              </a>
              {LANDINGS.map((l) => (
                <Link key={l.slug} href={`/${l.slug}`} className="hover:text-signal">
                  {pickText(l.h1, locale)}
                </Link>
              ))}
            </nav>
            {t("disclaimer")}
          </div>
        </footer>
      </body>
    </html>
  );
}
