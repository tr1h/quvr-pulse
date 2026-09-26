import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTokenReport, isWatched } from "@quvr/services";
import {
  tokenRefSchema,
  formatAge,
  formatSignedPercent,
  formatSmallPrice,
  formatUsd,
  type Locale,
  type TokenReport,
} from "@quvr/shared";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CopyButton } from "@/components/CopyButton";
import { ScoreCard } from "@/components/ScoreCard";
import { Sourced, Stat } from "@/components/Sourced";
import {
  Charts,
  ContractPanel,
  DeployerPanel,
  DistributionPanel,
  Findings,
  LiquidityPanel,
  SocialPanel,
  TimelinePanel,
} from "@/components/TokenSections";
import { WatchButton } from "@/components/WatchButton";
import { ShareOnX } from "@/components/ShareOnX";
import { FollowX } from "@/components/FollowX";
import { FRAMES, PricePanel } from "@/components/PricePanel";
import { VerdictCard } from "@/components/VerdictCard";
import { OnChainBadge } from "@/components/OnChainBadge";
import { TickerClones } from "@/components/TickerClones";
import { TradeLinks } from "@/components/TradeLinks";
import { makeT, tx } from "@/lib/i18n";
import { getLocale, getOwnerId, isCrawler } from "@/lib/server";
import { pageMetadata, siteUrl } from "@/lib/seo";
import { riskVerdict, shareText } from "@quvr/scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ tf?: string; chart?: string }>;
};

function tokenTitle(locale: Locale, label: string, chain: string): string {
  const t: Record<Locale, string> = {
    en: `${label}: scam & rug-pull check — ${chain}`,
    ru: `${label}: проверка на скам и риски — ${chain}`,
    de: `${label}: Scam- & Rug-Pull-Check — ${chain}`,
    es: `${label}: revisión de estafa y rug pull — ${chain}`,
    zh: `${label}：骗局与跑路风险检测 — ${chain}`,
  };
  return t[locale];
}

function tokenDescription(
  locale: Locale,
  label: string,
  chain: string,
  level: string | null,
  scores: string | null,
): string {
  const t: Record<Locale, string> = {
    en: `${label} on ${chain}: ${level ?? "report"}. Contract, liquidity, holders, creator and possibly related wallets${scores ? ` (scores ${scores})` : ""}. Free, no wallet.`,
    ru: `${label} на ${chain}: ${level ?? "отчёт"}. Контракт, ликвидность, держатели, создатель и возможно связанные кошельки${scores ? ` (оценки ${scores})` : ""}. Бесплатно, без кошелька.`,
    de: `${label} auf ${chain}: ${level ?? "Bericht"}. Contract, Liquidität, Holder, Creator und möglicherweise verbundene Wallets${scores ? ` (Bewertungen ${scores})` : ""}. Kostenlos, ohne Wallet.`,
    es: `${label} en ${chain}: ${level ?? "informe"}. Contrato, liquidez, holders, creador y wallets posiblemente vinculadas${scores ? ` (puntuaciones ${scores})` : ""}. Gratis, sin wallet.`,
    zh: `${chain} 上的 ${label}：${level ?? "报告"}。合约、流动性、持有人、创建者及可能关联的钱包${scores ? `（评分 ${scores}）` : ""}。免费，无需钱包。`,
  };
  return t[locale];
}

/** One report per request for both metadata and page (the scan itself is cached/deduplicated). */
const loadReport = cache(async (address: string) =>
  getTokenReport(address, { crawler: await isCrawler() }),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const parsed = tokenRefSchema.safeParse(decodeURIComponent((await params).address));
  if (!parsed.success) return { title: "Not found", robots: { index: false } };
  const locale = await getLocale();
  let r: TokenReport | null = null;
  try {
    r = (await loadReport(parsed.data.address)).report;
  } catch {
    r = null;
  }
  const sym = r?.token.symbol.value ? `$${r.token.symbol.value}` : null;
  const name = r?.token.name.value ?? parsed.data.address.slice(0, 10);
  const label = sym ? `${name} (${sym})` : name;
  const chain = r?.chainName ?? (parsed.data.chain === "solana" ? "Solana" : "Robinhood Chain");
  const levelText = r
    ? makeT(locale)(
        `lvl_${riskVerdict({ scores: r.scores, findings: r.findings, priceChange24h: null, buys24h: null, sells24h: null, liquidityUsd: null, marketCapUsd: null, volume24hUsd: null }).level}`,
      )
    : null;
  const scores = r
    ? (["contractSafety", "liquidityHealth", "distributionHealth"] as const)
        .map((k) => r!.scores[k].value)
        .map((v) => (v === null ? "—" : String(v)))
        .join("/")
    : null;
  return pageMetadata({
    path: `/token/${parsed.data.address}`,
    locale,
    title: tokenTitle(locale, label, chain),
    description: tokenDescription(locale, label, chain, levelText, scores),
  });
}

