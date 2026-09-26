import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getRugReport, type RugReportData } from "@quvr/services";
import type { RugFlagId } from "@quvr/scoring";
import {
  formatPct,
  formatUsd,
  pickText,
  shortAddress,
  type Locale,
  type LocalizedText,
  type RiskLevel,
} from "@quvr/shared";
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
    "Rug Report: статистика рисков токенов за неделю",
    "Rug Report: weekly token risk statistics",
    "Rug Report: wöchentliche Token-Risikostatistik",
    "Rug Report: estadísticas semanales de riesgo de tokens",
    "Rug Report：每周代币风险统计",
  ),
  h1: L("Rug Report", "Rug Report", "Rug Report", "Rug Report", "Rug Report"),
  lead: L(
    "Что мы нашли в токенах Robinhood Chain, Base и Solana, которые QUVR Pulse проверил за последние 7 дней. Цифры обновляются каждые 30 минут.",
    "What we found in the Robinhood Chain, Base and Solana tokens QUVR Pulse checked in the last 7 days. Numbers refresh every 30 minutes.",
    "Was wir in den Tokens auf Robinhood Chain, Base und Solana gefunden haben, die QUVR Pulse in den letzten 7 Tagen geprüft hat. Aktualisierung alle 30 Minuten.",
    "Lo que encontramos en los tokens de Robinhood Chain, Base y Solana que QUVR Pulse revisó en los últimos 7 días. Las cifras se actualizan cada 30 minutos.",
    "QUVR Pulse 过去 7 天检查的 Robinhood Chain、Base 与 Solana 代币中发现了什么。数据每 30 分钟更新一次。",
  ),
  description: L(
    "Сколько новых мемкоинов с концентрацией держателей, тонкой ликвидностью, продажами создателя и опасными правами контракта. Еженедельная статистика по Robinhood Chain, Base и Solana.",
    "How many new memecoins have concentrated holders, thin liquidity, creator sells and risky contract powers. Weekly statistics for Robinhood Chain, Base and Solana.",
    "Wie viele neue Memecoins konzentrierte Holder, dünne Liquidität, Creator-Verkäufe und riskante Contract-Rechte haben. Wöchentliche Statistik für Robinhood Chain, Base und Solana.",
    "Cuántas memecoins nuevas tienen holders concentrados, liquidez escasa, ventas del creador y poderes de contrato riesgosos. Estadísticas semanales de Robinhood Chain, Base y Solana.",
    "有多少新 Memecoin 存在持仓集中、流动性薄弱、创建者卖出和高风险合约权限。Robinhood Chain、Base 与 Solana 每周统计。",
  ),
  checked: L(
    "токенов проверено",
    "tokens checked",
    "Tokens geprüft",
    "tokens revisados",
    "个代币已检查",
  ),
  period: L("Период", "Period", "Zeitraum", "Periodo", "统计周期"),
  verdicts: L(
    "Итог проверки по токенам",
    "Verdicts across tokens",
    "Urteile über alle Tokens",
    "Veredictos de los tokens",
    "代币检查结论分布",
  ),
  flags: L(
    "Как часто встречаются красные флаги",
    "How often each red flag appears",
    "Wie oft jedes Warnsignal vorkommt",
    "Con qué frecuencia aparece cada señal de alerta",
    "各类危险信号出现频率",
  ),
  ofTokens: L("токенов", "of tokens", "der Tokens", "de los tokens", "的代币"),
  medians: L("Типичный токен", "Typical token", "Typischer Token", "Token típico", "典型代币"),
  medTop10: L(
    "Медианная доля топ-10 держателей (без пулов)",
    "Median top-10 holder share (pools excluded)",
    "Median-Anteil der Top-10-Holder (ohne Pools)",
    "Cuota mediana del top 10 de holders (sin pools)",
    "前 10 持有人占比中位数（不含池子）",
  ),
  medLiq: L(
    "Медианная ликвидность к капитализации",
    "Median liquidity to market cap",
    "Median Liquidität zu Marktkapitalisierung",
    "Liquidez mediana respecto a la capitalización",
    "流动性与市值之比中位数",
  ),
  topTraded: L(
    "Самые торгуемые токены недели",
    "Most traded tokens this week",
    "Meistgehandelte Tokens der Woche",
    "Tokens más negociados de la semana",
    "本周交易最活跃的代币",
  ),
  volume: L("Объём 24ч", "Volume 24h", "Volumen 24h", "Volumen 24h", "24h 成交量"),
  verdict: L("Итог", "Verdict", "Urteil", "Veredicto", "结论"),
  outcomes: L(
    "Что стало с токенами через 7 дней",
    "What happened to tokens after 7 days",
    "Was nach 7 Tagen aus den Tokens wurde",
    "Qué pasó con los tokens tras 7 días",
    "7 天后这些代币怎么样了",
  ),
  outcomesSoon: L(
    "Собираем данные. Мы отслеживаем цену и ликвидность каждого проверенного токена; первые честные цифры появятся, когда у токенов наберётся неделя истории.",
    "Collecting data. We track price and liquidity of every checked token; the first honest numbers appear once tokens have a week of history.",
    "Daten werden gesammelt. Wir verfolgen Preis und Liquidität jedes geprüften Tokens; die ersten ehrlichen Zahlen erscheinen, sobald eine Woche Verlauf vorliegt.",
    "Recopilando datos. Seguimos el precio y la liquidez de cada token revisado; las primeras cifras honestas aparecerán cuando haya una semana de historial.",
    "正在收集数据。我们会跟踪每个已检查代币的价格和流动性；等积累满一周历史后，将公布第一批真实数据。",
  ),
  method: L("Методика", "Methodology", "Methodik", "Metodología", "方法说明"),
  methodText: L(
    "Выборка — токены, которые QUVR Pulse проверил за 7 дней: новые пулы, найденные автоматически, и токены, которые проверяли пользователи. Это не все токены сети. Флаг засчитывается только при уровне серьёзности «средний» и выше. Если данных не хватает, токен попадает в «Недостаточно данных», а не в «низкий риск». Связи кошельков — эвристика, а не доказательство общего владельца.",
    "The sample is the tokens QUVR Pulse checked in 7 days: new pools discovered automatically plus tokens users looked up. It is not every token on the chain. A flag counts only at medium severity or above. When data is missing a token lands in “Insufficient data”, never in “low risk”. Wallet links are a heuristic, not proof of common ownership.",
    "Die Stichprobe sind die Tokens, die QUVR Pulse in 7 Tagen geprüft hat: automatisch gefundene neue Pools plus von Nutzern abgefragte Tokens. Das sind nicht alle Tokens der Chain. Ein Warnsignal zählt erst ab mittlerem Schweregrad. Fehlen Daten, landet ein Token bei „Zu wenige Daten“, nie bei „geringem Risiko“. Wallet-Verbindungen sind eine Heuristik, kein Beweis für einen gemeinsamen Besitzer.",
    "La muestra son los tokens que QUVR Pulse revisó en 7 días: pools nuevos detectados automáticamente más los tokens que consultaron los usuarios. No son todos los tokens de la red. Una señal cuenta solo con gravedad media o superior. Si faltan datos, el token va a «Datos insuficientes», nunca a «riesgo bajo». Los vínculos entre wallets son una heurística, no prueba de un propietario común.",
    "样本为 QUVR Pulse 在 7 天内检查的代币：自动发现的新交易池，以及用户查询过的代币。并非链上全部代币。只有严重程度为“中”及以上的信号才计入。数据缺失时，代币归入“数据不足”，绝不会算作“低风险”。钱包关联是启发式判断，不能证明属于同一所有者。",
  ),
  historySince: L(
    "История в базе с",
    "History in our database since",
    "Verlauf in unserer Datenbank seit",
    "Historial en nuestra base desde",
    "数据库历史起始于",
  ),
  cta: L(
    "Проверить свой токен",
    "Check your token",
    "Eigenen Token prüfen",
    "Revisar tu token",
    "检查你的代币",
  ),
  empty: L(
    "За эту неделю проверенных токенов пока нет.",
    "No tokens were checked this week yet.",
    "Diese Woche wurden noch keine Tokens geprüft.",
    "Todavía no se revisaron tokens esta semana.",
    "本周尚无已检查的代币。",
  ),
};

