import type { LocalizedText, RiskFinding, RiskLevel, ScoreResult } from "@quvr/shared";

/**
 * "Итог проверки" — a one-glance summary of the report.
 *
 * Deliberately NOT a buy/sell signal or a price forecast: nobody can honestly predict a memecoin
 * price, and the product must not promise returns. It answers two questions instead:
 *  1. how risky is the token by what we could verify (worst of the three risk scores);
 *  2. what the market is doing right now (facts from the last 24 h, labelled as observations).
 */
export type VerdictSignal = { text: LocalizedText; tone: "positive" | "negative" | "neutral" };

export type Verdict = {
  level: RiskLevel;
  headline: LocalizedText;
  redFlags: LocalizedText[];
  market: VerdictSignal[];
};

export type VerdictInput = {
  scores: {
    contractSafety: ScoreResult;
    liquidityHealth: ScoreResult;
    distributionHealth: ScoreResult;
  };
  findings: RiskFinding[];
  priceChange24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
};

const HEADLINES: Record<RiskLevel, LocalizedText> = {
  high: {
    ru: "Найдены серьёзные красные флаги. С такими признаками очень легко потерять вложенные деньги.",
    en: "Serious red flags found. With signs like these it is very easy to lose the money you put in.",
    de: "Ernste Warnsignale gefunden. Bei solchen Anzeichen verliert man sehr leicht sein eingesetztes Geld.",
    es: "Se encontraron señales de alerta graves. Con indicios así es muy fácil perder el dinero invertido.",
    zh: "发现严重危险信号。出现这类迹象时，投入的资金很容易亏损。",
  },
  elevated: {
    ru: "Есть заметные риски. Разберите предупреждения ниже, прежде чем что-то решать.",
    en: "There are notable risks. Go through the warnings below before deciding anything.",
    de: "Es gibt deutliche Risiken. Lies die Warnungen unten, bevor du etwas entscheidest.",
    es: "Hay riesgos notables. Revisa las alertas de abajo antes de decidir nada.",
    zh: "存在明显风险。做任何决定前，请先查看下方警告。",
  },
  low: {
    ru: "Явных красных флагов не найдено. Это не значит, что цена вырастет: мемкоины часто падают и без мошенничества.",
    en: "No obvious red flags found. That does not mean the price will rise: memecoins often fall without any fraud.",
    de: "Keine offensichtlichen Warnsignale gefunden. Das heißt nicht, dass der Kurs steigt: Memecoins fallen oft auch ohne Betrug.",
    es: "No se encontraron señales de alerta evidentes. Eso no significa que el precio vaya a subir: las memecoins suelen caer incluso sin fraude.",
    zh: "未发现明显危险信号。但这不代表价格会上涨：即使没有欺诈，Memecoin 也经常下跌。",
  },
  insufficient: {
    ru: "Данных слишком мало, чтобы делать выводы. Отсутствие данных — тоже риск.",
    en: "Too little data to draw conclusions. Missing data is a risk in itself.",
    de: "Zu wenige Daten für ein Urteil. Fehlende Daten sind selbst ein Risiko.",
    es: "Hay muy pocos datos para sacar conclusiones. La falta de datos también es un riesgo.",
    zh: "数据太少，无法得出结论。数据缺失本身就是一种风险。",
  },
};

/**
 * Overall risk from the three risk scores: the worst one wins, and missing data is never "low"
 * (one missing score → elevated, two or more → insufficient).
 */
export function verdictLevel(levels: RiskLevel[]): RiskLevel {
  const insufficient = levels.filter((l) => l === "insufficient").length;
  if (levels.includes("high")) return "high";
  if (levels.includes("elevated")) return "elevated";
  if (insufficient >= 2) return "insufficient";
  if (insufficient === 1) return "elevated";
  return "low";
}

