import { pickText, type Locale, type LocalizedText } from "@quvr/shared";
import { EXTRA } from "./i18n-extra";

export { LOCALES } from "@quvr/shared";

const dict = {
  navHome: { ru: "Сканер", en: "Scanner" },
  navRadar: { ru: "Радар", en: "Radar" },
  navWatch: { ru: "Наблюдение", en: "Watchlist" },
  navStatus: { ru: "Статус", en: "Status" },
  disclaimer: {
    ru: "QUVR Pulse is an independent analytics product and is not affiliated with or endorsed by Robinhood or Fomo. Независимая аналитика только для чтения: не является инвестиционной рекомендацией, не хранит ключи и не совершает транзакций.",
    en: "QUVR Pulse is an independent analytics product and is not affiliated with or endorsed by Robinhood or Fomo. Read-only analytics: not investment advice; we never hold keys or send transactions.",
  },
  heroTitle: { ru: "Проверьте токен до входа", en: "Check a token before you enter" },
  tagline: {
    ru: "Все стрелы в одном колчане.",
    en: "Every arrow in one quiver.",
  },
  pronunciation: {
    ru: "QUVR произносится «квивер» — от англ. quiver, «колчан»: набор инструментов, который берёшь с собой, прежде чем входить в токен.",
    en: "QUVR is pronounced “quiver” — the case that holds your arrows: the tools you take with you before entering a token.",
  },
  heroSub: {
    ru: "Контракт, ликвидность, распределение и социальный хайп токенов Robinhood Chain, Base и Solana — каждая цифра с источником и временем.",
    en: "Contract, liquidity, distribution and social hype for Robinhood Chain, Base and Solana tokens — every number with its source and time.",
  },
  inputPlaceholder: {
    ru: "Адрес токена: 0x… (Robinhood / Base) или Solana",
    en: "Token address: 0x… (Robinhood / Base) or Solana",
  },
  scan: { ru: "Проверить", en: "Scan" },
  invalidAddress: {
    ru: "Не похоже на адрес токена: нужен 0x… (Robinhood Chain) или адрес Solana.",
    en: "Not a token address: use 0x… (Robinhood Chain) or a Solana address.",
  },
  solanaNotSupported: {
    ru: "Адрес Solana повреждён: проверьте, что он скопирован целиком.",
    en: "This Solana address looks truncated: make sure it was copied in full.",
  },
  trending: { ru: "В тренде на Fomo", en: "Trending on Fomo" },
  trendingOff: {
    ru: "Социальные данные отключены: FOMO_API_KEY не задан, сервис работает в режиме onchain-only.",
    en: "Social data is off: FOMO_API_KEY is not set, running in onchain-only mode.",
  },
  newTokens: { ru: "Новые токены Robinhood Chain", en: "New Robinhood Chain tokens" },
  newTokensSub: {
    ru: "Пулы Uniswap v4, созданные за последние 6 часов (on-chain Initialize)",
    en: "Uniswap v4 pools created in the last 6 hours (on-chain Initialize)",
  },
  latestWarnings: { ru: "Последние предупреждения", en: "Latest warnings" },
  noWarnings: {
    ru: "Пока нет предупреждений высокого уровня среди проверенных токенов.",
    en: "No high-severity warnings among scanned tokens yet.",
  },
  sources: { ru: "Источники данных", en: "Data sources" },
  noData: { ru: "Нет данных", en: "No data" },
  stale: { ru: "устарело", en: "stale" },
  approx: { ru: "оценка", en: "estimate" },
  source: { ru: "Источник", en: "Source" },
  updated: { ru: "Обновлено", en: "Updated" },
  ago: { ru: "назад", en: "ago" },
  price: { ru: "Цена", en: "Price" },
  marketCap: { ru: "Капитализация", en: "Market cap" },
  liquidity: { ru: "Ликвидность", en: "Liquidity" },
  volume24: { ru: "Объём 24ч", en: "Volume 24h" },
  copy: { ru: "Копировать", en: "Copy" },
  copied: { ru: "Скопировано", en: "Copied" },
  watch: { ru: "Добавить в наблюдение", en: "Add to watchlist" },
  unwatch: { ru: "Убрать из наблюдения", en: "Remove from watchlist" },
  watchFailed: { ru: "Не удалось: база данных недоступна", en: "Failed: database unavailable" },
  scores: { ru: "Оценки", en: "Scores" },
  contractSafety: { ru: "Безопасность контракта", en: "Contract Safety" },
  liquidityHealth: { ru: "Здоровье ликвидности", en: "Liquidity Health" },
  distributionHealth: { ru: "Распределение", en: "Distribution Health" },
  socialMomentum: { ru: "Социальный импульс", en: "Social Momentum" },
  socialNotSafety: { ru: "Импульс ≠ безопасность", en: "Momentum ≠ safety" },
  confidence: { ru: "Достоверность", en: "Confidence" },
  coverage: { ru: "покрытие", en: "coverage" },
  lvl_low: { ru: "Низкий обнаруженный риск", en: "Low detected risk" },
  lvl_elevated: { ru: "Повышенный риск", en: "Elevated risk" },
  lvl_high: { ru: "Высокий риск", en: "High risk" },
  lvl_insufficient: { ru: "Недостаточно данных", en: "Insufficient data" },
  lvl_strong: { ru: "Сильный импульс", en: "Strong momentum" },
  lvl_moderate: { ru: "Умеренный импульс", en: "Moderate momentum" },
  lvl_weak: { ru: "Слабый импульс", en: "Weak momentum" },
  conf_low: { ru: "низкая", en: "low" },
  conf_medium: { ru: "средняя", en: "medium" },
  conf_high: { ru: "высокая", en: "high" },
  warnings: { ru: "Предупреждения", en: "Warnings" },
  noFindings: {
    ru: "Существенных проблем не обнаружено. Это не гарантия безопасности.",
    en: "No material issues detected. This is not a guarantee of safety.",
  },
  evidence: { ru: "Доказательства", en: "Evidence" },
  priceUsd: { ru: "График цены, USD", en: "Price chart, USD" },
  timeframe: { ru: "Период", en: "Timeframe" },
  tf_1d: { ru: "24ч", en: "24h" },
  tf_7d: { ru: "7д", en: "7d" },
  tf_30d: { ru: "30д", en: "30d" },
  noPool: { ru: "Пул не найден — графика нет.", en: "No pool found — no chart." },
  verdictTitle: { ru: "Итог проверки", en: "Bottom line" },
  verdictFlags: { ru: "Главные красные флаги", en: "Top red flags" },
  verdictMarket: { ru: "Что происходит на рынке сейчас", en: "What the market is doing now" },
  verdictNoForecast: {
    ru: "Это не совет купить или продать и не прогноз цены. Цену мемкоинов честно предсказать нельзя: мы показываем только проверяемые риски и факты. Вкладывайте только то, что готовы потерять.",
    en: "This is not advice to buy or sell and not a price forecast. Nobody can honestly predict memecoin prices: we only show verifiable risks and facts. Only put in what you can afford to lose.",
  },
  charts: { ru: "Цена и ликвидность", en: "Price & liquidity" },
  priceChart: { ru: "Цена (on-chain свопы, 24ч)", en: "Price (on-chain swaps, 24h)" },
  liqChart: { ru: "Ликвидность (наши снимки)", en: "Liquidity (our snapshots)" },
  notEnoughHistory: {
    ru: "Недостаточно истории — точки копятся каждые 15 секунд, пока токен в наблюдении.",
    en: "Not enough history yet — points accumulate every 15 s while the token is watched.",
  },
  liquidityDetails: { ru: "Ликвидность и торговля", en: "Liquidity & trading" },
  mainPool: { ru: "Основной пул", en: "Main pool" },
  mainPoolShare: { ru: "Доля основного пула", en: "Main pool share" },
  liqMcap: { ru: "Ликвидность / капитализация", en: "Liquidity / market cap" },
  poolAge: { ru: "Возраст пула", en: "Pool age" },
  buysSells: { ru: "Покупки / продажи 24ч", en: "Buys / sells 24h" },
  netFlow: { ru: "Чистый приток 24ч", en: "Net flow 24h" },
  impact: { ru: "Влияние продажи на цену", en: "Sell price impact" },
  impactNote: {
    ru: "Приблизительно: активная ликвидность текущего тика; пересечение тиков и комиссии hook не учтены.",
    en: "Approximate: active liquidity at the current tick; tick crossings and hook fees are not modeled.",
  },
  holders: { ru: "Держатели", en: "Holders" },
  holdersCount: { ru: "Уникальных держателей", en: "Unique holders" },
  topShare: { ru: "Доля top 1 / 5 / 10 / 20", en: "Top 1 / 5 / 10 / 20 share" },
  deployerShare: { ru: "Доля deployer", en: "Deployer share" },
  relatedShare: { ru: "Возможно связанные с deployer", en: "Possibly related to deployer" },
  growth24: { ru: "Рост держателей 24ч", en: "Holder growth 24h" },
  newWallets: { ru: "Новые кошельки 24ч", en: "New wallets 24h" },
  freshShare: { ru: "Свежие кошельки в top-20", en: "Fresh wallets in top 20" },
  address: { ru: "Адрес", en: "Address" },
  share: { ru: "Доля", en: "Share" },
  excluded: { ru: "Исключены из концентрации", en: "Excluded from concentration" },
  clusters: { ru: "Возможно связанные кошельки", en: "Possibly related wallets" },
  clustersNote: {
    ru: "Эвристика по общим признакам. Не доказывает, что кошельки принадлежат одному человеку.",
    en: "Heuristic based on shared signals. Does not prove the wallets belong to one person.",
  },
  noClusters: {
    ru: "Связей по доступным признакам не найдено.",
    en: "No links found with the available signals.",
  },
  deployer: { ru: "Действия deployer", en: "Deployer activity" },
  noDeployerActions: {
    ru: "Действий deployer с токеном не найдено.",
    en: "No deployer token activity found.",
  },
  contract: { ru: "Контракт", en: "Contract" },
  simulation: { ru: "Симуляция покупки/продажи", en: "Buy/sell simulation" },
  theses: { ru: "Тезисы Fomo", en: "Fomo theses" },
  authors: { ru: "Авторы и их надёжность", en: "Authors & reliability" },
  timeline: { ru: "Хронология", en: "Timeline" },
  links: { ru: "Ссылки", en: "Links" },
  generated: { ru: "Отчёт сформирован", en: "Report generated" },
  servedStale: {
    ru: "Часть источников не ответила — показаны последние корректные данные с отметкой времени.",
    en: "Some sources failed — showing the last good data with timestamps.",
  },
  radarTitle: { ru: "Радар", en: "Radar" },
  radarSub: {
    ru: "Проверенные и отслеживаемые токены. Сортируйте и фильтруйте — оценки независимы друг от друга.",
    en: "Scanned and watched tokens. Sort and filter — the scores are independent of each other.",
  },
  token: { ru: "Токен", en: "Token" },
  network: { ru: "Сеть", en: "Network" },
  qualityAuthors: { ru: "Кач. авторы", en: "Quality authors" },
  signalAge: { ru: "Возраст сигнала", en: "Signal age" },
  change: { ru: "Изм. 5м / 1ч", en: "Chg 5m / 1h" },
  filter: { ru: "Фильтр по тикеру или адресу", en: "Filter by ticker or address" },
  minSafety: { ru: "Мин. безопасность", en: "Min safety" },
  emptyRadar: {
    ru: "Пока пусто: проверьте токен на главной, и он появится здесь.",
    en: "Empty for now: scan a token on the home page and it will appear here.",
  },
  statusTitle: { ru: "Статус источников", en: "Source status" },
  mode: { ru: "Режим", en: "Mode" },
  database: { ru: "База данных", en: "Database" },
  worker: { ru: "Фоновый воркер", en: "Background worker" },
  successRate: { ru: "Успешность", en: "Success rate" },
  latency: { ru: "Задержка p50/p95", en: "Latency p50/p95" },
  lastError: { ru: "Последняя ошибка", en: "Last error" },
  watchTitle: { ru: "Наблюдение", en: "Watchlist" },
  watchSub: {
    ru: "Токены, которые вы отслеживаете в этом браузере. Для Telegram-уведомлений используйте /watch в боте.",
    en: "Tokens you follow in this browser. For Telegram alerts use /watch in the bot.",
  },
  watchEmpty: {
    ru: "Список пуст. Откройте отчёт токена и нажмите «Добавить в наблюдение».",
    en: "Empty. Open a token report and press “Add to watchlist”.",
  },
  alertsFeed: { ru: "События", en: "Events" },
  traderTitle: { ru: "Трейдер", en: "Trader" },
  traderOff: {
    ru: "Страницы трейдеров требуют социального источника (FOMO_API_KEY). Сейчас режим onchain-only.",
    en: "Trader pages need the social source (FOMO_API_KEY). Currently in onchain-only mode.",
  },
  sample: { ru: "Размер выборки", en: "Sample size" },
  pnl: { ru: "Реализованный PnL", en: "Realized PnL" },
  medianRoi: { ru: "Медианный ROI", en: "Median ROI" },
  winRate: { ru: "Win rate (нижняя граница 95%)", en: "Win rate (95% lower bound)" },
  maxDd: { ru: "Макс. просадка", en: "Max drawdown" },
  wallets: { ru: "Подтверждённые кошельки", en: "Confirmed wallets" },
  pending: { ru: "ждём", en: "pending" },
  retry: { ru: "Повторить", en: "Retry" },
  errorTitle: { ru: "Не удалось построить отчёт", en: "Could not build the report" },
  notFound: { ru: "Страница не найдена", en: "Page not found" },
  loading: {
    ru: "Собираем данные из цепочки и источников…",
    en: "Collecting on-chain and provider data…",
  },
  autoRefresh: { ru: "Автообновление", en: "Auto-refresh" },
} satisfies Record<string, LocalizedText>;

export type DictKey = keyof typeof dict;

function lookup(key: DictKey, locale: Locale): string {
  return locale === "ru" || locale === "en" ? dict[key][locale] : EXTRA[key][locale];
}

export function tr(locale: Locale, key: DictKey): string {
  return lookup(key, locale);
}

export function lt(locale: Locale, text: LocalizedText | null | undefined): string {
  return text ? pickText(text, locale) : "";
}

export function makeT(locale: Locale) {
  return (key: DictKey) => lookup(key, locale);
}

/** Inline text for one-off labels: Russian and English required, others fall back to English. */
export function tx(locale: Locale, text: LocalizedText): string {
  return pickText(text, locale);
}
