import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getPublicStats } from "@quvr/services";
import { formatPct, pickText, type Locale, type LocalizedText } from "@quvr/shared";
import { JsonLd } from "@/components/JsonLd";
import { makeT } from "@/lib/i18n";
import { localizedPath, pageMetadata, siteUrl, X_URL } from "@/lib/seo";
import { getLocale } from "@/lib/server";

export const dynamic = "force-dynamic";

const L = (ru: string, en: string, de: string, es: string, zh: string): LocalizedText => ({
  ru,
  en,
  de,
  es,
  zh,
});

const BOT_URL = "https://t.me/quvrpulse_bot";

const TXT = {
  title: L(
    "О проекте QUVR Pulse — проверка рисков мемкоинов",
    "About QUVR Pulse — risk intelligence for memecoins",
    "Über QUVR Pulse — Risikoanalyse für Memecoins",
    "Sobre QUVR Pulse — inteligencia de riesgo para memecoins",
    "关于 QUVR Pulse——Memecoin 风险情报",
  ),
  description: L(
    "Независимый read-only сервис проверки токенов Robinhood Chain, Base и Solana: что проверяем, чем отличаемся, живые цифры, дорожная карта и модель развития.",
    "Independent read-only token risk checks for Robinhood Chain, Base and Solana: what we check, how we differ, live numbers, roadmap and business model.",
    "Unabhängige Read-only-Risikoprüfung für Tokens auf Robinhood Chain, Base und Solana: was wir prüfen, was uns unterscheidet, Live-Zahlen, Roadmap und Geschäftsmodell.",
    "Revisión de riesgo independiente y de solo lectura para tokens de Robinhood Chain, Base y Solana: qué revisamos, en qué nos diferenciamos, cifras en vivo, hoja de ruta y modelo de negocio.",
    "独立只读的 Robinhood Chain、Base 与 Solana 代币风险检查：检查内容、差异化、实时数据、路线图与商业模式。",
  ),
  kicker: L("О проекте", "About", "Über uns", "Sobre nosotros", "关于我们"),
  h1a: L(
    "Проверка рисков",
    "Risk intelligence",
    "Risikoanalyse",
    "Inteligencia de riesgo",
    "风险情报",
  ),
  h1b: L(
    "для потока мемкоинов",
    "for the memecoin flood",
    "für die Memecoin-Flut",
    "para la avalancha de memecoins",
    "应对 Memecoin 洪流",
  ),
  lead: L(
    "QUVR Pulse за секунды показывает, что может сделать владелец контракта, насколько глубока ликвидность, кто держит токен и что уже делает создатель — до того, как человек нажмёт «купить». Только чтение данных: без кошелька, ключей и комиссий.",
    "QUVR Pulse shows in seconds what a contract owner can still do, how deep the liquidity is, who holds the token and what the creator is already doing — before anyone hits “buy”. Read-only: no wallet, no keys, no fees.",
    "QUVR Pulse zeigt in Sekunden, was der Contract-Owner noch tun kann, wie tief die Liquidität ist, wer den Token hält und was der Creator bereits tut — bevor jemand auf „Kaufen“ drückt. Nur lesend: keine Wallet, keine Schlüssel, keine Gebühren.",
    "QUVR Pulse muestra en segundos qué puede hacer aún el dueño del contrato, qué tan profunda es la liquidez, quién tiene el token y qué está haciendo ya el creador, antes de que alguien pulse «comprar». Solo lectura: sin wallet, sin claves, sin comisiones.",
    "QUVR Pulse 在几秒内展示：合约所有者还能做什么、流动性有多深、谁持有代币、创建者正在做什么——在任何人点击“买入”之前。只读：无需钱包、私钥，也不收费。",
  ),
  liveH: L("Живые цифры", "Live numbers", "Live-Zahlen", "Cifras en vivo", "实时数据"),
  liveNote: L(
    "Берутся из нашей базы в момент открытия страницы (кэш 10 минут).",
    "Pulled from our database when the page opens (10-minute cache).",
    "Direkt aus unserer Datenbank beim Öffnen der Seite (10 Minuten Cache).",
    "Se toman de nuestra base de datos al abrir la página (caché de 10 minutos).",
    "打开页面时从数据库读取（缓存 10 分钟）。",
  ),
  analyzed: L(
    "токенов проанализировано",
    "tokens analyzed",
    "Tokens analysiert",
    "tokens analizados",
    "个代币已分析",
  ),
  since: L("с", "since", "seit", "desde", "始于"),
  new24: L(
    "новых токенов за 24 часа",
    "new tokens in 24 hours",
    "neue Tokens in 24 Stunden",
    "tokens nuevos en 24 horas",
    "24 小时内新代币",
  ),
  gone: L(
    "токенов с высоким риском исчезли или упали на 90% за 24 часа",
    "of high-risk tokens gone or down 90% within 24 hours",
    "der Tokens mit hohem Risiko binnen 24 Stunden weg oder −90 %",
    "de los tokens de alto riesgo desaparecieron o cayeron un 90 % en 24 horas",
    "的高风险代币在 24 小时内消失或下跌 90%",
  ),
  chains: L(
    "сети: Robinhood Chain, Base, Solana",
    "chains: Robinhood Chain, Base, Solana",
    "Chains: Robinhood Chain, Base, Solana",
    "redes: Robinhood Chain, Base, Solana",
    "条链：Robinhood Chain、Base、Solana",
  ),
  problemH: L("Проблема", "The problem", "Das Problem", "El problema", "问题"),
  problem: [
    L(
      "Запустить токен сейчас можно за минуту. На Robinhood Chain лаунчпады создают десятки тысяч токенов в день, объём торгов доходит до миллиардов долларов в сутки.",
      "Launching a token now takes a minute. On Robinhood Chain, launchpads create tens of thousands of tokens a day, and trading volume reaches billions of dollars daily.",
      "Einen Token zu starten dauert heute eine Minute. Auf Robinhood Chain erzeugen Launchpads Zehntausende Tokens pro Tag, das Handelsvolumen erreicht Milliarden Dollar täglich.",
      "Lanzar un token hoy lleva un minuto. En Robinhood Chain, los launchpads crean decenas de miles de tokens al día y el volumen llega a miles de millones de dólares diarios.",
      "如今发行一个代币只需一分钟。在 Robinhood Chain 上，发射平台每天创建数以万计的代币，日交易量可达数十亿美元。",
    ),
    L(
      "Большинство покупателей не читают контракты и не видят, кто держит токен. Многие токены исчезают в первые часы, а деньги уходят вместе с ликвидностью.",
      "Most buyers can't read contracts or see who holds a token. Many tokens vanish within hours, and the money leaves with the liquidity.",
      "Die meisten Käufer können keine Contracts lesen und sehen nicht, wer einen Token hält. Viele Tokens verschwinden binnen Stunden — und das Geld geht mit der Liquidität.",
      "La mayoría no sabe leer contratos ni ver quién tiene el token. Muchos tokens desaparecen en horas y el dinero se va con la liquidez.",
      "大多数买家看不懂合约，也看不到谁持有代币。许多代币在数小时内消失，资金随流动性一起离开。",
    ),
  ],
  whatH: L("Что мы делаем", "What we do", "Was wir tun", "Qué hacemos", "我们做什么"),
  what: [
    L(
      "Контракт: права владельца, прокси, симуляция покупки и продажи",
      "Contract: owner powers, proxies, buy/sell simulation",
      "Contract: Owner-Rechte, Proxys, Kauf-/Verkaufssimulation",
      "Contrato: poderes del dueño, proxies, simulación de compra/venta",
      "合约：所有者权限、代理、买卖模拟",
    ),
    L(
      "Ликвидность: пулы, глубина, влияние продажи на цену",
      "Liquidity: pools, depth, sell price impact",
      "Liquidität: Pools, Tiefe, Preiswirkung von Verkäufen",
      "Liquidez: pools, profundidad, impacto de venta",
      "流动性：池子、深度、卖出价格冲击",
    ),
    L(
      "Держатели: концентрация, доля создателя, возможно связанные кошельки",
      "Holders: concentration, creator share, possibly related wallets",
      "Holder: Konzentration, Creator-Anteil, möglicherweise verbundene Wallets",
      "Holders: concentración, cuota del creador, wallets posiblemente vinculadas",
      "持有人：集中度、创建者占比、可能关联的钱包",
    ),
    L(
      "Создатель и копии тикера: продажи создателя, токены с тем же названием",
      "Creator and ticker clones: creator sells, tokens using the same name",
      "Creator und Ticker-Klone: Verkäufe des Creators, Tokens mit gleichem Namen",
      "Creador y clones del ticker: ventas del creador, tokens con el mismo nombre",
      "创建者与同名克隆：创建者卖出、同名代币",
    ),
  ],
  diffH: L(
    "Чем мы отличаемся",
    "What makes us different",
    "Was uns unterscheidet",
    "Qué nos hace diferentes",
    "我们的不同之处",
  ),
  diff: [
    [
      L(
        "Проверяем сами себя",
        "We publish our own track record",
        "Wir veröffentlichen unsere Trefferquote",
        "Publicamos nuestro historial",
        "公开自己的准确度",
      ),
      L(
        "Оценку записываем до исхода и через 24 часа и 7 дней публикуем, что стало с токенами. Включая неудобные цифры.",
        "Labels are recorded before the outcome; after 24 hours and 7 days we publish what happened — including inconvenient numbers.",
        "Urteile werden vor dem Ergebnis gespeichert; nach 24 Stunden und 7 Tagen veröffentlichen wir, was geschah — auch unbequeme Zahlen.",
        "Guardamos la etiqueta antes del resultado y a las 24 horas y 7 días publicamos qué pasó, incluidas las cifras incómodas.",
        "判断在结局前记录，24 小时和 7 天后公开结果——包括不好看的数字。",
      ),
    ],
    [
      L("Независимость", "Independence", "Unabhängigkeit", "Independencia", "独立性"),
      L(
        "Мы не берём комиссию со сделок и не продаём «проверенные» значки. Оценку нельзя купить.",
        "We take no trading fees and sell no “verified” badges. A label cannot be bought.",
        "Wir nehmen keine Handelsgebühren und verkaufen keine „Verified“-Abzeichen. Ein Urteil ist nicht käuflich.",
        "No cobramos comisiones por operaciones ni vendemos insignias de «verificado». La etiqueta no se compra.",
        "我们不收取交易费，也不出售“已验证”徽章。判断无法购买。",
      ),
    ],
    [
      L(
        "Robinhood Chain с первого блока",
        "Robinhood Chain from block one",
        "Robinhood Chain ab Block eins",
        "Robinhood Chain desde el primer bloque",
        "从第一个区块覆盖 Robinhood Chain",
      ),
      L(
        "Восстанавливаем всю историю переводов токена, а не только список держателей — отсюда связанные кошельки и действия создателя.",
        "We replay a token's full transfer history, not just a holder list — that is where related wallets and creator actions come from.",
        "Wir spielen die komplette Transfer-Historie nach, nicht nur eine Holder-Liste — daraus ergeben sich verbundene Wallets und Creator-Aktionen.",
        "Reconstruimos todo el historial de transferencias, no solo la lista de holders: de ahí salen las wallets vinculadas y las acciones del creador.",
        "我们回放代币完整的转账历史，而不只是持有人列表——关联钱包和创建者操作由此得出。",
      ),
    ],
    [
      L(
        "Там, где торгуют",
        "Where people trade",
        "Dort, wo gehandelt wird",
        "Donde se opera",
        "在交易发生的地方",
      ),
      L(
        "Сайт, Telegram-бот, который сам проверяет адреса в группах, и API для ботов, кошельков и лаунчпадов.",
        "Website, a Telegram bot that checks addresses in group chats automatically, and an API for bots, wallets and launchpads.",
        "Website, ein Telegram-Bot, der Adressen in Gruppen automatisch prüft, und eine API für Bots, Wallets und Launchpads.",
        "Web, un bot de Telegram que revisa direcciones en los grupos automáticamente y una API para bots, wallets y launchpads.",
        "网站、在群聊中自动检查地址的 Telegram 机器人，以及面向机器人、钱包和发射平台的 API。",
      ),
    ],
  ] as Array<[LocalizedText, LocalizedText]>,
  roadmapH: L("Дорожная карта", "Roadmap", "Roadmap", "Hoja de ruta", "路线图"),
  now: L("Работает", "Live", "Live", "En marcha", "已上线"),
  next: L("Q4 2026", "Q4 2026", "Q4 2026", "T4 2026", "2026 年第四季度"),
  later: L("Дальше", "Later", "Später", "Después", "之后"),
  roadNow: L(
    "Проверка токенов в 3 сетях · радар · Rug Report · точность оценок · Telegram-бот для групп · Risk Oracle и хук Uniswap v4 в Robinhood Chain",
    "Token checks on 3 chains · radar · Rug Report · track record · Telegram bot for groups · Risk Oracle and Uniswap v4 hook on Robinhood Chain",
    "Token-Checks auf 3 Chains · Radar · Rug Report · Trefferquote · Telegram-Bot für Gruppen · Risk Oracle und Uniswap-v4-Hook auf Robinhood Chain",
    "Revisión de tokens en 3 redes · radar · Rug Report · historial · bot de Telegram para grupos · Risk Oracle y hook de Uniswap v4 en Robinhood Chain",
    "3 条链代币检查 · 雷达 · Rug Report · 准确度记录 · 群组 Telegram 机器人 · Robinhood Chain 上的 Risk Oracle 与 Uniswap v4 钩子",
  ),
  roadNext: L(
    "Публичный API · Pro-оповещения о сливе ликвидности и продажах создателя · графики TradingView · первые пулы и кошельки с нашим хуком",
    "Public API · Pro alerts on liquidity pulls and creator sells · TradingView charts · first pools and wallets using our hook",
    "Öffentliche API · Pro-Alerts bei Liquiditätsabzug und Creator-Verkäufen · TradingView-Charts · erste Pools und Wallets mit unserem Hook",
    "API pública · alertas Pro de retiro de liquidez y ventas del creador · gráficos TradingView · primeros pools y wallets con nuestro hook",
    "公共 API · 流动性撤出与创建者卖出的 Pro 提醒 · TradingView 图表 · 首批使用我们钩子的池子和钱包",
  ),
  roadLater: L(
    "Проверка целого кошелька · больше сетей · интеграции с кошельками и лаунчпадами",
    "Whole-wallet checks · more chains · integrations with wallets and launchpads",
    "Prüfung ganzer Wallets · mehr Chains · Integrationen mit Wallets und Launchpads",
    "Revisión de wallets completas · más redes · integraciones con wallets y launchpads",
    "整钱包检查 · 更多链 · 与钱包和发射平台集成",
  ),
  modelH: L(
    "Модель развития",
    "Business model",
    "Geschäftsmodell",
    "Modelo de negocio",
    "商业模式",
  ),
  model: [
    L(
      "API для торговых ботов, кошельков и лаунчпадов — бесплатный уровень и платные тарифы",
      "API for trading bots, wallets and launchpads — free tier and paid plans",
      "API für Trading-Bots, Wallets und Launchpads — kostenlose Stufe und bezahlte Tarife",
      "API para bots de trading, wallets y launchpads: nivel gratuito y planes de pago",
      "面向交易机器人、钱包和发射平台的 API——免费档与付费套餐",
    ),
    L(
      "Pro-оповещения в Telegram за Stars: мгновенно и по большему числу токенов",
      "Pro alerts in Telegram paid with Stars: instant and for more tokens",
      "Pro-Alerts in Telegram mit Stars: sofort und für mehr Tokens",
      "Alertas Pro en Telegram con Stars: instantáneas y para más tokens",
      "用 Stars 支付的 Telegram Pro 提醒：即时、覆盖更多代币",
    ),
    L(
      "Бот-защита для крупных сообществ",
      "Protection bot for large communities",
      "Schutz-Bot für große Communities",
      "Bot de protección para comunidades grandes",
      "面向大型社区的防护机器人",
    ),
  ],
  modelNote: L(
    "Никаких комиссий со сделок и платных оценок — это условие доверия к продукту.",
    "No trading fees and no paid labels — that is the condition for trust in the product.",
    "Keine Handelsgebühren und keine bezahlten Urteile — das ist die Voraussetzung für Vertrauen.",
    "Sin comisiones por operaciones ni etiquetas de pago: es la condición para la confianza.",
    "不收交易费、不卖评级——这是产品可信的前提。",
  ),
  tryH: L("Попробовать", "Try it", "Ausprobieren", "Pruébalo", "立即体验"),
  contactH: L("Связь", "Contact", "Kontakt", "Contacto", "联系我们"),
  contact: L(
    "Для партнёрств, API и инвесторов — пишите в X или Telegram.",
    "Partnerships, API and investors — reach us on X or Telegram.",
    "Partnerschaften, API und Investoren — schreibt uns auf X oder Telegram.",
    "Alianzas, API e inversores: escríbenos en X o Telegram.",
    "合作、API 与投资者——请通过 X 或 Telegram 联系我们。",
  ),
  notAffiliated: L(
    "QUVR Pulse — независимый проект и не связан с Robinhood, Coinbase, Solana Foundation или Fomo.",
    "QUVR Pulse is an independent project, not affiliated with Robinhood, Coinbase, the Solana Foundation or Fomo.",
    "QUVR Pulse ist ein unabhängiges Projekt und nicht mit Robinhood, Coinbase, der Solana Foundation oder Fomo verbunden.",
    "QUVR Pulse es un proyecto independiente, sin relación con Robinhood, Coinbase, la Solana Foundation ni Fomo.",
    "QUVR Pulse 是独立项目，与 Robinhood、Coinbase、Solana 基金会或 Fomo 无关联。",
  ),
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return pageMetadata({
    path: "/about",
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

const num = (n: number, locale: Locale) =>
  n.toLocaleString({ ru: "ru-RU", en: "en-US", de: "de-DE", es: "es-ES", zh: "zh-CN" }[locale]);

export default async function AboutPage() {
  const locale = await getLocale();
  const t = makeT(locale);
  const x = (v: LocalizedText) => pickText(v, locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const s = await getPublicStats().catch(() => null);
  const base = siteUrl();
  const ld = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "QUVR Pulse",
    url: base,
    logo: `${base}/icon.svg`,
    sameAs: [X_URL, BOT_URL],
    description: x(TXT.description),
  };
  const card = "panel p-4";
  const big = "font-display text-4xl font-bold";

  return (
    <article className="mx-auto max-w-4xl space-y-10" data-testid="about">
      <JsonLd data={ld} nonce={nonce} />
      <header className="rise space-y-4 pt-4">
        <div className="label">{x(TXT.kicker)}</div>
        <h1 className="font-display text-3xl font-bold leading-tight sm:text-5xl">
          {x(TXT.h1a)} <span className="text-signal">{x(TXT.h1b)}</span>
        </h1>
        <p className="max-w-3xl text-muted sm:text-lg">{x(TXT.lead)}</p>
      </header>

      <section aria-labelledby="ab-live" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ab-live" className="font-display text-xl font-medium">
            {x(TXT.liveH)}
          </h2>
          <span className="font-mono text-xs text-dim">{x(TXT.liveNote)}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={card}>
            <div className={`${big} text-signal`} data-testid="ab-analyzed">
              {s ? num(s.tokensAnalyzed, locale) : "—"}
            </div>
            <div className="label mt-1">{x(TXT.analyzed)}</div>
            {s?.since && (
              <div className="mt-2 font-mono text-xs text-dim">
                {x(TXT.since)} {fmtDate(s.since, locale)}
              </div>
            )}
          </div>
          <div className={card}>
            <div className={big}>{s ? num(s.newTokens24h, locale) : "—"}</div>
            <div className="label mt-1">{x(TXT.new24)}</div>
          </div>
          <div className={card}>
            <div className={big} style={{ color: "var(--color-risk-high)" }}>
              {s?.track?.headline ? formatPct(s.track.headline.high, locale, 0) : "—"}
            </div>
            <div className="label mt-1">{x(TXT.gone)}</div>
            <Link
              href="/track-record?chain=robinhood"
              className="mt-2 inline-block font-mono text-xs text-dim underline decoration-dotted hover:text-signal"
            >
              Track record →
            </Link>
          </div>
          <div className={card}>
            <div className={big}>{s ? s.chains : "—"}</div>
            <div className="label mt-1">{x(TXT.chains)}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-display text-xl font-medium">{x(TXT.problemH)}</h2>
          {TXT.problem.map((p, i) => (
            <p key={i} className="text-muted">
              {x(p)}
            </p>
          ))}
        </div>
        <div className="space-y-3">
          <h2 className="font-display text-xl font-medium">{x(TXT.whatH)}</h2>
          <ul className="space-y-2">
            {TXT.what.map((w, i) => (
              <li key={i} className="flex gap-2 text-muted">
                <span className="text-signal">▸</span>
                {x(w)}
              </li>
            ))}
          </ul>
          <Link href="/methodology" className="inline-block text-sm text-signal hover:underline">
            {x(L("Методика →", "Methodology →", "Methodik →", "Metodología →", "方法论 →"))}
          </Link>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="ab-diff">
        <h2 id="ab-diff" className="font-display text-xl font-medium">
          {x(TXT.diffH)}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {TXT.diff.map(([h, p], i) => (
            <div key={i} className={card}>
              <h3 className="font-display text-base font-medium text-signal">{x(h)}</h3>
              <p className="mt-2 text-sm text-muted">{x(p)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="ab-road">
        <h2 id="ab-road" className="font-display text-xl font-medium">
          {x(TXT.roadmapH)}
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {(
            [
              [TXT.now, TXT.roadNow, "var(--color-risk-low)"],
              [TXT.next, TXT.roadNext, "var(--color-signal)"],
              [TXT.later, TXT.roadLater, "var(--color-risk-none)"],
            ] as const
          ).map(([h, p, c], i) => (
            <li key={i} className={card} style={{ borderTop: `2px solid ${c}` }}>
              <div className="label" style={{ color: c }}>
                {x(h)}
              </div>
              <p className="mt-2 text-sm text-muted">{x(p)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-display text-xl font-medium">{x(TXT.modelH)}</h2>
          <ul className="space-y-2">
            {TXT.model.map((m, i) => (
              <li key={i} className="flex gap-2 text-muted">
                <span className="text-signal">▸</span>
                {x(m)}
              </li>
            ))}
          </ul>
          <p className="text-sm text-dim">{x(TXT.modelNote)}</p>
        </div>
        <div className="space-y-3">
          <h2 className="font-display text-xl font-medium">{x(TXT.tryH)}</h2>
          <nav className="flex flex-wrap gap-2 text-sm" aria-label="product">
            {(
              [
                ["/", t("navHome")],
                ["/radar", t("navRadar")],
                ["/rug-report", "Rug Report"],
                ["/track-record", "Track record"],
              ] as const
            ).map(([href, label]) => (
              <Link
                key={href}
                href={localizedPath(href, locale)}
                className="rounded-sm border border-rule px-3 py-1.5 hover:border-signal hover:text-signal"
              >
                {label}
              </Link>
            ))}
            <a
              href={BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm border border-rule px-3 py-1.5 hover:border-signal hover:text-signal"
            >
              Telegram bot ↗
            </a>
          </nav>
          <h2 className="pt-3 font-display text-xl font-medium">{x(TXT.contactH)}</h2>
          <p className="text-muted">{x(TXT.contact)}</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <a
              href={X_URL}
              target="_blank"
              rel="me noopener noreferrer"
              className="text-signal hover:underline"
            >
              X @quvrpulse ↗
            </a>
            <a
              href={BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-signal hover:underline"
            >
              Telegram @quvrpulse_bot ↗
            </a>
          </div>
        </div>
      </section>

      <p className="text-xs text-dim">{x(TXT.notAffiliated)}</p>
    </article>
  );
}