function hasStale(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  if ("isStale" in v && (v as { isStale: unknown }).isStale === true) return true;
  return Object.values(v).some(
    (x) => x && typeof x === "object" && !Array.isArray(x) && hasStale(x),
  );
}

export default async function TokenPage({ params, searchParams }: Props) {
  const { address: raw } = await params;
  const sp = await searchParams;
  const frame = FRAMES.find((f) => f === sp.tf) ?? "1d";
  const chartMode = sp.chart === "simple" ? "simple" : "pro";
  const parsed = tokenRefSchema.safeParse(decodeURIComponent(raw));
  if (!parsed.success) notFound();
  const address = parsed.data.address;
  const isSolana = parsed.data.chain === "solana";
  const locale = await getLocale();
  const t = makeT(locale);
  const owner = await getOwnerId();
  const crawler = await isCrawler();

  const [{ report: r, servedFrom }, watched] = await Promise.all([
    loadReport(address),
    owner ? isWatched("web", owner, address) : Promise.resolve(false),
  ]);
  const explorer = r.links.blockscout.split("/token/")[0]!;
  const anyStale =
    servedFrom === "database" ||
    hasStale(r.market) ||
    hasStale(r.distribution) ||
    hasStale(r.contract);
  const loadingHistory = (r.distribution.holdersCount.error ?? "").includes(
    "loading in the background",
  );

  return (
    <div className="space-y-6" data-testid="token-report">
      <header className="rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="label mb-2 flex flex-wrap items-center gap-2">
            <span
              className="rounded-sm border border-signal/60 px-1.5 py-0.5 text-signal"
              data-testid="chain-badge"
            >
              {r.chainName}
              {isSolana ? "" : ` · ${r.chainId}`}
            </span>
            <span>{r.mode}</span>
          </div>
          <h1
            className="font-display text-2xl font-bold leading-tight sm:text-4xl"
            data-testid="token-title"
          >
            {r.token.name.value ?? t("noData")}{" "}
            <span className="text-signal">
              {r.token.symbol.value ? `$${r.token.symbol.value}` : ""}
            </span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code
              className="num break-all text-xs text-muted sm:text-sm"
              data-testid="token-address"
            >
              {r.checksumAddress}
            </code>
            <CopyButton value={r.checksumAddress} label={t("copy")} done={t("copied")} />
          </div>
          <nav className="mt-3 flex flex-wrap gap-3 text-sm" aria-label={t("links")}>
            <a
              href={r.links.blockscout}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-muted underline decoration-dotted hover:text-signal"
              data-testid="link-blockscout"
            >
              {isSolana ? "Solscan ↗" : "Blockscout ↗"}
            </a>
            {r.links.dexscreener && (
              <a
                href={r.links.dexscreener}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-muted underline decoration-dotted hover:text-signal"
                data-testid="link-dexscreener"
              >
                Dexscreener ↗
              </a>
            )}
            {r.links.fomo && (
              <a
                href={r.links.fomo}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-muted underline decoration-dotted hover:text-signal"
              >
                Fomo ↗
              </a>
            )}
            {(r.links.external.value ?? []).map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="text-dim hover:text-signal"
              >
                {l.label} ↗
              </a>
            ))}
          </nav>
          <TradeLinks r={r} locale={locale} />
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <WatchButton
            address={address}
            initial={watched}
            labels={{ watch: t("watch"), unwatch: t("unwatch"), failed: t("watchFailed") }}
          />
          <ShareOnX
            text={shareText(r, `${siteUrl()}/token/${r.address}`)}
            labels={{
              share: tx(locale, {
                ru: "Поделиться в X",
                en: "Post on X",
                de: "Auf X teilen",
                es: "Compartir en X",
                zh: "分享到 X",
              }),
              copy: tx(locale, {
                ru: "Скопировать пост",
                en: "Copy post",
                de: "Post kopieren",
                es: "Copiar post",
                zh: "复制帖子",
              }),
              copied: t("copied"),
            }}
          />
          <FollowX
            label={tx(locale, {
              ru: "Разборы скамов в X — подписаться",
              en: "Rug autopsies on X — follow",
              de: "Rug-Analysen auf X — folgen",
              es: "Análisis de rugs en X — seguir",
              zh: "在 X 上关注跑路分析",
            })}
          />
          <AutoRefresh seconds={servedFrom === "quick" ? 6 : 20} label={t("autoRefresh")} />
          <span className="font-mono text-[0.65rem] text-dim">
            {t("generated")} {formatAge(r.generatedAt, locale)} {t("ago")} · block{" "}
            {r.blockNumber.value ?? "—"}
          </span>
        </div>
      </header>

      <VerdictCard r={r} locale={locale} />
      <Suspense fallback={null}>
        <OnChainBadge r={r} locale={locale} />
      </Suspense>
      {/* Search-engine bots skip the live ticker lookup (it calls Dexscreener search). */}
      {!crawler && (
        <Suspense fallback={null}>
          <TickerClones r={r} locale={locale} />
        </Suspense>
      )}

      {anyStale && (
        <p className="rounded border border-risk-elevated/50 bg-risk-elevated/10 px-3 py-2 text-sm text-risk-elevated">
          {t("servedStale")}
        </p>
      )}
      {loadingHistory && (
        <p
          className="rounded border border-signal/40 bg-signal/5 px-3 py-2 text-sm text-signal"
          data-testid="history-loading"
        >
          {tx(locale, {
            ru: "⏳ Держатели, создатель, связанные кошельки и симуляция продажи догружаются в фоне — обычно от нескольких секунд до пары минут, отчёт обновится сам.",
            en: "⏳ Holders, creator, related wallets and the sell simulation are loading in the background — usually a few seconds to a couple of minutes; the report updates itself.",
            de: "⏳ Holder, Creator, verbundene Wallets und die Verkaufssimulation laden im Hintergrund — meist wenige Sekunden bis ein paar Minuten; der Bericht aktualisiert sich selbst.",
            es: "⏳ Holders, creador, wallets vinculadas y la simulación de venta se cargan en segundo plano: suele tardar de unos segundos a un par de minutos; el informe se actualiza solo.",
            zh: "⏳ 持有人、创建者、关联钱包和卖出模拟正在后台加载——通常需要几秒到几分钟，报告会自动更新。",
          })}
        </p>
      )}

      <section
        className="panel rise grid grid-cols-2 gap-4 p-4 sm:grid-cols-4"
        data-testid="market-stats"
        style={{ animationDelay: "60ms" }}
      >
        <Stat label={t("price")}>
          <Sourced
            v={r.market.priceUsd}
            locale={locale}
            format={(v) => formatSmallPrice(v, locale)}
            testId="stat-price"
          />
          <Change r={r} />
        </Stat>
        <Stat label={t("marketCap")}>
          <Sourced
            v={r.market.marketCapUsd}
            locale={locale}
            format={(v) => formatUsd(v, locale)}
            testId="stat-mcap"
          />
        </Stat>
        <Stat label={t("liquidity")}>
          <Sourced
            v={r.market.liquidityUsd}
            locale={locale}
            format={(v) => formatUsd(v, locale)}
            testId="stat-liquidity"
          />
        </Stat>
        <Stat label={t("volume24")}>
          <Sourced
            v={r.market.volume}
            locale={locale}
            format={(v) => formatUsd(v.h24, locale) ?? t("noData")}
            testId="stat-volume"
          />
        </Stat>
      </section>

      <Suspense fallback={<div className="panel h-72 animate-pulse" aria-busy="true" />}>
        <PricePanel r={r} locale={locale} frame={frame} mode={chartMode} path={`/token/${raw}`} />
      </Suspense>

      <section aria-label={t("scores")} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(
          ["contractSafety", "liquidityHealth", "distributionHealth", "socialMomentum"] as const
        ).map((k, i) => (
          <ScoreCard key={k} score={r.scores[k]} locale={locale} delay={120 + i * 70} />
        ))}
      </section>

      <Findings r={r} locale={locale} />
      <Charts r={r} locale={locale} />
      <SocialPanel r={r} locale={locale} />
      <div className="grid gap-6 lg:grid-cols-2">
        <LiquidityPanel r={r} locale={locale} />
        <ContractPanel r={r} locale={locale} explorer={explorer} />
      </div>
      <DistributionPanel r={r} locale={locale} explorer={explorer} />
      <div className="grid gap-6 lg:grid-cols-2">
        <DeployerPanel r={r} locale={locale} explorer={explorer} />
        <TimelinePanel r={r} locale={locale} explorer={explorer} />
      </div>
    </div>
  );
}

function Change({ r }: { r: TokenReport }) {
  const c = r.market.priceChange.value;
  if (!c) return null;
  const cls = (v: number | null) =>
    v === null ? "text-dim" : v >= 0 ? "text-risk-low" : "text-risk-high";
  return (
    <span className="num mt-1 block text-xs">
      <span className={cls(c.h1)}>1h {formatSignedPercent(c.h1) ?? "—"}</span> ·{" "}
      <span className={cls(c.h24)}>24h {formatSignedPercent(c.h24) ?? "—"}</span>
    </span>
  );
}