export function riskVerdict(input: VerdictInput): Verdict {
  // Only the three risk scores: callers often pass the full report scores, and social momentum
  // (attention, not risk) must never pull the verdict towards "insufficient data".
  const { contractSafety, liquidityHealth, distributionHealth } = input.scores;
  const level = verdictLevel(
    [contractSafety, liquidityHealth, distributionHealth].map((s) => s.level as RiskLevel),
  );

  const rank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
  const redFlags = input.findings
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .slice(0, 3)
    .map((f) => f.title);

  const market: VerdictSignal[] = [];
  const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
  if (input.priceChange24h !== null) {
    const v = input.priceChange24h;
    market.push({
      text: {
        ru: `Цена за 24 ч: ${pct(v)}`,
        en: `Price 24h: ${pct(v)}`,
        de: `Preis 24h: ${pct(v)}`,
        es: `Precio 24h: ${pct(v)}`,
        zh: `24 小时价格：${pct(v)}`,
      },
      tone: v <= -30 ? "negative" : "neutral",
    });
    if (v >= 100)
      market.push({
        text: {
          ru: "Резкий рост за сутки: после таких движений часто бывают сильные откаты.",
          en: "Sharp daily pump: moves like this are often followed by deep pullbacks.",
          de: "Starker Tagesanstieg: Auf solche Bewegungen folgen oft tiefe Rücksetzer.",
          es: "Subida brusca en el día: tras movimientos así suelen llegar caídas fuertes.",
          zh: "单日急涨：此类走势之后常出现大幅回调。",
        },
        tone: "negative",
      });
  }
  if (input.buys24h !== null && input.sells24h !== null && input.buys24h + input.sells24h >= 20) {
    const total = input.buys24h + input.sells24h;
    const buyShare = input.buys24h / total;
    market.push({
      text: {
        ru: `Покупок ${Math.round(buyShare * 100)}% из ${total} сделок за 24 ч`,
        en: `Buys ${Math.round(buyShare * 100)}% of ${total} trades in 24h`,
        de: `Käufe ${Math.round(buyShare * 100)}% von ${total} Trades in 24h`,
        es: `Compras: ${Math.round(buyShare * 100)}% de ${total} operaciones en 24h`,
        zh: `24 小时 ${total} 笔交易中买入占 ${Math.round(buyShare * 100)}%`,
      },
      tone: buyShare >= 0.55 ? "positive" : buyShare <= 0.4 ? "negative" : "neutral",
    });
  }
  if (input.liquidityUsd !== null && input.marketCapUsd && input.marketCapUsd > 0) {
    const ratio = input.liquidityUsd / input.marketCapUsd;
    if (ratio < 0.03)
      market.push({
        text: {
          ru: `Ликвидность всего ${(ratio * 100).toFixed(1)}% от капитализации: крупная продажа сильно обвалит цену.`,
          en: `Liquidity is only ${(ratio * 100).toFixed(1)}% of market cap: a large sell would crash the price.`,
          de: `Liquidität beträgt nur ${(ratio * 100).toFixed(1)}% der Marktkapitalisierung: Ein großer Verkauf würde den Kurs einbrechen lassen.`,
          es: `La liquidez es solo el ${(ratio * 100).toFixed(1)}% de la capitalización: una venta grande hundiría el precio.`,
          zh: `流动性仅为市值的 ${(ratio * 100).toFixed(1)}%：一笔大额卖出就会使价格暴跌。`,
        },
        tone: "negative",
      });
  }
  if (input.volume24hUsd !== null && input.liquidityUsd && input.liquidityUsd > 0) {
    if (input.volume24hUsd < input.liquidityUsd * 0.05)
      market.push({
        text: {
          ru: "Торгов почти нет: объём за сутки меньше 5% ликвидности.",
          en: "Almost no trading: 24h volume is below 5% of liquidity.",
          de: "Kaum Handel: Das 24h-Volumen liegt unter 5% der Liquidität.",
          es: "Casi no hay operaciones: el volumen de 24h es inferior al 5% de la liquidez.",
          zh: "几乎没有交易：24 小时成交量不足流动性的 5%。",
        },
        tone: "negative",
      });
  }
  return { level, headline: HEADLINES[level], redFlags, market };
}
