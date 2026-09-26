import type { Metadata } from "next";
import { getSystemStatus } from "@quvr/services";
import { formatAge } from "@quvr/shared";
import { AutoRefresh } from "@/components/AutoRefresh";
import { makeT, tx } from "@/lib/i18n";
import { getLocale } from "@/lib/server";
import { isAdminKey } from "@/lib/admin";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Status",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ key?: string }> };

const dot = (c: string) => (
  <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />
);

export default async function StatusPage({ searchParams }: Props) {
  // Internal: /admin/status?key=<ADMIN_STATS_KEY>; anything else is a plain 404.
  const sp = await searchParams;
  if (!isAdminKey(sp.key)) notFound();
  const locale = await getLocale();
  const t = makeT(locale);
  const s = await getSystemStatus();
  const good = "var(--color-risk-low)";
  const bad = "var(--color-risk-high)";
  const off = "var(--color-risk-none)";
  return (
    <div className="space-y-6" data-testid="status-page">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-2xl font-bold">{t("statusTitle")}</h1>
        <AutoRefresh seconds={15} label={t("autoRefresh")} defaultOn={false} />
      </div>
      <section className="panel grid grid-cols-2 gap-4 p-4 text-sm sm:grid-cols-5">
        <div>
          <div className="label mb-1">{t("mode")}</div>
          <div className="font-mono" data-testid="app-mode">
            {s.mode}
          </div>
        </div>
        <div>
          <div className="label mb-1">RPC</div>
          <div className="font-mono">
            {s.rpc} · {s.chainId}
          </div>
        </div>
        <div>
          <div className="label mb-1">{t("database")}</div>
          <div className="flex items-center gap-2 font-mono">
            {dot(s.database === "ok" ? good : s.database === "down" ? bad : off)} {s.database}
          </div>
        </div>
        <div>
          <div className="label mb-1">Redis</div>
          <div className="flex items-center gap-2 font-mono">
            {dot(s.redis === "ok" ? good : s.redis === "down" ? bad : off)} {s.redis}
          </div>
        </div>
        <div>
          <div className="label mb-1">{t("worker")}</div>
          <div className="flex items-center gap-2 font-mono">
            {dot(s.worker.alive ? good : off)}{" "}
            {s.worker.lastHeartbeat ? formatAge(s.worker.lastHeartbeat, locale) : "—"}
          </div>
        </div>
      </section>
      {s.fomoCredits && (
        <section className="panel p-4 text-sm" data-testid="fomo-credits">
          <div className="label mb-2">FomoAPI credits</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono">
            <span>
              {tx(locale, { ru: "сегодня", en: "today", de: "heute", es: "hoy", zh: "今日" })}:{" "}
              {s.fomoCredits.today ?? "—"} / {s.fomoCredits.cap}
            </span>
            <span>
              {tx(locale, {
                ru: "остаток в месяце",
                en: "left this month",
                de: "Rest diesen Monat",
                es: "restante este mes",
                zh: "本月剩余",
              })}
              : {s.fomoCredits.remainingMonth ?? "—"}
            </span>
          </div>
          {Object.keys(s.fomoCredits.byEndpoint).length > 0 && (
            <ul className="mt-2 font-mono text-xs text-muted">
              {Object.entries(s.fomoCredits.byEndpoint)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <li key={k}>
                    {k}: {v}
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-rule text-left">
              {[
                t("source"),
                "reporter",
                t("successRate"),
                t("latency"),
                "circuit",
                t("updated"),
                t("lastError"),
              ].map((h) => (
                <th key={h} className="label px-3 py-2 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.sources.map((x) => (
              <tr key={`${x.reporter}:${x.source}`} className="border-t border-rule/60 align-top">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2 font-mono">
                    {dot(
                      !x.configured
                        ? off
                        : x.circuit === "open"
                          ? bad
                          : x.successRate !== null && x.successRate < 0.8
                            ? "var(--color-risk-elevated)"
                            : good,
                    )}
                    {x.source}
                  </span>
                  {x.note && <span className="text-xs text-dim">{x.note}</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted">{x.reporter}</td>
                <td className="num px-3 py-2">
                  {x.successRate === null
                    ? "—"
                    : `${Math.round(x.successRate * 100)}% (${x.calls})`}
                </td>
                <td className="num px-3 py-2">
                  {x.p50LatencyMs === null ? "—" : `${x.p50LatencyMs} / ${x.p95LatencyMs} ms`}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{x.circuit}</td>
                <td className="num px-3 py-2 text-xs text-muted">
                  {x.lastSuccessAt ? formatAge(x.lastSuccessAt, locale) : "—"}
                </td>
                <td className="max-w-xs break-words px-3 py-2 font-mono text-[0.7rem] text-muted">
                  {x.lastError ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="font-mono text-xs text-dim">{s.generatedAt}</p>
    </div>
  );
}
