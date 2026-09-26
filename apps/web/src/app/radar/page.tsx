import type { Metadata } from "next";
import { radarLive } from "@quvr/services";
import { AutoRefresh } from "@/components/AutoRefresh";
import { RadarTable } from "@/components/RadarTable";
import { makeT, tx } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { getLocale } from "@/lib/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return pageMetadata({
    path: "/radar",
    locale,
    title: tx(locale, {
      ru: "Радар токенов: новые и трендовые мемкоины с оценкой риска",
      en: "Token radar: new and trending memecoins with risk scores",
      de: "Token-Radar: neue und trendende Memecoins mit Risikobewertung",
      es: "Radar de tokens: memecoins nuevas y en tendencia con puntuación de riesgo",
      zh: "代币雷达：新上线与热门 Memecoin 及风险评分",
    }),
    description: tx(locale, {
      ru: "Свежие токены Robinhood Chain, Base и Solana с оценками контракта, ликвидности, распределения и социального импульса. Обновляется каждые 15 секунд.",
      en: "Fresh Robinhood Chain, Base and Solana tokens with contract, liquidity, distribution and social momentum scores. Updated every 15 seconds.",
      de: "Neue Tokens auf Robinhood Chain, Base und Solana mit Bewertungen für Contract, Liquidität, Verteilung und Social-Momentum. Aktualisierung alle 15 Sekunden.",
      es: "Tokens recientes de Robinhood Chain, Base y Solana con puntuaciones de contrato, liquidez, distribución e impulso social. Se actualiza cada 15 segundos.",
      zh: "Robinhood Chain、Base 与 Solana 新代币，含合约、流动性、持仓分布和社交热度评分。每 15 秒更新。",
    }),
  });
}

export default async function RadarPage() {
  const locale = await getLocale();
  const t = makeT(locale);
  const L = (ru: string, en: string, de: string, es: string, zh: string) =>
    tx(locale, { ru, en, de, es, zh });
  const rows = await radarLive(150);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("radarTitle")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t("radarSub")}</p>
        </div>
        <AutoRefresh seconds={30} label={t("autoRefresh")} defaultOn />
      </div>
      <RadarTable
        rows={rows}
        labels={{
          token: t("token"),
          network: t("network"),
          price: L("Цена", "Price", "Preis", "Precio", "价格"),
          volume: L("Объём 24ч", "Vol 24h", "Vol. 24h", "Vol. 24h", "24h 成交量"),
          liquidity: t("liquidity"),
          marketCap: t("marketCap"),
          age: L("Возраст", "Age", "Alter", "Edad", "时长"),
          flow: L("Покупки/продажи", "Buys/sells", "Käufe/Verkäufe", "Compras/ventas", "买/卖"),
          risk: L("Риск", "Risk", "Risiko", "Riesgo", "风险"),
          contract: L("Контракт", "Contract", "Contract", "Contrato", "合约"),
          social: t("socialMomentum"),
          filter: t("filter"),
          allChains: L("Все сети", "All chains", "Alle Chains", "Todas", "全部链"),
          presets: {
            gainers: L(
              "↑ Рост за 1ч",
              "↑ Top gainers 1h",
              "↑ Gewinner 1h",
              "↑ Suben 1h",
              "↑ 1h 涨幅",
            ),
            losers: L(
              "↓ Падение за 1ч",
              "↓ Top losers 1h",
              "↓ Verlierer 1h",
              "↓ Bajan 1h",
              "↓ 1h 跌幅",
            ),
            volume: L("Объём 24ч", "Volume 24h", "Volumen 24h", "Volumen 24h", "24h 成交量"),
            new: L("Новые пулы", "Newest pools", "Neueste Pools", "Pools nuevos", "最新池子"),
            liquidity: L("Ликвидность", "Liquidity", "Liquidität", "Liquidez", "流动性"),
          },
          riskFilter: {
            all: L("Любой риск", "Any risk", "Jedes Risiko", "Cualquier riesgo", "全部风险"),
            "no-high": L(
              "Скрыть высокий риск",
              "Hide high risk",
              "Hohes Risiko ausblenden",
              "Ocultar riesgo alto",
              "隐藏高风险",
            ),
            low: L(
              "Только низкий обнаруженный",
              "Low detected only",
              "Nur geringes erkanntes",
              "Solo riesgo bajo detectado",
              "仅检出风险较低",
            ),
          },
          minLiquidity: L("Ликв.", "Liq", "Liq.", "Liq.", "流动性"),
          any: L("любая", "any", "beliebig", "cualquiera", "不限"),
          levels: {
            low: t("lvl_low"),
            elevated: t("lvl_elevated"),
            high: t("lvl_high"),
            insufficient: t("lvl_insufficient"),
          },
          noData: t("noData"),
          empty: t("emptyRadar"),
          shown: L("Показано", "Shown", "Angezeigt", "Mostrando", "显示"),
          live: L(
            "цены и изменения — Dexscreener, обновление каждые 30 с",
            "prices and changes from Dexscreener, refreshed every 30 s",
            "Preise und Änderungen von Dexscreener, alle 30 s aktualisiert",
            "precios y cambios de Dexscreener, cada 30 s",
            "价格与涨跌来自 Dexscreener，每 30 秒更新",
          ),
        }}
      />
      <p className="text-xs text-dim">
        {L(
          "Рост цены не означает низкий риск. Это не инвестиционная рекомендация.",
          "Price growth does not mean low risk. Not investment advice.",
          "Kursanstieg bedeutet kein geringes Risiko. Keine Anlageberatung.",
          "Que el precio suba no significa riesgo bajo. No es asesoramiento de inversión.",
          "价格上涨不代表风险低。不构成投资建议。",
        )}
      </p>
    </div>
  );
}
