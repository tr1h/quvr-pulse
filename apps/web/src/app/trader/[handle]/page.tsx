import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@quvr/db";
import { getProviders } from "@quvr/providers";
import { getAuthorStats, knownWallet, safeDb } from "@quvr/services";
import {
  formatAge,
  formatPct,
  formatUsd,
  shortAddress,
  toChecksum,
  type Locale,
} from "@quvr/shared";
import { makeT, tx } from "@/lib/i18n";
import { getLocale } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Profiles of individual authors are kept out of search engines (robots.txt + noindex).
  return {
    title: `@${decodeURIComponent((await params).handle).slice(0, 32)}`,
    robots: { index: false, follow: false },
  };
}

function fmtDuration(sec: number | null | undefined, locale: Locale): string | null {
  if (sec === null || sec === undefined) return null;
  if (sec < 3600)
    return `${Math.round(sec / 60)} ${tx(locale, { ru: "мин", en: "min", de: "Min.", es: "min", zh: "分钟" })}`;
  if (sec < 172_800)
    return `${(sec / 3600).toFixed(1)} ${tx(locale, { ru: "ч", en: "h", de: "h", es: "h", zh: "小时" })}`;
  return `${(sec / 86_400).toFixed(1)} ${tx(locale, { ru: "д", en: "d", de: "T", es: "d", zh: "天" })}`;
}

