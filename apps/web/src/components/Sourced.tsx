import { formatAge, type Locale, type SourcedValue } from "@quvr/shared";
import { tr, tx } from "@/lib/i18n";

/**
 * Renders a SourcedValue: the formatted value or an explicit "No data" (never zero),
 * plus source, age, stale/estimate markers. The source link opens the primary source.
 */
export function Sourced<T>({
  v,
  locale,
  format,
  compact = false,
  testId,
}: {
  v: SourcedValue<T>;
  locale: Locale;
  format: (value: T) => React.ReactNode;
  compact?: boolean;
  testId?: string;
}) {
  const missing = v.value === null || v.value === undefined;
  const pendingHistory = missing && v.error?.includes("loading in the background");
  const meta = `${tr(locale, "source")}: ${v.source} · ${tr(locale, "updated")} ${formatAge(v.fetchedAt, locale)} ${tr(locale, "ago")}${v.error ? ` · ${v.error}` : ""}`;
  return (
    <span
      className="inline-flex flex-col"
      data-testid={testId}
      data-source={v.source}
      data-missing={missing ? "true" : "false"}
    >
      <span className={`num ${missing ? "text-dim" : ""}`} title={meta}>
        {missing ? (
          pendingHistory ? (
            <span className="blink text-signal">
              {tx(locale, {
                ru: "загрузка…",
                en: "loading…",
                de: "lädt…",
                es: "cargando…",
                zh: "加载中…",
              })}
            </span>
          ) : (
            tr(locale, "noData")
          )
        ) : (
          format(v.value as T)
        )}
        {!missing && v.approximate && (
          <span className="ml-1 align-super text-[0.6rem] text-signal">
            ≈ {tr(locale, "approx")}
          </span>
        )}
        {v.isStale && (
          <span className="ml-1 align-super text-[0.6rem] text-risk-elevated">
            {tr(locale, "stale")}
          </span>
        )}
      </span>
      {!compact && (
        <span className="mt-0.5 truncate font-mono text-[0.62rem] text-dim" title={meta}>
          {v.sourceUrl ? (
            <a
              href={v.sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="hover:text-muted"
            >
              {v.source}
            </a>
          ) : (
            v.source
          )}{" "}
          · {formatAge(v.fetchedAt, locale)}
        </span>
      )}
    </span>
  );
}

export function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="label mb-1">{label}</div>
      <div className="text-lg leading-tight">{children}</div>
    </div>
  );
}
