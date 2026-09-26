import { formatAge, type Locale, type ScoreResult } from "@quvr/shared";
import { lt, tr, type DictKey, tx } from "@/lib/i18n";

export const LEVEL_COLOR: Record<string, string> = {
  low: "var(--color-risk-low)",
  elevated: "var(--color-risk-elevated)",
  high: "var(--color-risk-high)",
  insufficient: "var(--color-risk-none)",
  strong: "var(--color-signal)",
  moderate: "#c9a35a",
  weak: "var(--color-muted)",
};

/** Segmented meter (20 cells) — reads like an instrument, not a traffic light. */
export function Meter({ value, color }: { value: number | null; color: string }) {
  const lit = value === null ? 0 : Math.round(value / 5);
  return (
    <div className="flex gap-[3px]" aria-hidden="true">
      {Array.from({ length: 20 }, (_, i) => (
        <span
          key={i}
          className="h-3 flex-1 rounded-[1px]"
          style={{
            background: i < lit ? color : "var(--color-rule)",
            opacity: i < lit ? 0.55 + (i / 20) * 0.45 : 1,
          }}
        />
      ))}
    </div>
  );
}

export function ScoreCard({
  score,
  locale,
  delay = 0,
}: {
  score: ScoreResult;
  locale: Locale;
  delay?: number;
}) {
  const color = LEVEL_COLOR[score.level] ?? "var(--color-muted)";
  const title = tr(locale, score.key as DictKey);
  return (
    <section
      className="panel rise flex flex-col gap-3 p-4"
      style={{ animationDelay: `${delay}ms` }}
      data-testid={`score-${score.key}`}
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-sm font-medium leading-snug">{title}</h3>
        <span className="num text-4xl font-medium leading-none" style={{ color }}>
          {score.value ?? "—"}
        </span>
      </div>
      <Meter value={score.value} color={color} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className="rounded-sm px-1.5 py-0.5 font-mono text-[0.68rem] uppercase tracking-wider"
          style={{ color, border: `1px solid ${color}` }}
          data-testid={`level-${score.key}`}
        >
          {tr(locale, `lvl_${score.level}` as DictKey)}
        </span>
        <span className="font-mono text-[0.68rem] text-dim">
          {tr(locale, "confidence")}: {tr(locale, `conf_${score.confidence}` as DictKey)} ·{" "}
          {tr(locale, "coverage")} {Math.round(score.coverage * 100)}%
        </span>
      </div>
      {score.key === "socialMomentum" && (
        <p className="font-mono text-[0.65rem] text-signal">{tr(locale, "socialNotSafety")}</p>
      )}
      <ul className="space-y-1 text-sm">
        {score.reasons.slice(0, 5).map((r, i) => (
          <li key={i} className="flex gap-2 leading-snug">
            <span
              aria-hidden="true"
              className={
                r.impact === "negative"
                  ? "text-risk-high"
                  : r.impact === "positive"
                    ? "text-risk-low"
                    : "text-dim"
              }
            >
              {r.impact === "negative" ? "▼" : r.impact === "positive" ? "▲" : "•"}
            </span>
            <span className="text-paper/90">{lt(locale, r.text)}</span>
          </li>
        ))}
      </ul>
      <details className="mt-auto text-xs text-muted">
        <summary className="cursor-pointer select-none font-mono text-[0.65rem] uppercase tracking-wider hover:text-paper">
          {tx(locale, {
            ru: "Разбивка",
            en: "Breakdown",
            de: "Aufschlüsselung",
            es: "Desglose",
            zh: "明细",
          })}{" "}
          · {formatAge(score.updatedAt, locale)}
        </summary>
        <table className="mt-2 w-full">
          <tbody>
            {score.components.map((c) => (
              <tr key={c.id} className="border-t border-rule/60">
                <td className="py-1 pr-2">{lt(locale, c.label)}</td>
                <td className="num py-1 text-right">
                  {c.points === null ? (
                    <span className="text-dim">{tr(locale, "noData")}</span>
                  ) : (
                    `${Math.round(c.points)} / ${c.max}`
                  )}
                </td>
              </tr>
            ))}
            {score.penalties.map((p, i) => (
              <tr key={`p${i}`} className="border-t border-rule/60 text-risk-high">
                <td className="py-1 pr-2">{lt(locale, p.label)}</td>
                <td className="num py-1 text-right">−{p.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
