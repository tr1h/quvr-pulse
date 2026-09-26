"use client";

import {
  FIB_LEVELS,
  changePct,
  fibPrice,
  formatDuration,
  formatPct,
  riskReward,
  type Drawing,
  type Pt,
} from "@/lib/chart-drawings";

export type DrawingLabels = {
  long: string;
  short: string;
  target: string;
  stop: string;
  wrongStop: string;
  bars: string;
};

type XY = { x: number; y: number };

const C = {
  bg: "#161714",
  up: "#5ec8c0",
  down: "#ff5a3c",
  signal: "#ffb000",
  line: "#ece6d6",
  muted: "#9a9585",
};

const FIB_COLORS: Record<number, string> = {
  0: C.muted,
  0.236: "#ff5a3c",
  0.382: "#ffb000",
  0.5: "#ece6d6",
  0.618: "#5ec8c0",
  0.786: "#7aa2ff",
  1: C.muted,
  1.618: "#b48cff",
};

/** Text readable over candles: dark outline behind the glyphs. */
function Label({
  x,
  y,
  children,
  fill = C.line,
  anchor = "start",
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  fill?: string;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <text
      x={x}
      y={y}
      fill={fill}
      fontSize={10}
      textAnchor={anchor}
      stroke={C.bg}
      strokeWidth={3}
      paintOrder="stroke"
      style={{ fontFamily: "var(--font-plex-mono), ui-monospace, monospace" }}
    >
      {children}
    </text>
  );
}

/**
 * SVG layer over the price pane. Drawings are projected on every render, so the parent only
 * has to re-render when the chart view changes (scroll, zoom, price-scale drag, resize).
 */
export function ChartDrawings({
  drawings,
  preview,
  project,
  logicalOf,
  width,
  height,
  fmtPrice,
  labels,
}: {
  drawings: Drawing[];
  preview: Drawing | null;
  project: (pt: Pt) => XY | null;
  logicalOf: (t: number) => number;
  width: number;
  height: number;
  fmtPrice: (p: number) => string;
  labels: DrawingLabels;
}) {
  if (width <= 0 || height <= 0) return null;
  const list = preview ? [...drawings, preview] : drawings;

  const render = (d: Drawing) => {
    const ghost = d === preview;
    const op = ghost ? 0.7 : 1;
    if (d.kind === "hline") return null; // native price lines (axis labels) handle these

    if (d.kind === "trend") {
      const a = project(d.a);
      const b = project(d.b);
      if (!a || !b) return null;
      return (
        <g key={d.id} opacity={op}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.signal} strokeWidth={1.5} />
          <circle cx={a.x} cy={a.y} r={3} fill={C.signal} />
          <circle cx={b.x} cy={b.y} r={3} fill={C.signal} />
        </g>
      );
    }

    if (d.kind === "ruler") {
      const a = project(d.a);
      const b = project(d.b);
      if (!a || !b) return null;
      const pct = changePct(d.a.p, d.b.p);
      const up = d.b.p >= d.a.p;
      const color = up ? C.up : C.down;
      const bars = Math.round(logicalOf(d.b.t) - logicalOf(d.a.t));
      const text = `${pct === null ? "—" : formatPct(pct)} · ${Math.abs(bars)} ${labels.bars} · ${formatDuration(d.b.t - d.a.t)}`;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      return (
        <g key={d.id} opacity={op}>
          <rect
            x={x}
            y={y}
            width={Math.abs(b.x - a.x)}
            height={Math.abs(b.y - a.y)}
            fill={color}
            fillOpacity={0.15}
            stroke={color}
            strokeOpacity={0.6}
          />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeDasharray="4 3" />
          <Label
            x={(a.x + b.x) / 2}
            y={up ? y - 6 : y + Math.abs(b.y - a.y) + 14}
            anchor="middle"
            fill={color}
          >
            {text}
          </Label>
        </g>
      );
    }

    if (d.kind === "fib") {
      const a = project(d.a);
      const b = project(d.b);
      if (!a || !b) return null;
      let x1 = Math.min(a.x, b.x);
      let x2 = Math.max(a.x, b.x);
      if (x2 - x1 < 120) x2 = x1 + 120;
      if (x2 > width) {
        x1 = Math.max(0, x1 - (x2 - width));
        x2 = width;
      }
      return (
        <g key={d.id} opacity={op}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.muted} strokeDasharray="3 3" />
          {FIB_LEVELS.map((lv) => {
            const price = fibPrice(d.a.p, d.b.p, lv);
            const p = project({ t: d.b.t, p: price });
            if (!p) return null;
            const color = FIB_COLORS[lv] ?? C.line;
            return (
              <g key={lv}>
                <line x1={x1} y1={p.y} x2={x2} y2={p.y} stroke={color} strokeWidth={1} />
                <Label x={x1 + 3} y={p.y - 3} fill={color}>
                  {`${lv} · ${fmtPrice(price)}`}
                </Label>
              </g>
            );
          })}
        </g>
      );
    }

    // Risk / reward position.
    if (d.kind !== "rr") return null;
    const e = project(d.entry);
    const s = project(d.stop);
    const tg = project(d.target);
    if (!e || !s || !tg) return null;
    const rr = riskReward(d.entry.p, d.stop.p, d.target.p);
    let x1 = e.x;
    let x2 = Math.max(s.x, tg.x);
    if (x2 - x1 < 140) x2 = x1 + 140;
    // Keep the box (and its labels) inside the pane for positions on the newest candles.
    if (x2 > width) {
      x1 = Math.max(0, Math.min(x1, width - 140));
      x2 = width;
    }
    const w = x2 - x1;
    const box = (yA: number, yB: number, color: string) => (
      <rect
        x={x1}
        y={Math.min(yA, yB)}
        width={w}
        height={Math.abs(yB - yA)}
        fill={color}
        fillOpacity={0.18}
        stroke={color}
        strokeOpacity={0.5}
      />
    );
    const title = rr.invalid
      ? labels.wrongStop
      : `${rr.side === "long" ? labels.long : labels.short} · R/R ${rr.ratio === null ? "—" : rr.ratio.toFixed(2)}`;
    const targetChange = changePct(d.entry.p, d.target.p);
    const stopChange = changePct(d.entry.p, d.stop.p);
    return (
      <g key={d.id} opacity={op}>
        {d.target.p !== d.entry.p && box(e.y, tg.y, C.up)}
        {box(e.y, s.y, C.down)}
        <line x1={x1} y1={e.y} x2={x2} y2={e.y} stroke={C.line} strokeWidth={1.5} />
        <Label x={x1 + 4} y={e.y - 5} fill={rr.invalid ? C.down : C.line}>
          {`${title} · ${fmtPrice(d.entry.p)}`}
        </Label>
        {d.target.p !== d.entry.p && (
          <Label x={x1 + 4} y={tg.y + (tg.y < e.y ? 13 : -5)} fill={C.up}>
            {`${labels.target} ${targetChange === null ? "" : formatPct(targetChange)} · ${fmtPrice(d.target.p)}`}
          </Label>
        )}
        <Label x={x1 + 4} y={s.y + (s.y < e.y ? 13 : -5)} fill={C.down}>
          {`${labels.stop} ${stopChange === null ? "" : formatPct(stopChange)} · ${fmtPrice(d.stop.p)}`}
        </Label>
      </g>
    );
  };

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 z-[3]"
      width={width}
      height={height}
      aria-hidden="true"
      data-testid="chart-drawings"
    >
      {list.map(render)}
    </svg>
  );
}
