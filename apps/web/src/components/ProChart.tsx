"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  type IChartApi,
  type Logical,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import { ChartDrawings, type DrawingLabels } from "@/components/ChartDrawings";
import {
  MAX_DRAWINGS,
  TOOL_POINTS,
  logicalToTime,
  makeDrawing,
  parseDrawings,
  timeToLogical,
  type Drawing,
  type Pt,
  type Tool,
} from "@/lib/chart-drawings";

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
type Tf = "5m" | "15m" | "1h" | "4h" | "1D";
const TFS: Tf[] = ["5m", "15m", "1h", "4h", "1D"];

export type ProChartLabels = {
  loading: string;
  noData: string;
  error: string;
  ma: string;
  ema: string;
  volume: string;
  log: string;
  clear: string;
  undo: string;
  magnet: string;
  magnetHint: string;
  esc: string;
  tools: Record<Exclude<Tool, "none">, string>;
  /** Hint for each click of a tool, in order. */
  steps: Record<Exclude<Tool, "none">, string[]>;
  drawing: DrawingLabels;
  fit: string;
  fullscreen: string;
  openDex: string;
};

const C = {
  bg: "#161714",
  grid: "#23241f",
  text: "#9a9585",
  up: "#5ec8c0",
  down: "#ff5a3c",
  signal: "#ffb000",
  ema: "#b48cff",
  line: "#ece6d6",
};

const TOOL_ICONS: Record<Exclude<Tool, "none">, string> = {
  hline: "─",
  trend: "╱",
  fib: "≡",
  rr: "⇅",
  ruler: "⟷",
};
const TOOL_ORDER: Array<Exclude<Tool, "none">> = ["hline", "trend", "fib", "rr", "ruler"];
const storageKey = (address: string) => `quvr:chart-drawings:v1:${address.toLowerCase()}`;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Price formatter for anything from $0.00000001 to $1,000,000 (memecoins need many decimals). */
function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return "";
  const a = Math.abs(p);
  if (a === 0) return "0";
  if (a >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 1) return p.toFixed(4);
  const decimals = Math.min(12, Math.ceil(-Math.log10(a)) + 3);
  return p.toFixed(decimals);
}

function sma(cs: Candle[], n: number) {
  const out: Array<{ time: UTCTimestamp; value: number }> = [];
  let sum = 0;
  cs.forEach((c, i) => {
    sum += c.c;
    if (i >= n) sum -= cs[i - n]!.c;
    if (i >= n - 1) out.push({ time: (c.t / 1000) as UTCTimestamp, value: sum / n });
  });
  return out;
}

function ema(cs: Candle[], n: number) {
  const out: Array<{ time: UTCTimestamp; value: number }> = [];
  const k = 2 / (n + 1);
  let prev: number | null = null;
  cs.forEach((c, i) => {
    prev = prev === null ? c.c : c.c * k + prev * (1 - k);
    if (i >= n - 1) out.push({ time: (c.t / 1000) as UTCTimestamp, value: prev });
  });
  return out;
}

