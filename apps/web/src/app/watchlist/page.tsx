import type { Metadata } from "next";
import Link from "next/link";
import { alertEventsForOwner, dbAvailable, listWatchlist } from "@quvr/services";
import { formatAge, shortAddress, type LocalizedText } from "@quvr/shared";
import { lt, makeT } from "@/lib/i18n";
import { getLocale, getOwnerId } from "@/lib/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Watchlist", robots: { index: false, follow: true } };

export default async function WatchlistPage() {
  const locale = await getLocale();
  const t = makeT(locale);
  const owner = await getOwnerId();
  const [items, events] = owner
    ? await Promise.all([listWatchlist("web", owner), alertEventsForOwner("web", owner)])
    : [[], []];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("watchTitle")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("watchSub")}</p>
        {!dbAvailable() && <p className="mt-2 text-sm text-risk-elevated">{t("watchFailed")}</p>}
      </div>
      <section className="panel p-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted">{t("watchEmpty")}</p>
        ) : (
          <ul className="divide-y divide-rule/60">
            {items.map((w) => (
              <li key={w.id} className="flex items-center gap-3 py-2 text-sm">
                <Link href={`/token/${w.tokenAddress}`} className="font-medium hover:text-signal">
                  {w.token.symbol ?? shortAddress(w.tokenAddress)}
                </Link>
                <span className="truncate text-dim">{w.token.name}</span>
                <span className="num ml-auto text-xs text-dim">
                  {w.token.lastScannedAt
                    ? formatAge(w.token.lastScannedAt.toISOString(), locale)
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel p-4">
        <h2 className="mb-3 font-display text-base font-medium">{t("alertsFeed")}</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted">—</p>
        ) : (
          <ul className="divide-y divide-rule/60 text-sm">
            {events.map((e) => (
              <li key={e.id} className="py-2">
                <div className="flex gap-2">
                  <span className="font-mono text-xs uppercase text-risk-elevated">
                    {e.severity}
                  </span>
                  <span className="font-medium">{lt(locale, e.title as LocalizedText)}</span>
                  <span className="num ml-auto text-xs text-dim">
                    {formatAge(e.createdAt.toISOString(), locale)}
                  </span>
                </div>
                <p className="break-all text-xs text-muted">
                  {lt(locale, e.body as LocalizedText)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