export default async function TraderPage({ params }: Props) {
  const handle = decodeURIComponent((await params).handle).replace(/^@/, "");
  if (!/^[A-Za-z0-9_.-]{1,40}$/.test(handle)) notFound();
  const locale = await getLocale();
  const t = makeT(locale);
  const social = getProviders().social;

  if (!social.isEnabled()) {
    return (
      <div className="panel p-6" data-testid="trader-unavailable">
        <h1 className="font-display text-xl font-bold">@{handle}</h1>
        <p className="mt-2 text-sm text-muted">{t("traderOff")}</p>
      </div>
    );
  }

  // Page views never pay for wallet lookups; the worker resolves wallets within a daily budget.
  const [stats, wallet, theses] = await Promise.all([
    getAuthorStats(social, handle, { allowPaid: false, budgetMs: 12_000 }).catch(() => null),
    knownWallet(handle),
    safeDb(
      "trader:theses",
      () =>
        getDb().thesis.findMany({
          where: { trader: { handle: { equals: handle, mode: "insensitive" } } },
          orderBy: { publishedAt: "desc" },
          take: 50,
          include: { token: { select: { symbol: true } } },
        }),
      [],
    ),
  ]);

  const row = (label: string, value: React.ReactNode) => (
    <div>
      <div className="label mb-1">{label}</div>
      <div className="num">{value ?? t("noData")}</div>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="trader-page">
      <header>
        <div className="label mb-1">
          {t("traderTitle")} ·{" "}
          {stats?.source ??
            tx(locale, {
              ru: "нет данных о сделках",
              en: "no trade data",
              de: "keine Handelsdaten",
              es: "sin datos de operaciones",
              zh: "暂无交易数据",
            })}
        </div>
        <h1 className="font-display text-2xl font-bold">@{handle}</h1>
      </header>
      <section className="panel grid grid-cols-2 gap-4 p-4 text-sm sm:grid-cols-4">
        {row(
          t("wallets"),
          wallet.wallet ? (
            <a
              href={`https://robinhoodchain.blockscout.com/address/${wallet.wallet}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="hover:text-signal"
              title={toChecksum(wallet.wallet)}
            >
              {shortAddress(toChecksum(wallet.wallet))}
            </a>
          ) : wallet.checkedAt ? (
            tx(locale, {
              ru: "EVM-кошелёк не указан",
              en: "no EVM wallet reported",
              de: "keine EVM-Wallet angegeben",
              es: "sin wallet EVM declarada",
              zh: "未提供 EVM 钱包",
            })
          ) : (
            tx(locale, {
              ru: "ещё не запрошен",
              en: "not looked up yet",
              de: "noch nicht abgefragt",
              es: "aún no consultado",
              zh: "尚未查询",
            })
          ),
        )}
        {row(
          t("sample"),
          stats ? `${stats.closedTrades} (${t(`conf_${stats.qualityConfidence}`)})` : null,
        )}
        {row(t("pnl"), formatUsd(stats?.realizedPnlUsd ?? null, locale))}
        {row(t("medianRoi"), formatPct(stats?.medianRoi ?? null, locale))}
        {row(
          t("winRate"),
          stats?.winRate !== null && stats?.winRate !== undefined
            ? `${formatPct(stats.winRate, locale)} (≥ ${formatPct(stats.winRateWilsonLower, locale) ?? "—"})`
            : null,
        )}
        {row(t("maxDd"), formatUsd(stats?.maxDrawdownUsd ?? null, locale))}
        {row(
          tx(locale, {
            ru: "Доля лучшей сделки",
            en: "Best trade share",
            de: "Anteil des besten Trades",
            es: "Peso de la mejor operación",
            zh: "最佳交易占比",
          }),
          formatPct(stats?.bestTradeShare ?? null, locale),
        )}
        {row(
          tx(locale, {
            ru: "Среднее удержание",
            en: "Average hold",
            de: "Durchschn. Haltedauer",
            es: "Tenencia media",
            zh: "平均持有时长",
          }),
          fmtDuration(stats?.avgHoldSeconds, locale),
        )}
        {row(
          tx(locale, {
            ru: "Продаёт после тезиса через",
            en: "Sells after a thesis in",
            de: "Verkauft nach einer These in",
            es: "Vende tras una tesis en",
            zh: "发布观点后卖出用时",
          }),
          fmtDuration(stats?.medianSellAfterThesisSec, locale),
        )}
        {row(
          tx(locale, {
            ru: "Открытых позиций",
            en: "Open positions",
            de: "Offene Positionen",
            es: "Posiciones abiertas",
            zh: "未平仓头寸",
          }),
          stats?.openPositions ?? null,
        )}
        {row(
          tx(locale, {
            ru: "Исключено сделок",
            en: "Excluded trades",
            de: "Ausgeschlossene Trades",
            es: "Operaciones excluidas",
            zh: "已排除交易",
          }),
          stats?.excludedTrades ?? null,
        )}
        {row(
          tx(locale, {
            ru: "Рейтинг качества",
            en: "Quality score",
            de: "Qualitätswert",
            es: "Puntuación de calidad",
            zh: "质量评分",
          }),
          stats ? (
            <span className="text-signal">
              {stats.qualityScore ?? "—"} · {stats.qualityTier}
            </span>
          ) : null,
        )}
      </section>
      <p className="text-xs text-dim">
        {tx(locale, {
          ru: "Сделки восстановлены по блокчейну Robinhood Chain: переводы токенов кошелька, оценённые по цене свопа в пуле токена. Переводы без свопа (аирдропы, перемещения, bonding curve) исключены. Суммы в USD — по текущему курсу котировки.",
          en: "Trades are reconstructed from Robinhood Chain: the wallet's token transfers priced by the swap in the token's pool. Transfers without a swap (airdrops, moves, bonding curve) are excluded. USD values use the current quote price.",
          de: "Trades werden aus der Robinhood Chain rekonstruiert: Token-Transfers der Wallet, bewertet mit dem Swap im Pool des Tokens. Transfers ohne Swap (Airdrops, Umbuchungen, Bonding Curve) sind ausgenommen. USD-Werte zum aktuellen Kurs.",
          es: "Las operaciones se reconstruyen desde Robinhood Chain: transferencias de tokens de la wallet valoradas por el swap en el pool del token. Se excluyen transferencias sin swap (airdrops, movimientos, bonding curve). Valores en USD al precio actual.",
          zh: "交易根据 Robinhood Chain 链上数据重建：以代币池中的兑换价格为钱包的代币转账定价。不含兑换的转账（空投、转移、bonding curve）已排除。美元价值按当前报价计算。",
        })}
      </p>
      <section className="panel p-4">
        <h2 className="mb-3 font-display text-base font-medium">{t("theses")}</h2>
        {theses.length === 0 ? (
          <p className="text-sm text-muted">{t("noData")}</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {theses.map((th) => (
              <li key={th.id} className="border-t border-rule/60 pt-2">
                <div className="flex gap-2">
                  <Link
                    href={`/token/${th.tokenAddress}`}
                    className="font-mono text-xs text-signal"
                  >
                    {th.token.symbol ?? shortAddress(th.tokenAddress)}
                  </Link>
                  <span className="num ml-auto text-xs text-dim">
                    {formatAge(th.publishedAt.toISOString(), locale)}
                  </span>
                </div>
                <p className="mt-1 text-paper/85">{th.text}</p>
                <p className="mt-1 font-mono text-[0.65rem] text-dim">
                  24h: {th.outcome24h === null ? t("pending") : formatPct(th.outcome24h, locale, 1)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-dim">
        {tx(locale, {
          ru: "Открытые позиции не раскрываются поимённо: источник не подтверждает разрешение на их показ.",
          en: "Open positions are not listed individually: the source does not confirm permission to display them.",
          de: "Offene Positionen werden nicht einzeln aufgeführt: Die Quelle bestätigt keine Erlaubnis zur Anzeige.",
          es: "Las posiciones abiertas no se listan individualmente: la fuente no confirma el permiso para mostrarlas.",
          zh: "未平仓头寸不逐项列出：数据源未确认允许展示。",
        })}
      </p>
    </div>
  );
}
