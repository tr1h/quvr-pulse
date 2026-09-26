"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { RadarRow } from "@quvr/services";

type SortKey =
  | "priceUsd"
  | "change5m"
  | "change1h"
  | "change6h"
  | "change24h"
  | "volume24hUsd"
  | "liquidityUsd"
  | "marketCapUsd"
  | "age"
  | "flow"
  | "risk"
  | "contractSafety"
  | "socialMomentum";

type Preset = "gainers" | "losers" | "volume" | "new" | "liquidity";
type Chain = "all" | "robinhood" | "base" | "solana";
type RiskFilter = "all" | "no-high" | "low";

export type RadarLabels = {
  token: string;
  network: string;
  price: string;
  volume: string;
  liquidity: string;
  marketCap: string;
  age: string;
  flow: string;
  risk: string;
  contract: string;
  social: string;
  filter: string;
  allChains: string;
  presets: Record<Preset, string>;
  riskFilter: Record<RiskFilter, string>;
  minLiquidity: string;
  any: string;
  levels: Record<RadarRow["verdict"], string>;
  noData: string;
  empty: string;
  shown: string;
  live: string;
};

const PRESETS: Record<Preset, { key: SortKey; dir: 1 | -1 }> = {
  gainers: { key: "change1h", dir: -1 },
  losers: { key: "change1h", dir: 1 },
  volume: { key: "volume24hUsd", dir: -1 },
  new: { key: "age", dir: 1 },
  liquidity: { key: "liquidityUsd", dir: -1 },
};
const RISK_ORDER: Record<RadarRow["verdict"], number> = {
  low: 0,
  elevated: 1,
  insufficient: 2,
  high: 3,
};
const LEVEL_COLOR: Record<RadarRow["verdict"], string> = {
  low: "var(--color-risk-low)",
  elevated: "var(--color-risk-elevated)",
  high: "var(--color-risk-high)",
  insufficient: "var(--color-risk-none)",
};
const CHAIN_SHORT: Record<RadarRow["chainKey"], string> = {
  robinhood: "RH",
  base: "BASE",
  solana: "SOL",
};
const MIN_LIQ = [0, 1_000, 10_000, 50_000];
const STORE = "quvr:radar:v2";

const usd = (v: number | null) =>
  v === null
    ? null
    : v >= 1e9
      ? `$${(v / 1e9).toFixed(2)}B`
      : v >= 1e6
        ? `$${(v / 1e6).toFixed(2)}M`
        : v >= 1e3
          ? `$${(v / 1e3).toFixed(1)}K`
          : `$${v.toFixed(0)}`;

function price(p: number | null): string | null {
  if (p === null || !Number.isFinite(p)) return null;
  if (p >= 1) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  if (p === 0) return "$0";
  // 0.0000123 → $0.0₄123 (subscript zero count, like Dexscreener).
  const zeros = Math.floor(-Math.log10(p));
  if (zeros >= 4) {
    const digits = Math.round(p * 10 ** (zeros + 3));
    const sub = String(zeros).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]!);
    return `$0.0${sub}${digits}`;
  }
  return `$${p.toFixed(zeros + 3)}`;
}

function ageMs(r: RadarRow): number | null {
  return r.pairCreatedAt ? Date.now() - Date.parse(r.pairCreatedAt) : null;
}

function ageText(ms: number | null): string | null {
  if (ms === null || ms < 0) return null;
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 60 ? `${d}d` : `${Math.floor(d / 30)}mo`;
}

function flow(r: RadarRow): number | null {
  if (r.buys24h === null || r.sells24h === null || r.buys24h + r.sells24h === 0) return null;
  return r.buys24h / (r.buys24h + r.sells24h);
}

function sortValue(r: RadarRow, k: SortKey): number | null {
  switch (k) {
    case "age": {
      const a = ageMs(r);
      return a === null ? null : a;
    }
    case "flow":
      return flow(r);
    case "risk":
      return RISK_ORDER[r.verdict];
    default:
      return r[k];
  }
}

function Pct({ v }: { v: number | null }) {
  if (v === null) return <span className="text-dim">—</span>;
  const strength = Math.min(1, Math.abs(v) / 50);
  return (
    <span
      className="rounded-sm px-1"
      style={{
        color: v > 0 ? "var(--color-risk-low)" : v < 0 ? "var(--color-risk-high)" : undefined,
        background:
          v === 0
            ? undefined
            : `color-mix(in srgb, ${v > 0 ? "var(--color-risk-low)" : "var(--color-risk-high)"} ${Math.round(6 + strength * 22)}%, transparent)`,
      }}
    >
      {`${v > 0 ? "+" : ""}${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)}%`}
    </span>
  );
}