const FLAG: Record<RugFlagId, LocalizedText> = {
  "contract-control": L(
    "Контракт даёт кому-то опасные права (mint, pause, blacklist, заморозка, обновление)",
    "Contract gives someone risky powers (mint, pause, blacklist, freeze, upgrade)",
    "Contract gibt jemandem riskante Rechte (Mint, Pause, Blacklist, Freeze, Upgrade)",
    "El contrato da a alguien poderes de riesgo (mint, pausa, lista negra, congelar, actualizar)",
    "合约赋予某人高风险权限（增发、暂停、黑名单、冻结、升级）",
  ),
  concentrated: L(
    "Большая часть токенов у топ-10 кошельков",
    "Most supply sits in the top-10 wallets",
    "Großteil des Angebots bei den Top-10-Wallets",
    "La mayor parte del suministro está en las 10 principales wallets",
    "大部分供应量集中在前 10 个钱包",
  ),
  "deployer-share": L(
    "Создатель держит крупную долю",
    "Creator holds a large share",
    "Creator hält einen großen Anteil",
    "El creador tiene una cuota grande",
    "创建者持有较大份额",
  ),
  "deployer-selling": L(
    "Создатель уже продаёт",
    "Creator is already selling",
    "Creator verkauft bereits",
    "El creador ya está vendiendo",
    "创建者已在卖出",
  ),
  clusters: L(
    "Возможно связанные кошельки держат заметную долю",
    "Possibly related wallets hold a notable share",
    "Möglicherweise verbundene Wallets halten einen spürbaren Anteil",
    "Wallets posiblemente vinculadas tienen una cuota notable",
    "可能关联的钱包持有可观份额",
  ),
  "thin-liquidity": L(
    "Тонкая ликвидность",
    "Thin liquidity",
    "Dünne Liquidität",
    "Liquidez escasa",
    "流动性薄弱",
  ),
  "price-impact": L(
    "Продажа сильно двигает цену",
    "Selling moves the price a lot",
    "Verkäufe bewegen den Kurs stark",
    "Vender mueve mucho el precio",
    "卖出会大幅影响价格",
  ),
  "mass-transfers": L(
    "Массовые рассылки токенов",
    "Mass token distributions",
    "Massenverteilungen von Tokens",
    "Distribuciones masivas de tokens",
    "代币批量分发",
  ),
};

