/** Dependency-free SVG candlestick chart with volume (server-rendered, no client JS). */
export type ChartCandle = { t: number; o: number; h: number; l: number; c: number; v: number };

const UP = "var(--color-risk-low)";
const DOWN = "var(--color-risk-high)";

export function CandleChart({
  candles,
  format,
  label,
  height = 260,
}: {
  candles: ChartCandle[];
  format: (v: number) => string;
  label: string;
  height?: number;
}) {
  const W = 720;
  const H = height;
  const pad = { l: 4, r: 64, t: 10, b: 20 };
  const volH = Math.round(H * 0.18);
  const priceBottom = H - pad.b - volH - 6;
  const lo = Math.min(...candles.map((c) => c.l));
  const hi = Math.max(...candles.map((c) => c.h));
  const span = hi - lo || hi * 0.02 || 1;
  const v0 = lo - span * 0.04;
  const v1 = hi + span * 0.04;
  const maxVol = Math.max(...candles.map((c) => c.v), 1);
  const step = (W - pad.l - pad.r) / candles.length;
  const bodyW = Math.max(1, step * 0.66);
  const x = (i: number) => pad.l + step * i + step / 2;
  const y = (v: number) => pad.t + (1 - (v - v0) / (v1 - v0)) * (priceBottom - pad.t);
  const first = candles[0]!;
  const last = candles[candles.length - 1]!;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => v0 + (v1 - v0) * (1 - f));
  const fmtTime = (t: number) => new Date(t).toISOString().slice(5, 16).replace("T", " ");
  const change = (last.c - first.o) / first.o;

  return (
    <figure className="w-full" data-testid="candle-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--color-rule)"
              strokeDasharray="2 4"
            />
            <text
              x={W - pad.r + 6}
              y={y(v) + 3}
              fill="var(--color-dim)"
              fontSize="10"
              fontFamily="var(--font-mono)"
            >
              {format(v)}
            </text>
          </g>
        ))}
        {candles.map((c, i) => {
          const color = c.c >= c.o ? UP : DOWN;
          const top = y(Math.max(c.o, c.c));
          const bh = Math.max(1, Math.abs(y(c.o) - y(c.c)));
          const vh = (c.v / maxVol) * volH;
          return (
            <g key={c.t}>
              <rect
                x={x(i) - bodyW / 2}
                y={H - pad.b - vh}
                width={bodyW}
                height={vh}
                fill={color}
                opacity="0.25"
              />
              <line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth="1" />
              <rect x={x(i) - bodyW / 2} y={top} width={bodyW} height={bh} fill={color} />
            </g>
          );
        })}
        <line
          x1={pad.l}
          x2={W - pad.r}
          y1={y(last.c)}
          y2={y(last.c)}
          stroke="var(--color-signal)"
          strokeWidth="0.8"
          strokeDasharray="3 3"
        />
        <rect
          x={W - pad.r + 2}
          y={y(last.c) - 8}
          width={pad.r - 2}
          height={16}
          fill="var(--color-signal)"
        />
        <text
          x={W - pad.r + 6}
          y={y(last.c) + 4}
          fill="var(--color-ink)"
          fontSize="10"
          fontWeight="600"
          fontFamily="var(--font-mono)"
        >
          {format(last.c)}
        </text>
        <text
          x={pad.l}
          y={H - 5}
          fill="var(--color-dim)"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          {fmtTime(first.t)} UTC
        </text>
        <text
          x={W - pad.r}
          y={H - 5}
          textAnchor="end"
          fill="var(--color-dim)"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          {fmtTime(last.t)} UTC
        </text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap justify-between gap-2 font-mono text-[0.65rem] text-dim">
        <span>
          min {format(lo)} · max {format(hi)}
        </span>
        <span style={{ color: change >= 0 ? UP : DOWN }}>
          {change >= 0 ? "+" : ""}
          {(change * 100).toFixed(1)}%
        </span>
      </figcaption>
    </figure>
  );
}
