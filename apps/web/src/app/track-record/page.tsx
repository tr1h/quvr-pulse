import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getTrackRecord, TRACK_CHAINS, type TrackChain } from "@quvr/services";
import { TRACK_HORIZONS, TRACK_LEVELS, TRACK_MIN_SAMPLE, type TrackTable } from "@quvr/scoring";
import { formatPct, pickText, type Locale, type LocalizedText, type RiskLevel } from "@quvr/shared";
import { JsonLd } from "@/components/JsonLd";
import { makeT } from "@/lib/i18n";
import { localizedPath, pageMetadata, siteUrl } from "@/lib/seo";
import { getLocale } from "@/lib/server";

export const dynamic = "force-dynamic";

const L = (ru: string, en: string, de: string, es: string, zh: string): LocalizedText => ({
  ru,
  en,
  de,
  es,
  zh,
});

const TXT = {
  title: L(
    "Точность оценок: что стало с токенами после проверки",
    "Track record: what happened to tokens after our check",
    "Trefferquote: Was nach unserer Prüfung mit den Tokens geschah",
    "Historial: qué pasó con los tokens después de nuestra revisión",
    "准确度记录：检查之后代币的结局",
  ),
  description: L(
    "Честная проверка QUVR Pulse: как часто токены с высоким, повышенным и низким риском теряли 90% или исчезали с рынка через 1 час, 24 часа и 7 дней.",
    "An honest test of QUVR Pulse: how often tokens labelled high, elevated and low risk lost 90% or left the market within 1 hour, 24 hours and 7 days.",
    "Ein ehrlicher Test von QUVR Pulse: Wie oft Tokens mit hohem, erhöhtem und niedrigem Risiko binnen 1 Stunde, 24 Stunden und 7 Tagen 90 % verloren oder vom Markt verschwanden.",
    "Una prueba honesta de QUVR Pulse: con qué frecuencia los tokens de riesgo alto, elevado y bajo perdieron el 90 % o salieron del mercado en 1 hora, 24 horas y 7 días.",
    "对 QUVR Pulse 的诚实检验：被标为高、较高和低风险的代币，在 1 小时、24 小时和 7 天内下跌 90% 或退出市场的比例。",
  ),
  kicker: L(
    "Проверяем сами себя",
    "We check our own labels",
    "Wir prüfen unsere eigenen Urteile",
    "Comprobamos nuestras propias etiquetas",
    "我们检验自己的判断",
  ),
  h1a: L("Точность", "Track", "Treffer", "Historial", "准确度"),
  h1b: L("оценок", "record", "quote", "real", "记录"),
  lead: L(
    "Когда мы впервые проверяем токен, мы запоминаем свою оценку риска. Через 1 час, 24 часа и 7 дней смотрим, что с ним стало. Ниже — как часто токены из каждой группы теряли 90% цены или ликвидности либо совсем исчезали с рынка.",
    "The first time we check a token we record our risk label. After 1 hour, 24 hours and 7 days we look at what happened. Below: how often tokens in each group lost 90% of price or liquidity, or left the market entirely.",
    "Beim ersten Check eines Tokens speichern wir unser Risiko-Urteil. Nach 1 Stunde, 24 Stunden und 7 Tagen sehen wir nach, was passiert ist. Unten: wie oft Tokens jeder Gruppe 90 % Preis oder Liquidität verloren oder ganz vom Markt verschwanden.",
    "La primera vez que revisamos un token guardamos nuestra etiqueta de riesgo. Tras 1 hora, 24 horas y 7 días miramos qué pasó. Abajo: con qué frecuencia los tokens de cada grupo perdieron el 90 % del precio o la liquidez, o salieron del mercado.",
    "首次检查代币时，我们会记录风险判断。1 小时、24 小时和 7 天后再查看结局。下表显示各组代币价格或流动性下跌 90% 或完全退出市场的比例。",
  ),
  gone24: L(
    "исчезли или упали на 90% за 24 часа",
    "gone or down 90% within 24 hours",
    "weg oder −90 % binnen 24 Stunden",
    "desaparecidos o −90 % en 24 horas",
    "24 小时内消失或下跌 90%",
  ),
  collecting: L(
    "Собираем живые данные: первые результаты за 24 часа появятся, когда в каждой группе наберётся хотя бы 20 токенов.",
    "Collecting live data: 24-hour results appear once each group has at least 20 tokens.",
    "Wir sammeln Live-Daten: 24-Stunden-Ergebnisse erscheinen, sobald jede Gruppe mindestens 20 Tokens hat.",
    "Recogiendo datos en vivo: los resultados de 24 horas aparecerán cuando cada grupo tenga al menos 20 tokens.",
    "正在收集实时数据：每组至少有 20 个代币后显示 24 小时结果。",
  ),
  tracked: L(
    "токенов под наблюдением",
    "tokens tracked",
    "Tokens verfolgt",
    "tokens seguidos",
    "个代币在跟踪中",
  ),
  since: L(
    "живые прогнозы с",
    "live forecasts since",
    "Live-Prognosen seit",
    "pronósticos en vivo desde",
    "实时预测始于",
  ),
  liveH: L("Живые прогнозы", "Live forecasts", "Live-Prognosen", "Pronósticos en vivo", "实时预测"),
  liveNote: L(
    "Оценка записана до того, как стал известен исход. Это и есть честная проверка.",
    "The label was recorded before the outcome was known. This is the honest test.",
    "Das Urteil wurde gespeichert, bevor das Ergebnis bekannt war. Das ist der ehrliche Test.",
    "La etiqueta se guardó antes de conocer el resultado. Esta es la prueba honesta.",
    "判断在结局出现之前就已记录，这才是诚实的检验。",
  ),
  allH: L(
    "Включая восстановленные данные",
    "Including reconstructed baselines",
    "Einschließlich rekonstruierter Ausgangswerte",
    "Incluyendo líneas base reconstruidas",
    "包含重建的基线",
  ),
  allNote: L(
    "Для токенов, проверенных до запуска отслеживания, исходная точка восстановлена по сохранённым снимкам, а оценка могла быть получена уже после падения. Эти цифры завышают точность — смотрите их только для масштаба.",
    "For tokens checked before tracking started, the starting point was rebuilt from stored snapshots and the label may have been computed after the drop. These numbers overstate accuracy — use them for scale only.",
    "Für Tokens, die vor dem Start des Trackings geprüft wurden, wurde der Ausgangspunkt aus gespeicherten Snapshots rekonstruiert; das Urteil kann nach dem Absturz entstanden sein. Diese Zahlen überschätzen die Trefferquote — nur zur Einordnung.",
    "Para tokens revisados antes de empezar el seguimiento, el punto de partida se reconstruyó con instantáneas guardadas y la etiqueta pudo calcularse después de la caída. Estas cifras exageran la precisión: úsalas solo como referencia.",
    "对于跟踪开始前检查的代币，起点由存储的快照重建，判断可能是在暴跌之后得出的。这些数字会高估准确度，仅供参考。",
  ),
  verdict: L("Оценка", "Label", "Urteil", "Etiqueta", "判断"),
  notEnough: L("мало данных", "too few", "zu wenige", "pocos datos", "数据不足"),
  howH: L("Как считаем", "How we measure", "Wie wir messen", "Cómo medimos", "计算方法"),
  how: [
    L(
      "«Исчез или −90%»: цена или ликвидность упала на 90% и больше от первой проверки, либо у токена не осталось рынка (пул удалён или снят с торгов).",
      "“Gone or −90%”: price or liquidity fell 90% or more from our first check, or no market is left (pool removed or delisted).",
      "„Weg oder −90 %“: Preis oder Liquidität fiel um 90 % oder mehr gegenüber unserem ersten Check, oder es gibt keinen Markt mehr (Pool entfernt oder delistet).",
      "«Desaparecido o −90 %»: el precio o la liquidez cayó un 90 % o más desde nuestra primera revisión, o ya no hay mercado (pool retirado o deslistado).",
      "“消失或 −90%”：价格或流动性较首次检查下跌 90% 以上，或已无市场（池子被移除或下架）。",
    ),
    L(
      "Замеры, сделанные с большим опозданием, не учитываются: для 1 часа — позже 30 минут, для 24 часов — позже 3 часов, для 7 дней — позже 12 часов.",
      "Late measurements are excluded: over 30 minutes late for 1 hour, over 3 hours for 24 hours, over 12 hours for 7 days.",
      "Verspätete Messungen zählen nicht: mehr als 30 Minuten bei 1 Stunde, mehr als 3 Stunden bei 24 Stunden, mehr als 12 Stunden bei 7 Tagen.",
      "Las mediciones tardías se excluyen: más de 30 minutos para 1 hora, más de 3 horas para 24 horas, más de 12 horas para 7 días.",
      "延迟过久的测量不计入：1 小时超过 30 分钟、24 小时超过 3 小时、7 天超过 12 小时。",
    ),
    L(
      `Процент показываем, только если в группе не меньше ${TRACK_MIN_SAMPLE} токенов. Цифры обновляются каждые 15 минут.`,
      `A rate is shown only when a group has at least ${TRACK_MIN_SAMPLE} tokens. Numbers refresh every 15 minutes.`,
      `Eine Quote wird nur gezeigt, wenn eine Gruppe mindestens ${TRACK_MIN_SAMPLE} Tokens hat. Aktualisierung alle 15 Minuten.`,
      `Solo mostramos un porcentaje si el grupo tiene al menos ${TRACK_MIN_SAMPLE} tokens. Las cifras se actualizan cada 15 minutos.`,
      `每组至少 ${TRACK_MIN_SAMPLE} 个代币时才显示比例。数据每 15 分钟更新一次。`,
    ),
    L(
      "Это статистика, а не обещание: токены с низким риском тоже падают, а с высоким — иногда выживают. Не является инвестиционной рекомендацией.",
      "This is statistics, not a promise: low-risk tokens fail too, and high-risk ones sometimes survive. Not investment advice.",
      "Das ist Statistik, kein Versprechen: Auch Tokens mit niedrigem Risiko scheitern, und riskante überleben manchmal. Keine Anlageberatung.",
      "Son estadísticas, no una promesa: los tokens de bajo riesgo también fracasan y los de alto riesgo a veces sobreviven. No es asesoramiento de inversión.",
      "这是统计而非承诺：低风险代币也会失败，高风险代币有时也能存活。不构成投资建议。",
    ),
  ],
};

