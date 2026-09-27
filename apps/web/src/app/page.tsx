import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import {
  discoverNewTokens,
  getRugReport,
  getPublicStats,
  getTrackRecord,
  recentFindings,
  trendingOnFomo,
} from "@quvr/services";
import {
  formatAge,
  formatPct,
  formatUsd,
  shortAddress,
  type LocalizedText,
  pickText,
  type Locale,
} from "@quvr/shared";
import { AddressForm } from "@/components/AddressForm";
import { JsonLd } from "@/components/JsonLd";
import { lt, makeT, tx } from "@/lib/i18n";
import { getLocale } from "@/lib/server";
import { LANDINGS } from "@/lib/landing";
import { hreflangs, localizedPath, pageMetadata, siteUrl, X_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

const SEV_COLOR: Record<string, string> = {
  critical: "text-risk-critical",
  high: "text-risk-high",
  medium: "text-risk-elevated",
  low: "text-muted",
  info: "text-dim",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const meta = pageMetadata({
    path: "/",
    locale,
    absoluteTitle: true,
    title: tx(locale, {
      ru: "QUVR Pulse — проверка токенов на скам: Robinhood Chain, Base и Solana",
      en: "QUVR Pulse — token scam & rug-pull checker for Robinhood Chain, Base and Solana",
      de: "QUVR Pulse — Token-Check auf Scam & Rug Pull für Robinhood Chain, Base und Solana",
      es: "QUVR Pulse — verificador de estafas y rug pulls para tokens de Robinhood Chain, Base y Solana",
      zh: "QUVR Pulse — Robinhood Chain、Base 与 Solana 代币骗局与跑路检测",
    }),
    description: tx(locale, {
      ru: "Бесплатная проверка мемкоинов перед покупкой: контракт, ликвидность, держатели, создатель и связанные кошельки. Robinhood Chain, Base и Solana (pump.fun). Без кошелька и регистрации.",
      en: "Free memecoin check before you buy: contract, liquidity, holders, creator and possibly related wallets. Robinhood Chain, Base and Solana (pump.fun). No wallet, no sign-up.",
      de: "Kostenloser Memecoin-Check vor dem Kauf: Contract, Liquidität, Holder, Creator und möglicherweise verbundene Wallets. Robinhood Chain, Base und Solana (pump.fun). Ohne Wallet, ohne Anmeldung.",
      es: "Revisión gratuita de memecoins antes de comprar: contrato, liquidez, holders, creador y wallets posiblemente vinculadas. Robinhood Chain, Base y Solana (pump.fun). Sin wallet ni registro.",
      zh: "买入前免费检查 Memecoin：合约、流动性、持有人、创建者及可能关联的钱包。支持 Robinhood Chain、Base 与 Solana（pump.fun）。无需钱包，无需注册。",
    }),
  });
  // Next strips the query from root canonical/alternate URLs; <HomeAlternates> renders them instead.
  return { ...meta, alternates: undefined };
}

/** React 19 hoists these <link> tags into <head>. */
function HomeAlternates({ locale }: { locale: Locale }) {
  const base = siteUrl();
  return (
    <>
      <link rel="canonical" href={`${base}${localizedPath("/", locale)}`} />
      {Object.entries(hreflangs("/")).map(([lang, href]) => (
        <link
          key={lang}
          rel="alternate"
          hrefLang={lang}
          href={lang === "x-default" || lang === "en" ? `${base}/` : href}
        />
      ))}
    </>
  );
}

export default async function Home() {
  const locale = await getLocale();
  const t = makeT(locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const base = siteUrl();
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "QUVR Pulse",
      sameAs: [X_URL],
      alternateName: ["QUVR", "Quiver Pulse"],
      url: base,
      inLanguage: ["en", "ru", "de", "es", "zh"],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "QUVR Pulse",
      url: base,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description:
        "Independent read-only risk scanner for Robinhood Chain, Base and Solana tokens: contract, liquidity, holders, creator and possibly related wallets.",
    },
  ];
  const [trendingR, newR, findings, rug, track, stats] = await Promise.all([
    trendingOnFomo().catch(() => undefined),
    discoverNewTokens().catch(() => null),
    recentFindings(8),
    getRugReport().catch(() => null),
    getTrackRecord("robinhood").catch(() => null),
    getPublicStats().catch(() => null),
  ]);
  const rhWeek = rug?.byChain["Robinhood Chain"] ?? null;

  return (
    <div className="space-y-10">
      <HomeAlternates locale={locale} />
      <JsonLd data={ld} nonce={nonce} />
      <section className="relative pt-4 sm:pt-10">
        <div className="label mb-4 flex items-center gap-2">
          <span className="blink h-1.5 w-1.5 rounded-full bg-signal" /> Robinhood Chain · Base ·
          Solana · read-only
        </div>
        <h1 className="max-w-3xl font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
          {t("heroTitle")}
        </h1>
        <p className="mt-3 font-display text-base text-signal sm:text-lg" data-testid="tagline">
          {t("tagline")}
        </p>
        <p className="mt-4 max-w-2xl text-muted sm:text-lg">{t("heroSub")}</p>
        {stats && stats.tokensAnalyzed > 0 && (
          <p
            className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted"
            data-testid="live-counters"
          >
            <span>
              <b className="text-signal">{stats.tokensAnalyzed.toLocaleString("en-US")}</b>{" "}
              {tx(locale, {
                ru: "токенов проанализировано",
                en: "tokens analyzed",
                de: "Tokens analysiert",
                es: "tokens analizados",
                zh: "个代币已分析",
              })}
            </span>
            <span>
              <b className="text-paper">{stats.newTokens24h.toLocaleString("en-US")}</b>{" "}
              {tx(locale, {
                ru: "новых за 24 ч",
                en: "new in 24h",
                de: "neu in 24 Std.",
                es: "nuevos en 24 h",
                zh: "24 小时新增",
              })}
            </span>
            {stats.track?.headline && (
              <Link href="/track-record?chain=robinhood" className="hover:text-signal">
                <b style={{ color: "var(--color-risk-high)" }}>
                  {formatPct(stats.track.headline.high, locale, 0)}
                </b>{" "}
                {tx(locale, {
                  ru: "«высокого риска» исчезли за 24 ч →",
                  en: "of “high risk” gone within 24h →",
                  de: "von „hohem Risiko“ binnen 24 Std. weg →",
                  es: "de «alto riesgo» desaparecieron en 24 h →",
                  zh: "“高风险”在 24 小时内消失 →",
                })}
              </Link>
            )}
          </p>
        )}
        <p className="mt-3 max-w-2xl text-xs text-dim" data-testid="pronunciation">
          {t("pronunciation")}
        </p>
        <div className="mt-8 max-w-3xl">
          <AddressForm
            placeholder={t("inputPlaceholder")}
            cta={t("scan")}
            invalid={t("invalidAddress")}
            solana={t("solanaNotSupported")}
          />
          <p className="mt-3 font-mono text-xs text-dim">
            {tx(locale, {
              ru: "Пример: ",
              en: "Example: ",
              de: "Beispiel: ",
              es: "Ejemplo: ",
              zh: "示例：",
            })}
            <Link
              href="/token/0x4b7d1e5ec6889e63e70d39561edf925095dbed88"
              className="text-muted underline decoration-dotted hover:text-signal"
            >
              0x4b7d1e5e…dbed88
            </Link>
          </p>
        </div>
      </section>

      <section
        className="panel grid gap-5 p-4 sm:grid-cols-3 sm:p-6"
        aria-labelledby="rh-h"
        data-testid="robinhood-block"
      >
        <div className="sm:col-span-3">
          <h2 id="rh-h" className="font-display text-lg font-medium">
            {tx(locale, {
              ru: "Сделано для Robinhood Chain",
              en: "Built for Robinhood Chain",
              de: "Gebaut für Robinhood Chain",
              es: "Hecho para Robinhood Chain",
              zh: "为 Robinhood Chain 打造",
            })}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {tx(locale, {
              ru: "Полная проверка с первого блока: история переводов, держатели, связанные кошельки, симуляция продажи. Base и Solana — тоже.",
              en: "A full check from the first block: transfer history, holders, possibly related wallets, sell simulation. Base and Solana too.",
              de: "Vollständiger Check ab dem ersten Block: Transfer-Historie, Holder, möglicherweise verbundene Wallets, Verkaufssimulation. Base und Solana ebenfalls.",
              es: "Revisión completa desde el primer bloque: historial de transferencias, holders, wallets posiblemente vinculadas, simulación de venta. También Base y Solana.",
              zh: "从第一个区块开始的完整检查：转账历史、持有人、可能关联的钱包、卖出模拟。也支持 Base 和 Solana。",
            })}
          </p>
        </div>
        <div>
          <div className="font-display text-4xl font-bold text-signal" data-testid="rh-week">
            {rhWeek ?? "—"}
          </div>
          <div className="label mt-1">
            {tx(locale, {
              ru: "токенов Robinhood Chain проверено за 7 дней",
              en: "Robinhood Chain tokens checked in 7 days",
              de: "Robinhood-Chain-Tokens in 7 Tagen geprüft",
              es: "tokens de Robinhood Chain revisados en 7 días",
              zh: "7 天内检查的 Robinhood Chain 代币",
            })}
          </div>
        </div>
        <div>
          {track?.headline ? (
            <>
              <div
                className="font-display text-4xl font-bold"
                style={{ color: "var(--color-risk-high)" }}
              >
                {formatPct(track.headline.high, locale, 0)}
              </div>
              <div className="label mt-1">
                {tx(locale, {
                  ru: "токенов с высоким риском исчезли или упали на 90% за 24 часа",
                  en: "of high-risk tokens gone or down 90% within 24 hours",
                  de: "der Tokens mit hohem Risiko binnen 24 Stunden weg oder −90 %",
                  es: "de los tokens de alto riesgo desaparecieron o cayeron un 90 % en 24 horas",
                  zh: "的高风险代币在 24 小时内消失或下跌 90%",
                })}{" "}
                ({t(`lvl_${track.headline.otherLevel}`)}:{" "}
                {formatPct(track.headline.other, locale, 0)})
              </div>
            </>
          ) : (
            <>
              <div className="font-display text-4xl font-bold text-signal">
                {track?.tracked ?? "—"}
              </div>
              <div className="label mt-1">
                {tx(locale, {
                  ru: "токенов под наблюдением: проверяем, что с ними стало через 1 ч, 24 ч и 7 дней",
                  en: "tokens tracked: we check what happened after 1h, 24h and 7 days",
                  de: "Tokens verfolgt: Wir prüfen, was nach 1 Std., 24 Std. und 7 Tagen geschah",
                  es: "tokens seguidos: comprobamos qué pasó tras 1 h, 24 h y 7 días",
                  zh: "个代币在跟踪中：查看 1 小时、24 小时和 7 天后的结局",
                })}
              </div>
            </>
          )}
        </div>
        <nav className="flex flex-col gap-2 text-sm" aria-label="proof">
          <Link href="/oracle" className="text-signal hover:underline">
            {tx(locale, {
              ru: "Risk Oracle — оценки в блокчейне →",
              en: "Risk Oracle — on-chain labels →",
              de: "Risk Oracle — On-chain-Urteile →",
              es: "Risk Oracle — etiquetas on-chain →",
              zh: "Risk Oracle — 链上风险标签 →",
            })}
          </Link>
          <Link href="/track-record?chain=robinhood" className="text-signal hover:underline">
            {tx(locale, {
              ru: "Точность оценок →",
              en: "Track record →",
              de: "Trefferquote →",
              es: "Historial →",
              zh: "准确度记录 →",
            })}
          </Link>
          <Link href="/rug-report" className="text-muted hover:text-signal">
            Rug Report →
          </Link>
          <Link href="/methodology" className="text-muted hover:text-signal">
            {tx(locale, {
              ru: "Как мы считаем →",
              en: "How we score →",
              de: "So bewerten wir →",
              es: "Cómo puntuamos →",
              zh: "评分方法 →",
            })}
          </Link>
        </nav>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-4" aria-labelledby="trend-h">
          <h2 id="trend-h" className="font-display text-base font-medium">
            {t("trending")}
          </h2>
          {trendingR === null || trendingR === undefined ? (
            <p className="mt-3 text-sm text-muted" data-testid="social-unavailable">
              {trendingR === null ? t("trendingOff") : t("noData")}
            </p>
          ) : (
            <ol className="mt-3 divide-y divide-rule/60">
              {trendingR.value.slice(0, 10).map((x) => (
                <li key={x.address} className="flex items-center gap-3 py-2 text-sm">
                  <span className="num w-6 text-dim">{x.rank}</span>
                  <Link
                    href={`/token/${x.address}`}
                    className="min-w-0 flex-1 truncate hover:text-signal"
                  >
                    <span className="font-medium">{x.symbol ?? shortAddress(x.address)}</span>{" "}
                    <span className="text-dim">{x.name}</span>
                  </Link>
                  <span className="num text-muted">
                    {formatUsd(x.marketCapUsd, locale) ?? t("noData")}
                  </span>
                </li>
              ))}
              <li className="pt-2 font-mono text-[0.62rem] text-dim">
                fomoapi · {formatAge(trendingR.fetchedAt, locale)}{" "}
                {trendingR.isStale ? `· ${t("stale")}` : ""}
              </li>
            </ol>
          )}
        </section>

        <section className="panel p-4" aria-labelledby="new-h">
          <h2 id="new-h" className="font-display text-base font-medium">
            {t("newTokens")}
          </h2>
          <p className="mt-1 text-xs text-dim">{t("newTokensSub")}</p>
          {!newR ? (
            <p className="mt-3 text-sm text-muted">{t("noData")}</p>
          ) : newR.value.length === 0 ? (
            <p className="mt-3 text-sm text-muted">—</p>
          ) : (
            <ul className="mt-3 divide-y divide-rule/60">
              {newR.value.slice(0, 10).map((x) => (
                <li key={x.poolId} className="flex items-center gap-3 py-2 text-sm">
                  <Link
                    href={`/token/${x.address}`}
                    className="min-w-0 flex-1 truncate hover:text-signal"
                  >
                    <span className="font-medium">{x.symbol ?? shortAddress(x.address)}</span>{" "}
                    <span className="text-dim">{x.name ?? ""}</span>
                  </Link>
                  <span className="num text-xs text-muted">
                    {x.liquidityUsd !== null ? formatUsd(x.liquidityUsd, locale) : t("noData")}
                  </span>
                  <span className="num w-14 text-right text-xs text-dim">
                    {formatAge(x.createdAt, locale)}
                  </span>
                </li>
              ))}
              <li className="pt-2 font-mono text-[0.62rem] text-dim">
                rpc Initialize + dexscreener · {formatAge(newR.fetchedAt, locale)}
              </li>
            </ul>
          )}
        </section>

        <section className="panel p-4 lg:col-span-2" aria-labelledby="warn-h">
          <h2 id="warn-h" className="font-display text-base font-medium">
            {t("latestWarnings")}
          </h2>
          {findings.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("noWarnings")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-rule/60">
              {findings.map((f) => (
                <li key={String(f.id)} className="flex items-start gap-3 py-2 text-sm">
                  <span className={`font-mono text-[0.65rem] uppercase ${SEV_COLOR[f.severity]}`}>
                    {f.severity}
                  </span>
                  <Link
                    href={`/token/${f.tokenAddress}`}
                    className="min-w-0 flex-1 hover:text-signal"
                  >
                    <span className="font-medium">
                      {f.token.symbol ?? shortAddress(f.tokenAddress)}
                    </span>{" "}
                    — {lt(locale, f.title as LocalizedText)}
                  </Link>
                  <span className="num text-xs text-dim">
                    {formatAge(f.lastSeenAt.toISOString(), locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Link
        href="/rug-report"
        className="panel flex flex-wrap items-center justify-between gap-3 border-signal/40 p-4 hover:border-signal"
        data-testid="rug-report-link"
      >
        <span>
          <span className="font-display text-lg font-bold">
            Rug <span className="text-signal">Report</span>
          </span>
          <span className="block text-sm text-muted">
            {tx(locale, {
              ru: "Сколько новых токенов за неделю с опасным контрактом, тонкой ликвидностью и продажами создателя",
              en: "How many new tokens this week have risky contracts, thin liquidity and creator sells",
              de: "Wie viele neue Tokens diese Woche riskante Contracts, dünne Liquidität und Creator-Verkäufe haben",
              es: "Cuántos tokens nuevos esta semana tienen contratos de riesgo, liquidez escasa y ventas del creador",
              zh: "本周有多少新代币存在高风险合约、流动性薄弱和创建者卖出",
            })}
          </span>
        </span>
        <span className="font-mono text-sm text-signal">→</span>
      </Link>

      <section aria-labelledby="guides" data-testid="guides">
        <h2 id="guides" className="label mb-3">
          {tx(locale, { ru: "Гайды", en: "Guides", de: "Ratgeber", es: "Guías", zh: "指南" })}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/learn" className="panel block p-4 hover:border-signal">
            <span className="font-display text-sm font-medium">
              {tx(locale, {
                ru: "Словарь рисков",
                en: "Risk glossary",
                de: "Risikolexikon",
                es: "Glosario de riesgos",
                zh: "风险术语",
              })}
            </span>
            <span className="mt-1 line-clamp-3 block text-xs text-muted">
              {tx(locale, {
                ru: "Mint и freeze authority, honeypot, rug pull, бондинг-кривая, проскальзывание — простыми словами.",
                en: "Mint and freeze authority, honeypots, rug pulls, bonding curves, price impact — in plain words.",
                de: "Mint- und Freeze Authority, Honeypots, Rug Pulls, Bonding Curves, Price Impact — einfach erklärt.",
                es: "Mint y freeze authority, honeypots, rug pulls, bonding curves, price impact, en palabras sencillas.",
                zh: "增发与冻结权限、貔貅盘、跑路、联合曲线、价格影响——通俗易懂。",
              })}
            </span>
          </Link>
          {LANDINGS.map((l) => (
            <Link key={l.slug} href={`/${l.slug}`} className="panel block p-4 hover:border-signal">
              <span className="font-display text-sm font-medium">{pickText(l.h1, locale)}</span>
              <span className="mt-1 line-clamp-3 block text-xs text-muted">
                {pickText(l.description, locale)}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