const LEVEL_COLOR: Record<RiskLevel, string> = {
  low: "var(--color-risk-low)",
  elevated: "var(--color-risk-elevated)",
  high: "var(--color-risk-high)",
  insufficient: "var(--color-risk-none)",
};
const LEVEL_ORDER: RiskLevel[] = ["high", "elevated", "low", "insufficient"];

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return pageMetadata({
    path: "/rug-report",
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

export default async function RugReportPage() {
  const locale = await getLocale();
  const t = makeT(locale);
  const x = (k: keyof typeof TXT) => pickText(TXT[k], locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const d: RugReportData = await getRugReport();
  const pct = (v: number) => formatPct(v, locale, 0);
  const base = siteUrl();

  const ld = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "QUVR Pulse Rug Report",
    description: pickText(TXT.description, locale),
    url: `${base}${localizedPath("/rug-report", locale)}`,
    temporalCoverage: `${d.from.slice(0, 10)}/${d.to.slice(0, 10)}`,
    creator: { "@type": "Organization", name: "QUVR Pulse", url: base },
    isAccessibleForFree: true,
    variableMeasured: Object.keys(FLAG),
  };

  return (
    <article className="mx-auto max-w-4xl space-y-8" data-testid="rug-report">
      <JsonLd data={ld} nonce={nonce} />
      <header className="rise space-y-3 pt-4">
        <div className="label">
          {x("period")}: {fmtDate(d.from, locale)} — {fmtDate(d.to, locale)}
        </div>
        <h1 className="font-display text-3xl font-bold sm:text-5xl">
          Rug <span className="text-signal">Report</span>
        </h1>
        <p className="max-w-2xl text-muted sm:text-lg">{x("lead")}</p>
      </header>

      {d.total === 0 ? (
        <p className="panel p-4 text-muted">{x("empty")}</p>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="panel p-4">
              <div className="font-display text-4xl font-bold text-signal" data-testid="rr-total">
                {d.total}
              </div>
              <div className="label mt-1">{x("checked")}</div>
              <div className="mt-2 font-mono text-xs text-dim">
                {Object.entries(d.byChain)
                  .map(([c, n]) => `${c}: ${n}`)
                  .join(" · ")}
              </div>
            </div>
            <div className="panel p-4">
              <div className="font-display text-4xl font-bold">
                {d.medianTop10 !== null ? pct(d.medianTop10) : t("noData")}
              </div>
              <div className="label mt-1">{x("medTop10")}</div>
            </div>
            <div className="panel p-4">
              <div className="font-display text-4xl font-bold">
                {d.medianLiquidityToMcap !== null
                  ? formatPct(d.medianLiquidityToMcap, locale, 1)
                  : t("noData")}
              </div>
              <div className="label mt-1">{x("medLiq")}</div>
            </div>
          </section>

          <section className="panel space-y-3 p-4" aria-labelledby="rr-verdicts">
            <h2 id="rr-verdicts" className="font-display text-lg font-medium">
              {x("verdicts")}
            </h2>
            <div
              className="flex h-4 w-full overflow-hidden rounded-sm"
              role="img"
              aria-label={x("verdicts")}
            >
              {LEVEL_ORDER.map((l) =>
                d.verdicts[l] ? (
                  <div
                    key={l}
                    style={{
                      width: `${(d.verdicts[l] / d.total) * 100}%`,
                      background: LEVEL_COLOR[l],
                    }}
                  />
                ) : null,
              )}
            </div>
            <ul className="grid gap-2 text-sm sm:grid-cols-4">
              {LEVEL_ORDER.map((l) => (
                <li key={l} className="flex items-baseline gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: LEVEL_COLOR[l] }}
                  />
                  <span>
                    {t(`lvl_${l}`)}: <b className="font-mono">{pct(d.verdicts[l] / d.total)}</b>{" "}
                    <span className="text-dim">({d.verdicts[l]})</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel space-y-3 p-4" aria-labelledby="rr-flags">
            <h2 id="rr-flags" className="font-display text-lg font-medium">
              {x("flags")}
            </h2>
            <ul className="space-y-3">
              {d.flags.map((f) => (
                <li key={f.id} data-testid={`rr-flag-${f.id}`}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>{pickText(FLAG[f.id], locale)}</span>
                    <span className="shrink-0 font-mono">
                      {pct(f.share)} <span className="text-dim">({f.count})</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 bg-rule">
                    <div className="h-full bg-risk-high" style={{ width: `${f.share * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {d.topTraded.length > 0 && (
            <section className="panel p-4" aria-labelledby="rr-top">
              <h2 id="rr-top" className="mb-3 font-display text-lg font-medium">
                {x("topTraded")}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="label text-left">
                    <tr>
                      <th className="py-1 pr-3">{t("token")}</th>
                      <th className="py-1 pr-3">{t("network")}</th>
                      <th className="py-1 pr-3 text-right">{x("volume")}</th>
                      <th className="py-1 pr-3 text-right">{t("marketCap")}</th>
                      <th className="py-1">{x("verdict")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.topTraded.map((r) => (
                      <tr key={r.address} className="border-t border-rule/60">
                        <td className="py-2 pr-3">
                          <Link href={`/token/${r.address}`} className="hover:text-signal">
                            {r.symbol ? `$${r.symbol}` : shortAddress(r.address)}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-muted">{r.chain}</td>
                        <td className="py-2 pr-3 text-right font-mono">
                          {formatUsd(r.volume24hUsd, locale) ?? t("noData")}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono">
                          {formatUsd(r.marketCapUsd, locale) ?? t("noData")}
                        </td>
                        <td className="py-2" style={{ color: LEVEL_COLOR[r.level] }}>
                          {t(`lvl_${r.level}`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <section className="panel space-y-2 p-4" aria-labelledby="rr-outcomes">
        <h2 id="rr-outcomes" className="font-display text-lg font-medium">
          {x("outcomes")}
        </h2>
        <p className="text-sm text-muted">{x("outcomesSoon")}</p>
      </section>

      <section className="space-y-2 text-sm text-muted" aria-labelledby="rr-method">
        <h2 id="rr-method" className="font-display text-base font-medium text-paper">
          {x("method")}
        </h2>
        <p>{x("methodText")}</p>
        {d.historySince && (
          <p className="font-mono text-xs text-dim">
            {x("historySince")} {fmtDate(d.historySince, locale)} · {t("updated")}{" "}
            {fmtDate(d.generatedAt, locale)}
          </p>
        )}
      </section>

      <Link
        href="/"
        className="inline-block rounded-sm bg-signal px-5 py-3 font-display font-bold text-ink hover:opacity-90"
      >
        {x("cta")} →
      </Link>
    </article>
  );
}