export function RadarTable({ rows, labels }: { rows: RadarRow[]; labels: RadarLabels }) {
  const [q, setQ] = useState("");
  const [chain, setChain] = useState<Chain>("all");
  const [risk, setRisk] = useState<RiskFilter>("all");
  const [minLiq, setMinLiq] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>(PRESETS.gainers);

  // Remember the viewer's filters on this device (a convenience; the page works without it).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE);
      if (!raw) return;
      const s = JSON.parse(raw) as Partial<{
        chain: Chain;
        risk: RiskFilter;
        minLiq: number;
        sort: { key: SortKey; dir: 1 | -1 };
      }>;
      if (s.chain) setChain(s.chain);
      if (s.risk) setRisk(s.risk);
      if (typeof s.minLiq === "number" && MIN_LIQ.includes(s.minLiq)) setMinLiq(s.minLiq);
      if (s.sort?.key) setSort(s.sort);
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORE, JSON.stringify({ chain, risk, minLiq, sort }));
    } catch {
      /* storage unavailable */
    }
  }, [chain, risk, minLiq, sort]);

  const counts = useMemo(() => {
    const c: Record<Chain, number> = { all: rows.length, robinhood: 0, base: 0, solana: 0 };
    for (const r of rows) c[r.chainKey]++;
    return c;
  }, [rows]);
  const hasSocial = rows.some((r) => r.socialMomentum !== null);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => chain === "all" || r.chainKey === chain)
      .filter((r) =>
        risk === "all" ? true : risk === "low" ? r.verdict === "low" : r.verdict !== "high",
      )
      .filter((r) => minLiq === 0 || (r.liquidityUsd ?? -1) >= minLiq)
      .filter(
        (r) =>
          !needle ||
          r.address.toLowerCase().includes(needle) ||
          (r.symbol ?? "").toLowerCase().includes(needle) ||
          (r.name ?? "").toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        const av = sortValue(a, sort.key);
        const bv = sortValue(b, sort.key);
        if (av === null && bv === null) return 0;
        if (av === null) return 1; // missing data always last, never treated as 0
        if (bv === null) return -1;
        return (av - bv) * sort.dir;
      });
  }, [rows, q, chain, risk, minLiq, sort]);

  const chip = (active: boolean) =>
    `rounded-sm border px-2 py-1 font-mono text-xs ${
      active
        ? "border-signal bg-signal text-ink"
        : "border-rule text-muted hover:border-signal hover:text-signal"
    }`;
  const activePreset = (Object.keys(PRESETS) as Preset[]).find(
    (p) => PRESETS[p].key === sort.key && PRESETS[p].dir === sort.dir,
  );

  const Th = ({
    k,
    children,
    left = false,
  }: {
    k: SortKey;
    children: React.ReactNode;
    left?: boolean;
  }) => (
    <th
      className={`whitespace-nowrap px-2 py-2 font-normal ${left ? "text-left" : "text-right"}`}
      aria-sort={sort.key === k ? (sort.dir === -1 ? "descending" : "ascending") : undefined}
    >
      <button
        type="button"
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (-s.dir as 1 | -1) : -1 }))}
        className={`label hover:text-paper ${sort.key === k ? "text-signal" : ""}`}
      >
        {children} {sort.key === k ? (sort.dir === -1 ? "↓" : "↑") : ""}
      </button>
    </th>
  );
  const nd = <span className="text-dim">{labels.noData}</span>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="sort presets">
        {(Object.keys(PRESETS) as Preset[]).map((p) => (
          <button
            key={p}
            type="button"
            className={chip(activePreset === p)}
            onClick={() => setSort(PRESETS[p])}
            data-testid={`radar-preset-${p}`}
          >
            {labels.presets[p]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={labels.network}>
          {(["all", "robinhood", "base", "solana"] as Chain[]).map((c) => (
            <button
              key={c}
              type="button"
              className={chip(chain === c)}
              onClick={() => setChain(c)}
              disabled={c !== "all" && counts[c] === 0}
            >
              {c === "all"
                ? labels.allChains
                : c === "robinhood"
                  ? "Robinhood"
                  : c === "base"
                    ? "Base"
                    : "Solana"}{" "}
              <span className="opacity-60">{counts[c]}</span>
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.filter}
          className="h-9 min-w-0 flex-1 rounded border border-rule bg-ink/70 px-3 text-sm"
          aria-label={labels.filter}
        />
        <div className="flex gap-2">
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value as RiskFilter)}
            className="h-9 rounded border border-rule bg-ink px-2 text-sm text-paper"
            aria-label={labels.risk}
          >
            {(["all", "no-high", "low"] as RiskFilter[]).map((v) => (
              <option key={v} value={v}>
                {labels.riskFilter[v]}
              </option>
            ))}
          </select>
          <select
            value={minLiq}
            onChange={(e) => setMinLiq(Number(e.target.value))}
            className="h-9 rounded border border-rule bg-ink px-2 text-sm text-paper"
            aria-label={labels.minLiquidity}
          >
            {MIN_LIQ.map((v) => (
              <option key={v} value={v}>
                {labels.minLiquidity}: {v === 0 ? labels.any : `≥ ${usd(v)}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="font-mono text-xs text-dim">
        {labels.shown}: {view.length} / {rows.length}
        {rows.some((r) => r.live) && (
          <>
            {" · "}
            <span className="text-signal">●</span> {labels.live}
          </>
        )}
      </p>

      {view.length === 0 ? (
        <p className="panel p-4 text-sm text-muted">{labels.empty}</p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm" data-testid="radar-table">
            <thead>
              <tr className="border-b border-rule">
                <th className="label sticky left-0 z-10 bg-panel px-2 py-2 text-left font-normal">
                  {labels.token}
                </th>
                <Th k="priceUsd">{labels.price}</Th>
                <Th k="change5m">5m</Th>
                <Th k="change1h">1h</Th>
                <Th k="change6h">6h</Th>
                <Th k="change24h">24h</Th>
                <Th k="volume24hUsd">{labels.volume}</Th>
                <Th k="liquidityUsd">{labels.liquidity}</Th>
                <Th k="marketCapUsd">{labels.marketCap}</Th>
                <Th k="flow">{labels.flow}</Th>
                <Th k="age">{labels.age}</Th>
                <Th k="risk">{labels.risk}</Th>
                <Th k="contractSafety">{labels.contract}</Th>
                {hasSocial && <Th k="socialMomentum">{labels.social}</Th>}
              </tr>
            </thead>
            <tbody>
              {view.map((r, i) => {
                const f = flow(r);
                return (
                  <tr
                    key={r.address}
                    className={`group border-t border-rule/60 hover:bg-ink/40 ${r.stale && !r.live ? "opacity-70" : ""}`}
                  >
                    <td className="sticky left-0 z-10 bg-panel px-2 py-2 group-hover:bg-ink">
                      <div className="flex items-center gap-2">
                        <span className="w-6 shrink-0 text-right font-mono text-[0.65rem] text-dim">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/token/${r.address}`}
                            className="font-medium hover:text-signal"
                          >
                            {r.symbol ?? r.address.slice(0, 10)}
                          </Link>{" "}
                          <span className="rounded-sm border border-rule px-1 font-mono text-[0.6rem] text-dim">
                            {CHAIN_SHORT[r.chainKey]}
                          </span>
                          <div className="max-w-[11rem] truncate text-xs text-dim">{r.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num whitespace-nowrap px-2 py-2 text-right">
                      {price(r.priceUsd) ?? nd}
                    </td>
                    <td className="num px-2 py-2 text-right text-xs">
                      <Pct v={r.change5m} />
                    </td>
                    <td className="num px-2 py-2 text-right text-xs">
                      <Pct v={r.change1h} />
                    </td>
                    <td className="num px-2 py-2 text-right text-xs">
                      <Pct v={r.change6h} />
                    </td>
                    <td className="num px-2 py-2 text-right text-xs">
                      <Pct v={r.change24h} />
                    </td>
                    <td className="num px-2 py-2 text-right">{usd(r.volume24hUsd) ?? nd}</td>
                    <td className="num px-2 py-2 text-right">{usd(r.liquidityUsd) ?? nd}</td>
                    <td className="num px-2 py-2 text-right">{usd(r.marketCapUsd) ?? nd}</td>
                    <td className="px-2 py-2 text-right">
                      {f === null ? (
                        nd
                      ) : (
                        <div className="ml-auto w-20" title={`${r.buys24h} / ${r.sells24h}`}>
                          <div className="num text-[0.65rem] text-muted">
                            {r.buys24h} / {r.sells24h}
                          </div>
                          <div className="mt-0.5 flex h-1 overflow-hidden rounded-sm">
                            <div
                              style={{ width: `${f * 100}%`, background: "var(--color-risk-low)" }}
                            />
                            <div
                              style={{
                                width: `${(1 - f) * 100}%`,
                                background: "var(--color-risk-high)",
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="num px-2 py-2 text-right text-xs text-muted">
                      {ageText(ageMs(r)) ?? nd}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <span
                        className="whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[0.65rem]"
                        style={{
                          borderColor: LEVEL_COLOR[r.verdict],
                          color: LEVEL_COLOR[r.verdict],
                        }}
                      >
                        {labels.levels[r.verdict]}
                      </span>
                    </td>
                    <td className="num px-2 py-2 text-right">{r.contractSafety ?? nd}</td>
                    {hasSocial && (
                      <td
                        className="num px-2 py-2 text-right"
                        style={{ color: "var(--color-signal)" }}
                      >
                        {r.socialMomentum ?? nd}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
