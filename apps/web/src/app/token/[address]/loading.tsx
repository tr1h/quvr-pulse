export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" data-testid="token-loading">
      <div className="h-10 w-2/3 animate-pulse rounded bg-panel" />
      <div className="panel flex items-center gap-3 p-4 text-sm text-muted">
        <svg width="80" height="20" viewBox="0 0 80 20" aria-hidden="true">
          <path
            d="M0 10h20l5-8 8 16 6-12 4 4h37"
            fill="none"
            stroke="var(--color-signal)"
            strokeWidth="1.5"
            className="trace"
          />
        </svg>
        Сканируем цепочку и источники… / Scanning chain and providers…
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="panel h-48 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