export function ProChart({
  address,
  dexUrl,
  labels,
  initial,
}: {
  address: string;
  dexUrl: string | null;
  labels: ProChartLabels;
  /** Cached 15m candles rendered with the page, so the chart appears without a round trip. */
  initial?: Candle[] | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const series = useRef<{
    candles: ISeriesApi<"Candlestick">;
    volume: ISeriesApi<"Histogram">;
    ma: ISeriesApi<"Line">;
    ema: ISeriesApi<"Line">;
  } | null>(null);
  const lines = useRef<IPriceLine[]>([]);
  const toolRef = useRef<Tool>("none");
  const draftRef = useRef<Pt[]>([]);
  const magnetRef = useRef(true);
  const timesRef = useRef<number[]>([]);
  const barsRef = useRef<Candle[]>([]);

  const [tf, setTf] = useState<Tf>("15m");
  const [status, setStatus] = useState<"loading" | "ok" | "empty" | "error">("loading");
  const [showMa, setShowMa] = useState(true);
  const [showEma, setShowEma] = useState(false);
  const [showVol, setShowVol] = useState(true);
  const [log, setLog] = useState(false);
  const [tool, setTool] = useState<Tool>("none");
  const [pool, setPool] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [magnet, setMagnet] = useState(true);
  const [pane, setPane] = useState({ w: 0, h: 0 });
  const [, setView] = useState(0);
  const savedFor = useRef<string | null>(null);

  // Create the chart once.
  useEffect(() => {
    if (!box.current) return;
    const chart = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: C.bg },
        textColor: C.text,
        fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
        fontSize: 11,
      },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: C.grid },
      // Free space right of the last candle for targets and risk/reward boxes.
      timeScale: { borderColor: C.grid, timeVisible: true, secondsVisible: false, rightOffset: 12 },
      localization: { priceFormatter: fmtPrice },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: C.up,
      downColor: C.down,
      wickUpColor: C.up,
      wickDownColor: C.down,
      borderVisible: false,
      priceFormat: { type: "custom", formatter: fmtPrice, minMove: 1e-12 },
    });
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.26 } });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const common = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false };
    const ma = chart.addSeries(LineSeries, { ...common, color: C.signal });
    const e = chart.addSeries(LineSeries, { ...common, color: C.ema });
    chartRef.current = chart;
    series.current = { candles, volume, ma, ema: e };

    // Pixel → (time, price). The library maps only whole bars, so fractional positions are
    // interpolated from the spacing between bars 0 and 1.
    const pointAt = (x: number, y: number): Pt | null => {
      const times = timesRef.current;
      const x0 = chart.timeScale().logicalToCoordinate(0 as Logical);
      const x1 = chart.timeScale().logicalToCoordinate(1 as Logical);
      const price = candles.coordinateToPrice(y);
      if (!times.length || x0 === null || x1 === null || x1 === x0 || price === null) return null;
      const l = (x - x0) / (x1 - x0);
      let pt: Pt = { t: logicalToTime(times, l), p: price };
      if (magnetRef.current) {
        // Snap to the nearest open/high/low/close of the bar under the cursor.
        const i = Math.round(l);
        const bar = barsRef.current[i];
        if (bar) {
          let best: { v: number; d: number } | null = null;
          for (const v of [bar.o, bar.h, bar.l, bar.c]) {
            const yy = candles.priceToCoordinate(v);
            if (yy === null) continue;
            const d = Math.abs(yy - y);
            if (d < 14 && (!best || d < best.d)) best = { v, d };
          }
          if (best) pt = { t: times[i]!, p: best.v };
        }
      }
      return pt;
    };
    // Clicks come from native pointer events: the library drops a second click that lands
    // within 500 ms elsewhere (double-click detection), which breaks quick two-point drawings.
    const place = (x: number, y: number) => {
      const tl = toolRef.current;
      if (tl === "none") return;
      if (x < 0 || y < 0 || x > chart.timeScale().width() || y > chart.paneSize(0).height) return;
      const pt = pointAt(x, y);
      if (!pt) return;
      const pts = [...draftRef.current, pt];
      if (pts.length >= TOOL_POINTS[tl]) {
        const d = makeDrawing(tl, pts, newId());
        if (d) setDrawings((prev) => [...prev, d].slice(-MAX_DRAWINGS));
        draftRef.current = [];
        setDraft([]);
        setHover(null);
        toolRef.current = "none";
        setTool("none");
      } else {
        draftRef.current = pts;
        setDraft(pts);
      }
    };
    const onMove = (p: MouseEventParams) => {
      if (toolRef.current === "none" || !draftRef.current.length) return;
      setHover(p.point ? pointAt(p.point.x, p.point.y) : null);
    };
    const el = box.current;
    let down: { x: number; y: number } | null = null;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      down = e.button === 0 ? local(e) : null;
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const p = local(e);
      // A drag pans the chart; only a still press places a point.
      if (Math.hypot(p.x - down.x, p.y - down.y) < 6) place(p.x, p.y);
      down = null;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    chart.subscribeCrosshairMove(onMove);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      series.current = null;
      lines.current = [];
    };
  }, []);

  // Candles already seen in this visit, per timeframe: switching back is instant.
  const seen = useRef(new Map<Tf, Candle[]>(initial?.length ? [["15m", initial]] : []));

  const apply = useCallback((cs: Candle[], fit: boolean) => {
    const s = series.current;
    if (!s || !cs.length) return;
    timesRef.current = cs.map((c) => c.t / 1000);
    barsRef.current = cs;
    setView((v) => v + 1);
    s.candles.setData(
      cs.map((c) => ({
        time: (c.t / 1000) as UTCTimestamp,
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
      })),
    );
    s.volume.setData(
      cs.map((c) => ({
        time: (c.t / 1000) as UTCTimestamp,
        value: c.v,
        color: c.c >= c.o ? "rgba(94,200,192,0.35)" : "rgba(255,90,60,0.35)",
      })),
    );
    s.ma.setData(sma(cs, 20));
    s.ema.setData(ema(cs, 50));
    setStatus("ok");
    if (fit) chartRef.current?.timeScale().fitContent();
  }, []);

  const load = useCallback(
    async (fit: boolean): Promise<boolean> => {
      try {
        const res = await fetch(`/api/candles/${encodeURIComponent(address)}?tf=${tf}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as { candles: Candle[]; pool: string | null };
        setPool(j.pool);
        const cs = j.candles ?? [];
        if (!cs.length) {
          setStatus((prev) => (prev === "ok" ? "ok" : "empty"));
          return true;
        }
        seen.current.set(tf, cs);
        apply(cs, fit);
        return true;
      } catch {
        setStatus((prev) => (prev === "ok" ? "ok" : "error"));
        return false;
      }
    },
    [address, tf, apply],
  );

  // On timeframe change: show what we already have at once, then refresh. Afterwards refresh
  // once a minute while the tab is visible (the price source has a tight shared quota); after a
  // failure with nothing on screen, retry sooner.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const cached = seen.current.get(tf);
    if (cached) apply(cached, true);
    else setStatus("loading");
    const tick = async (fit: boolean) => {
      const ok = document.hidden ? true : await load(fit);
      if (!stopped) timer = setTimeout(() => void tick(false), ok ? 60_000 : 20_000);
    };
    void tick(!cached);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [tf, load, apply]);

  useEffect(() => {
    series.current?.ma.applyOptions({ visible: showMa });
  }, [showMa]);
  useEffect(() => {
    series.current?.ema.applyOptions({ visible: showEma });
  }, [showEma]);
  useEffect(() => {
    series.current?.volume.applyOptions({ visible: showVol });
  }, [showVol]);
  useEffect(() => {
    chartRef.current
      ?.priceScale("right")
      .applyOptions({ mode: log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
  }, [log]);
  useEffect(() => {
    toolRef.current = tool;
    draftRef.current = [];
    setDraft([]);
    setHover(null);
  }, [tool]);
  useEffect(() => {
    magnetRef.current = magnet;
  }, [magnet]);

  // Drawings are remembered per token in this browser only (a viewer convenience).
  useEffect(() => {
    savedFor.current = null;
    let saved: Drawing[] = [];
    try {
      const raw = window.localStorage.getItem(storageKey(address));
      saved = raw ? parseDrawings(JSON.parse(raw)) : [];
    } catch {
      saved = [];
    }
    setDrawings(saved);
  }, [address]);
  useEffect(() => {
    // Skip the first run after loading: it still sees the previous token's drawings.
    if (savedFor.current !== address) {
      savedFor.current = address;
      return;
    }
    try {
      if (drawings.length)
        window.localStorage.setItem(storageKey(address), JSON.stringify(drawings));
      else window.localStorage.removeItem(storageKey(address));
    } catch {
      /* storage unavailable: drawings live for this visit only */
    }
  }, [address, drawings]);

  // Horizontal levels use native price lines (they get labels on the price axis).
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    for (const l of lines.current) s.candles.removePriceLine(l);
    lines.current = drawings.flatMap((d) =>
      d.kind === "hline"
        ? [
            s.candles.createPriceLine({
              price: d.p,
              color: C.line,
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: "",
            }),
          ]
        : [],
    );
  }, [drawings]);

  // Re-project the SVG drawings whenever the view changes (scroll, zoom, axis drag, resize).
  const hasShapes = drawings.some((d) => d.kind !== "hline") || draft.length > 0;
  useEffect(() => {
    if (!hasShapes) return;
    let raf = 0;
    let last = "";
    const tick = () => {
      const chart = chartRef.current;
      const s = series.current;
      if (chart && s) {
        const r = chart.timeScale().getVisibleLogicalRange();
        const w = chart.timeScale().width();
        const h = chart.paneSize(0).height;
        const ref = barsRef.current.at(-1)?.c ?? 1;
        const sig = `${r?.from}|${r?.to}|${w}|${h}|${s.candles.priceToCoordinate(ref)}|${s.candles.priceToCoordinate(ref * 1.5)}`;
        if (sig !== last) {
          last = sig;
          setPane((p) => (p.w === w && p.h === h ? p : { w, h }));
          setView((v) => v + 1);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasShapes]);

  // Esc cancels the current tool.
  useEffect(() => {
    if (tool === "none") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTool("none");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool]);

  const project = (pt: Pt) => {
    const chart = chartRef.current;
    const s = series.current;
    if (!chart || !s) return null;
    const x0 = chart.timeScale().logicalToCoordinate(0 as Logical);
    const x1 = chart.timeScale().logicalToCoordinate(1 as Logical);
    const y = s.candles.priceToCoordinate(pt.p);
    const l = timeToLogical(timesRef.current, pt.t);
    if (x0 === null || x1 === null || y === null || !Number.isFinite(l)) return null;
    return { x: x0 + l * (x1 - x0), y };
  };
  const preview =
    tool !== "none" && draft.length && hover
      ? tool === "rr" && draft.length === 1
        ? makeDrawing("rr", [draft[0]!, hover, draft[0]!], "preview")
        : makeDrawing(tool, [...draft, hover], "preview")
      : null;
  const stepHint = tool !== "none" ? (labels.steps[tool][draft.length] ?? "") : "";

  const btn = (active: boolean) =>
    `rounded-sm border px-2 py-0.5 ${
      active
        ? "border-signal bg-signal text-ink"
        : "border-rule text-muted hover:border-signal hover:text-signal"
    }`;

  return (
    <div ref={wrap} className="bg-panel" data-testid="pro-chart">
      <div className="mb-2 flex flex-wrap items-center gap-1 font-mono text-xs">
        {TFS.map((f) => (
          <button key={f} type="button" className={btn(f === tf)} onClick={() => setTf(f)}>
            {f}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-rule" aria-hidden="true" />
        <button type="button" className={btn(showMa)} onClick={() => setShowMa((v) => !v)}>
          {labels.ma}
        </button>
        <button type="button" className={btn(showEma)} onClick={() => setShowEma((v) => !v)}>
          {labels.ema}
        </button>
        <button type="button" className={btn(showVol)} onClick={() => setShowVol((v) => !v)}>
          {labels.volume}
        </button>
        <button type="button" className={btn(log)} onClick={() => setLog((v) => !v)}>
          {labels.log}
        </button>
        <span className="mx-1 h-4 w-px bg-rule" aria-hidden="true" />
        {TOOL_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            className={btn(tool === k)}
            onClick={() => setTool((t) => (t === k ? "none" : k))}
            title={labels.steps[k][0]}
            aria-pressed={tool === k}
            data-testid={`tool-${k}`}
          >
            {TOOL_ICONS[k]} {labels.tools[k]}
          </button>
        ))}
        <button
          type="button"
          className={btn(magnet)}
          onClick={() => setMagnet((v) => !v)}
          title={labels.magnetHint}
          aria-pressed={magnet}
        >
          ⊙ {labels.magnet}
        </button>
        {drawings.length > 0 && (
          <>
            <button
              type="button"
              className={btn(false)}
              onClick={() => setDrawings((prev) => prev.slice(0, -1))}
              data-testid="tool-undo"
            >
              ↶ {labels.undo}
            </button>
            <button
              type="button"
              className={btn(false)}
              onClick={() => setDrawings([])}
              data-testid="tool-clear"
            >
              ✕ {labels.clear} ({drawings.length})
            </button>
          </>
        )}
        <button
          type="button"
          className={btn(false)}
          onClick={() => chartRef.current?.timeScale().fitContent()}
        >
          ⤢ {labels.fit}
        </button>
        <button
          type="button"
          className={btn(false)}
          onClick={() => void wrap.current?.requestFullscreen?.().catch(() => undefined)}
        >
          ⛶ {labels.fullscreen}
        </button>
      </div>
      {tool !== "none" && (
        <p className="mb-1 text-xs text-signal" data-testid="tool-hint">
          {stepHint} <span className="text-dim">· {labels.esc}</span>
        </p>
      )}
      <div className="relative">
        <div
          ref={box}
          className={`h-[380px] w-full sm:h-[500px] ${tool !== "none" ? "cursor-crosshair" : ""}`}
        />
        {status === "ok" && hasShapes && (
          <ChartDrawings
            drawings={drawings}
            preview={preview}
            project={project}
            logicalOf={(t) => timeToLogical(timesRef.current, t)}
            width={pane.w}
            height={pane.h}
            fmtPrice={fmtPrice}
            labels={labels.drawing}
          />
        )}
        {status !== "ok" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            {status === "loading"
              ? labels.loading
              : status === "empty"
                ? labels.noData
                : labels.error}
          </div>
        )}
      </div>
      <div className="mt-1 flex flex-wrap justify-between gap-2 font-mono text-[0.6rem] text-dim">
        <span>geckoterminal{pool ? ` · ${pool}` : ""} · TradingView Lightweight Charts</span>
        {dexUrl && (
          <a
            href={dexUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline decoration-dotted hover:text-signal"
          >
            {labels.openDex} ↗
          </a>
        )}
      </div>
    </div>
  );
}
