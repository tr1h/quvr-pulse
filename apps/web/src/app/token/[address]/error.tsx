"use client";

export default function TokenError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="panel p-6" role="alert">
      <h1 className="font-display text-xl font-bold">
        Не удалось построить отчёт / Could not build the report
      </h1>
      <p className="mt-2 text-sm text-muted">
        Источники данных не ответили, а сохранённого отчёта нет. Выдуманные значения мы не
        показываем.
        <br />
        Data providers did not respond and there is no saved report. We never show made-up values.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-dim">ref {error.digest}</p>}
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded bg-signal px-4 py-2 font-display text-sm font-bold text-ink"
      >
        Повторить / Retry
      </button>
    </div>
  );
}
