import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostDrafts, getSiteStats, type DayStats } from "@quvr/services";
import { shortAddress } from "@quvr/shared";
import { CopyButton } from "@/components/CopyButton";
import { isAdminKey } from "@/lib/admin";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stats", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ key?: string; days?: string }> };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
function merge(days: DayStats[], pick: (d: DayStats) => Record<string, number>) {
  const m = new Map<string, number>();
  for (const d of days) for (const [k, v] of Object.entries(pick(d))) m.set(k, (m.get(k) ?? 0) + v);
  return [...m].sort((a, b) => b[1] - a[1]);
}

function Table({
  title,
  rows,
  link,
}: {
  title: string;
  rows: Array<[string, number]>;
  link?: boolean;
}) {
  return (
    <section className="panel p-4">
      <h2 className="label mb-2">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-dim">—</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.slice(0, 15).map(([k, v]) => (
              <tr key={k} className="border-t border-rule/50">
                <td className="py-1 pr-3 font-mono text-xs">
                  {link ? (
                    <Link href={`/token/${k}`} className="hover:text-signal">
                      {shortAddress(k)}
                    </Link>
                  ) : (
                    k
                  )}
                </td>
                <td className="py-1 text-right font-mono">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function StatsPage({ searchParams }: Props) {
  const sp = await searchParams;
  // Private dashboard: /admin/stats?key=<ADMIN_STATS_KEY>; anything else is a plain 404.
  if (!isAdminKey(sp.key)) notFound();
  const days = Math.min(90, Math.max(1, Number(sp.days) || 14));
  const [s, drafts] = await Promise.all([
    getSiteStats(days),
    getPostDrafts(siteUrl()).catch(() => []),
  ]);
  const today = s.days[0];
  const week = s.days.slice(0, 7);
  const topTokens = new Map<string, number>();
  for (const d of week)
    for (const t of d.topTokens)
      topTokens.set(t.address, (topTokens.get(t.address) ?? 0) + t.views);

  return (
    <div className="space-y-6" data-testid="admin-stats">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">QUVR Pulse · stats</h1>
        <span className="font-mono text-xs text-dim">
          cookieless · no IPs stored · {s.redis ? "redis ok" : "redis unavailable"} ·{" "}
          <Link
            href={`/admin/status?key=${encodeURIComponent(sp.key ?? "")}`}
            className="underline decoration-dotted hover:text-signal"
          >
            sources status →
          </Link>
        </span>
      </header>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Visitors today", today?.visitors ?? 0],
          ["Views today", today?.views ?? 0],
          ["Views 7d", sum(week.map((d) => d.views))],
          [
            "Bot cards 7d",
            sum(
              week.map(
                (d) => (d.bot.card_group ?? 0) + (d.bot.card_private ?? 0) + (d.bot.inline ?? 0),
              ),
            ),
          ],
          ["Bot groups", s.botGroups],
          ["Shares on X 7d", sum(week.map((d) => d.events.share_x ?? 0))],
          ["Swap clicks 7d", sum(week.map((d) => d.events.trade_out ?? 0))],
        ].map(([label, value]) => (
          <div key={label as string} className="panel p-3">
            <div className="font-display text-2xl font-bold text-signal">{value}</div>
            <div className="label mt-1">{label}</div>
          </div>
        ))}
      </section>

      <section className="panel space-y-3 p-4" data-testid="post-drafts">
        <h2 className="label">Post drafts for X (copy, check, post by hand)</h2>
        {drafts.length === 0 ? (
          <p className="text-sm text-dim">No drafts yet: not enough data in the last 24–48h.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {drafts.map((d) => (
              <div key={d.title} className="rounded-sm border border-rule/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-signal">{d.title}</span>
                  <CopyButton value={d.text} label="Copy" done="Copied" />
                </div>
                <pre className="whitespace-pre-wrap font-mono text-xs text-muted">{d.text}</pre>
                {d.address && (
                  <Link
                    href={`/token/${d.address}`}
                    className="mt-2 inline-block text-xs text-dim underline decoration-dotted"
                  >
                    open report
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel overflow-x-auto p-4">
        <h2 className="label mb-2">By day</h2>
        <table className="w-full text-sm">
          <thead className="label text-left">
            <tr>
              <th className="py-1 pr-3">Day (UTC)</th>
              <th className="py-1 pr-3 text-right">Visitors</th>
              <th className="py-1 pr-3 text-right">Views</th>
              <th className="py-1 pr-3 text-right">Token views</th>
              <th className="py-1 pr-3 text-right">Share X</th>
              <th className="py-1 pr-3 text-right">Copy post</th>
              <th className="py-1 pr-3 text-right">Watch</th>
              <th className="py-1 pr-3 text-right">Swap</th>
              <th className="py-1 pr-3 text-right">Bot group</th>
              <th className="py-1 pr-3 text-right">Bot private</th>
              <th className="py-1 text-right">Inline</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {s.days.map((d) => (
              <tr key={d.day} className="border-t border-rule/50">
                <td className="py-1 pr-3">{d.day}</td>
                <td className="py-1 pr-3 text-right">{d.visitors}</td>
                <td className="py-1 pr-3 text-right">{d.views}</td>
                <td className="py-1 pr-3 text-right">{d.pages["/token/*"] ?? 0}</td>
                <td className="py-1 pr-3 text-right">{d.events.share_x ?? 0}</td>
                <td className="py-1 pr-3 text-right">{d.events.copy_post ?? 0}</td>
                <td className="py-1 pr-3 text-right">{d.events.watch ?? 0}</td>
                <td className="py-1 pr-3 text-right">{d.events.trade_out ?? 0}</td>
                <td className="py-1 pr-3 text-right">{d.bot.card_group ?? 0}</td>
                <td className="py-1 pr-3 text-right">
                  {(d.bot.card_private ?? 0) + (d.bot.scan_cmd ?? 0)}
                </td>
                <td className="py-1 text-right">{d.bot.inline ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Table title="Pages · 7 days" rows={merge(week, (d) => d.pages)} />
        <Table title="Referrers · 7 days" rows={merge(week, (d) => d.referrers)} />
        <Table
          title="Most viewed tokens · 7 days"
          rows={[...topTokens].sort((a, b) => b[1] - a[1])}
          link
        />
        <Table title="Site language · 7 days" rows={merge(week, (d) => d.languages)} />
      </div>

      <section className="panel grid gap-3 p-4 sm:grid-cols-5">
        {[
          ["Tokens in DB", s.db.tokens],
          ["New tokens 24h", s.db.tokensToday],
          ["Outcome baselines", s.db.baselines],
          ["Outcomes recorded", s.db.outcomes],
          ["Web watchlists", s.db.watchlists],
        ].map(([label, value]) => (
          <div key={label as string}>
            <div className="font-display text-xl font-bold">{value}</div>
            <div className="label">{label}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
