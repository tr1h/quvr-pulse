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
      en: "Early Discovery token radar with independent risk scores",
      de: "Token-Radar: neue und trendende Memecoins mit Risikobewertung",
      es: "Radar de tokens: memecoins nuevas y en tendencia con puntuación de riesgo",
      zh: "代币雷达：新上线与热门 Memecoin 及风险评分",
    }),
    description: tx(locale, {
      ru: "Свежие токены Robinhood Chain, Base и Solana с оценками контракта, ликвидности, распределения и социального импульса. Обновляется каждые 15 секунд.",
      en: "Early traction candidates on Robinhood Chain, Base and Solana, ranked separately from contract, liquidity and distribution risk. Updated every 30 seconds.",
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
  const candidates = rows.filter((row) => row.discovery.status === "candidate").length;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("radarTitle")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t("radarSub")}</p>
        </div>
        <AutoRefresh seconds={30} label={t("autoRefresh")} defaultOn />
      </div>
      <section className="panel border-signal/40 p-4" aria-labelledby="early-discovery-title">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="early-discovery-title" className="font-display text-lg font-bold text-signal">
              {L(
                "Раннее обнаружение",
                "Early Discovery",
                "Früherkennung",
                "Detección temprana",
                "早期发现",
              )}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              {L(
                "Ищет раннее подтверждённое движение по ликвидности, торгам, потоку, возрасту пула и социальным сигналам. Риск — отдельный жёсткий фильтр: хайп не перекрывает красные флаги.",
                "Looks for early, observable traction across liquidity, trading, flow, pool age and social signals. Risk is a separate hard gate: hype never cancels red flags.",
                "Sucht nach früher, beobachtbarer Dynamik bei Liquidität, Handel, Flow, Pool-Alter und sozialen Signalen. Risiko bleibt ein separates hartes Gate.",
                "Busca tracción temprana observable en liquidez, actividad, flujo, edad del pool y señales sociales. El riesgo es un filtro estricto independiente.",
                "根据流动性、交易、资金流、池龄和社交信号寻找可观察的早期动能。风险是独立硬门槛，热度不能抵消危险信号。",
              )}
            </p>
          </div>
          <div className="shrink-0 rounded border border-signal/50 px-3 py-2 text-center">
            <div className="font-mono text-2xl font-bold text-signal">{candidates}</div>
            <div className="text-xs text-muted">
              {L(
                "кандидатов сейчас",
                "candidates now",
                "Kandidaten jetzt",
                "candidatos ahora",
                "当前候选",
              )}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-dim">
          {L(
            "Discovery Score — не прогноз цены и не обещание доходности. Наведите на оценку, чтобы увидеть факторы и покрытие данных.",
            "Discovery Score is not a price forecast or a promise of returns. Hover a score to inspect its factors and data coverage.",
            "Der Discovery Score ist keine Kursprognose oder Renditezusage. Faktoren und Datenabdeckung erscheinen beim Darüberfahren.",
            "Discovery Score no es una predicción de precio ni una promesa de rentabilidad. Pasa el cursor para ver factores y cobertura.",
            "Discovery Score 不是价格预测或收益承诺。将鼠标悬停在评分上可查看因素和数据覆盖率。",
          )}
        </p>
      </section>
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
          discovery: L("Обнаружение", "Discovery", "Discovery", "Detección", "发现"),
          contract: L("Контракт", "Contract", "Contract", "Contrato", "合约"),
          social: t("socialMomentum"),
          filter: t("filter"),
          allChains: L("Все сети", "All chains", "Alle Chains", "Todas", "全部链"),
          presets: {
            discovery: L(
              "✦ Ранние кандидаты",
              "✦ Early candidates",
              "✦ Frühe Kandidaten",
              "✦ Candidatos tempranos",
              "✦ 早期候选",
            ),
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
          discoveryFilter: {
            all: L("Все сигналы", "All signals", "Alle Signale", "Todas las señales", "全部信号"),
            candidate: L(
              "Только кандидаты",
              "Candidates only",
              "Nur Kandidaten",
              "Solo candidatos",
              "仅候选",
            ),
            watch: L(
              "Только наблюдение",
              "Watch only",
              "Nur beobachten",
              "Solo observar",
              "仅观察",
            ),
          },
          discoveryStatuses: {
            candidate: L("Кандидат", "Candidate", "Kandidat", "Candidato", "候选"),
            watch: L("Наблюдать", "Watch", "Beobachten", "Observar", "观察"),
            excluded: L("Исключён", "Excluded", "Ausgeschlossen", "Excluido", "已排除"),
            insufficient: L("Мало данных", "No data", "Zu wenig Daten", "Sin datos", "数据不足"),
          },
          discoveryFactors: {
            liquidity: L(
              "Глубина ликвидности",
              "Liquidity depth",
              "Liquiditätstiefe",
              "Profundidad de liquidez",
              "流动性深度",
            ),
            liquidityRatio: L(
              "Ликвидность/капитализация",
              "Liquidity/market cap",
              "Liquidität/Marktkapitalisierung",
              "Liquidez/capitalización",
              "流动性/市值",
            ),
            valuation: L(
              "Ранняя оценка",
              "Early valuation",
              "Frühe Bewertung",
              "Valoración temprana",
              "早期估值",
            ),
            turnover: L(
              "Оборот/ликвидность",
              "Turnover/liquidity",
              "Umsatz/Liquidität",
              "Rotación/liquidez",
              "换手率/流动性",
            ),
            trades: L(
              "Количество сделок",
              "Trade breadth",
              "Handelsbreite",
              "Amplitud de operaciones",
              "交易广度",
            ),
            flow: L(
              "Баланс покупок",
              "Buy/sell balance",
              "Kauf-/Verkaufsbalance",
              "Balance compra/venta",
              "买卖平衡",
            ),
            freshness: L(
              "Возраст пула",
              "Pool freshness",
              "Pool-Frische",
              "Antigüedad del pool",
              "池子新鲜度",
            ),
            holders: L(
              "Рост держателей",
              "Holder growth",
              "Holder-Wachstum",
              "Crecimiento de holders",
              "持有人增长",
            ),
            social: L(
              "Социальное подтверждение",
              "Social evidence",
              "Soziale Evidenz",
              "Evidencia social",
              "社交证据",
            ),
            priceAction: L(
              "Движение без погони",
              "Non-chasing price action",
              "Kursbewegung ohne FOMO",
              "Movimiento sin perseguir",
              "非追涨走势",
            ),
          },
          discoveryGateReasons: {
            "high-risk": L(
              "Risk Gate: высокий риск",
              "Risk Gate: high risk",
              "Risk Gate: hohes Risiko",
              "Risk Gate: riesgo alto",
              "风险门槛：高风险",
            ),
            "risk-data-missing": L(
              "Risk Gate: не хватает данных",
              "Risk Gate: missing data",
              "Risk Gate: Daten fehlen",
              "Risk Gate: faltan datos",
              "风险门槛：数据缺失",
            ),
            "elevated-risk": L(
              "Risk Gate: повышенный риск",
              "Risk Gate: elevated risk",
              "Risk Gate: erhöhtes Risiko",
              "Risk Gate: riesgo elevado",
              "风险门槛：风险偏高",
            ),
            "liquidity-missing": L(
              "Нет данных ликвидности",
              "Liquidity data missing",
              "Liquiditätsdaten fehlen",
              "Faltan datos de liquidez",
              "缺少流动性数据",
            ),
            "thin-liquidity": L(
              "Ликвидность ниже $5K",
              "Liquidity below $5K",
              "Liquidität unter $5K",
              "Liquidez inferior a $5K",
              "流动性低于 $5K",
            ),
          },
          coverage: L(
            "Покрытие данных",
            "Data coverage",
            "Datenabdeckung",
            "Cobertura de datos",
            "数据覆盖率",
          ),
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
