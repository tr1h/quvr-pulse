import { riskVerdict } from "@quvr/scoring";
import { pickText, type Locale, type TokenReport } from "@quvr/shared";
import { makeT } from "@/lib/i18n";

const LEVEL_COLOR = {
  low: "var(--color-risk-low)",
  elevated: "var(--color-risk-elevated)",
  high: "var(--color-risk-high)",
  insufficient: "var(--color-risk-none)",
} as const;
const TONE = {
  positive: "text-risk-low",
  negative: "text-risk-high",
  neutral: "text-muted",
} as const;

/** One-glance summary: risk level, top red flags and current market facts. Never a buy/sell call. */
export function VerdictCard({ r, locale }: { r: TokenReport; locale: Locale }) {
  const t = makeT(locale);
  const tx = r.market.txns.value?.h24 ?? null;
  const v = riskVerdict({
    scores: r.scores,
    findings: r.findings,
    priceChange24h: r.market.priceChange.value?.h24 ?? null,
    buys24h: tx?.buys ?? null,
    sells24h: tx?.sells ?? null,
    liquidityUsd: r.market.liquidityUsd.value,
    marketCapUsd: r.market.marketCapUsd.value ?? r.market.fdvUsd.value,
    volume24hUsd: r.market.volume.value?.h24 ?? null,
  });
  const color = LEVEL_COLOR[v.level];
  return (
    <section
      className="panel rise border-l-4 p-4"
      style={{ borderLeftColor: color }}
      aria-labelledby="verdict"
      data-testid="verdict"
      data-level={v.level}
    >
      <div className="label mb-1" id="verdict">
        {t("verdictTitle")}
      </div>
      <p className="font-display text-xl font-bold sm:text-2xl" style={{ color }}>
        {t(`lvl_${v.level}`)}
      </p>
      <p className="mt-1 text-sm text-paper">{pickText(v.headline, locale)}</p>
      {(v.redFlags.length > 0 || v.market.length > 0) && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {v.redFlags.length > 0 && (
            <div>
              <div className="label mb-1">{t("verdictFlags")}</div>
              <ul className="space-y-1 text-sm text-risk-high">
                {v.redFlags.map((f, i) => (
                  <li key={i}>▲ {pickText(f, locale)}</li>
                ))}
              </ul>
            </div>
          )}
          {v.market.length > 0 && (
            <div>
              <div className="label mb-1">{t("verdictMarket")}</div>
              <ul className="space-y-1 text-sm">
                {v.market.map((m, i) => (
                  <li key={i} className={TONE[m.tone]}>
                    · {pickText(m.text, locale)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-dim">{t("verdictNoForecast")}</p>
    </section>
  );
}