const CHAIN_LABEL: Record<TrackChain, LocalizedText> = {
  all: L("Все сети", "All chains", "Alle Chains", "Todas las redes", "全部链"),
  robinhood: L(
    "Robinhood Chain",
    "Robinhood Chain",
    "Robinhood Chain",
    "Robinhood Chain",
    "Robinhood Chain",
  ),
  base: L("Base", "Base", "Base", "Base", "Base"),
  solana: L("Solana", "Solana", "Solana", "Solana", "Solana"),
};

const LEVEL_COLOR: Record<RiskLevel, string> = {
  low: "var(--color-risk-low)",
  elevated: "var(--color-risk-elevated)",
  high: "var(--color-risk-high)",
  insufficient: "var(--color-risk-none)",
};

const HORIZON_LABEL: Record<string, LocalizedText> = {
  "1h": L("1 час", "1 hour", "1 Stunde", "1 hora", "1 小时"),
  "24h": L("24 часа", "24 hours", "24 Stunden", "24 horas", "24 小时"),
  "7d": L("7 дней", "7 days", "7 Tage", "7 días", "7 天"),
};

type Props = { searchParams: Promise<{ chain?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return pageMetadata({
    path: "/track-record",
    locale,
    title: pickText(TXT.title, locale),
    description: pickText(TXT.description, locale),
  });
}

function fmtDate(iso: string, locale: Locale): string {
  const intl = { ru: "ru-RU", en: "en-US", de: "de-DE", es: "es-ES", zh: "zh-CN" }[locale];
  return new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

function Table({ table, locale }: { table: TrackTable; locale: Locale }) {
  const t = makeT(locale);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead className="label text-left">
          <tr>
            <th className="py-2 pr-3">{pickText(TXT.verdict, locale)}</th>
            {TRACK_HORIZONS.map((h) => (
              <th key={h} className="py-2 pr-3">
                {pickText(HORIZON_LABEL[h]!, locale)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TRACK_LEVELS.map((l) => (
            <tr key={l} className="border-t border-rule/50">
              <td className="py-2 pr-3">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: LEVEL_COLOR[l] }}
                  />
                  {t(`lvl_${l}`)}
                </span>
              </td>
              {TRACK_HORIZONS.map((h) => {
                const c = table[l][h];
                return (
                  <td key={h} className="py-2 pr-3 align-top">
                    {c.goneRate !== null ? (
                      <>
                        <div className="font-mono font-bold">
                          {formatPct(c.goneRate, locale, 0)}
                        </div>
                        <div className="mt-1 h-1 w-full max-w-[6rem] rounded-sm bg-rule">
                          <div
                            className="h-1 rounded-sm"
                            style={{
                              width: `${Math.round(c.goneRate * 100)}%`,
                              background: LEVEL_COLOR[l],
                            }}
                          />
                        </div>
                        <div className="mt-1 font-mono text-[0.65rem] text-dim">n={c.n}</div>
                      </>
                    ) : (
                      <span className="font-mono text-xs text-dim">
                        {c.n === 0 ? "—" : `${pickText(TXT.notEnough, locale)} · n=${c.n}`}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function TrackRecordPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = makeT(locale);
  const x = (k: Exclude<keyof typeof TXT, "how">) => pickText(TXT[k], locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const sp = await searchParams;
  const chain: TrackChain = (TRACK_CHAINS as readonly string[]).includes(sp.chain ?? "")
    ? (sp.chain as TrackChain)
    : "all";
  const d = await getTrackRecord(chain);
  const base = siteUrl();
  const path = "/track-record";

  const ld = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "QUVR Pulse track record",
    description: pickText(TXT.description, locale),
    url: `${base}${localizedPath(path, locale)}`,
    creator: { "@type": "Organization", name: "QUVR Pulse", url: base },
    isAccessibleForFree: true,
    variableMeasured: ["share of tokens gone or down 90% after 1h / 24h / 7d, by risk label"],
  };

  return (
    <article className="mx-auto max-w-4xl space-y-8" data-testid="track-record">
      <JsonLd data={ld} nonce={nonce} />
      <header className="rise space-y-3 pt-4">
        <div className="label">{x("kicker")}</div>
        <h1 className="font-display text-3xl font-bold sm:text-5xl">
          {x("h1a")} <span className="text-signal">{x("h1b")}</span>
        </h1>
        <p className="max-w-2xl text-muted sm:text-lg">{x("lead")}</p>
      </header>

      <nav className="flex flex-wrap gap-2 font-mono text-xs" aria-label="chain">
        {TRACK_CHAINS.map((c) => (
          <Link
            key={c}
            href={localizedPath(c === "all" ? path : `${path}?chain=${c}`, locale)}
            className={`rounded-sm border px-2 py-1 ${
              c === chain
                ? "border-signal bg-signal text-ink"
                : "border-rule text-muted hover:border-signal hover:text-signal"
            }`}
            aria-current={c === chain ? "page" : undefined}
          >
            {pickText(CHAIN_LABEL[c], locale)}
          </Link>
        ))}
      </nav>

      <section className="grid gap-4 sm:grid-cols-3">
        {d.headline ? (
          <>
            <div className="panel p-4">
              <div
                className="font-display text-4xl font-bold"
                style={{ color: LEVEL_COLOR.high }}
                data-testid="tr-high"
              >
                {formatPct(d.headline.high, locale, 0)}
              </div>
              <div className="label mt-1">
                {t("lvl_high")} · {x("gone24")}
              </div>
              <div className="mt-2 font-mono text-xs text-dim">n={d.headline.nHigh}</div>
            </div>
            <div className="panel p-4">
              <div
                className="font-display text-4xl font-bold"
                style={{ color: LEVEL_COLOR[d.headline.otherLevel] }}
                data-testid="tr-low"
              >
                {formatPct(d.headline.other, locale, 0)}
              </div>
              <div className="label mt-1">
                {t(`lvl_${d.headline.otherLevel}`)} · {x("gone24")}
              </div>
              <div className="mt-2 font-mono text-xs text-dim">n={d.headline.nOther}</div>
            </div>
          </>
        ) : (
          <p className="panel p-4 text-sm text-muted sm:col-span-2" data-testid="tr-collecting">
            {x("collecting")}
          </p>
        )}
        <div className="panel p-4">
          <div className="font-display text-4xl font-bold text-signal">{d.tracked}</div>
          <div className="label mt-1">{x("tracked")}</div>
          {d.liveSince && (
            <div className="mt-2 font-mono text-xs text-dim">
              {x("since")} {fmtDate(d.liveSince, locale)}
            </div>
          )}
        </div>
      </section>

      <section className="panel space-y-3 p-4" aria-labelledby="tr-live">
        <h2 id="tr-live" className="font-display text-lg font-medium">
          {x("liveH")}
        </h2>
        <p className="text-sm text-muted">{x("liveNote")}</p>
        <Table table={d.live} locale={locale} />
      </section>

      <section className="panel space-y-3 p-4" aria-labelledby="tr-all">
        <h2 id="tr-all" className="font-display text-lg font-medium">
          {x("allH")}
        </h2>
        <p className="text-sm text-muted">{x("allNote")}</p>
        <Table table={d.all} locale={locale} />
      </section>

      <section className="panel space-y-2 p-4 text-sm" aria-labelledby="tr-how">
        <h2 id="tr-how" className="font-display text-lg font-medium">
          {x("howH")}
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          {TXT.how.map((h, i) => (
            <li key={i}>{pickText(h, locale)}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
