/** Dependency-free SVG line chart (server-rendered, no client JS). */
export function LineChart({
  points,
  color = "var(--color-signal)",
  height = 140,
  format,
  label,
}: {
  points: Array<{ t: number; v: number }>;
  color?: string;
  height?: number;
  format: (v: number) => string;
  label: string;
}) {
  const W = 600;
  const H = height;
  const pad = { l: 4, r: 4, t: 12, b: 18 };
  const ts = points.map((p) => p.t);
  const vs = points.map((p) => p.v);
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  let v0 = Math.min(...vs);
  let v1 = Math.max(...vs);
  if (v0 === v1) {
    v0 *= 0.98;
    v1 *= 1.02;
  }
  const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - v0) / (v1 - v0)) * (H - pad.t - pad.b);
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join("");
  const area = `${d}L${x(t1).toFixed(1)},${H - pad.b}L${x(t0).toFixed(1)},${H - pad.b}Z`;
  const last = points[points.length - 1]!;
  const fmtTime = (t: number) => new Date(t).toISOString().slice(5, 16).replace("T", " ");
  const gid = `g${Math.abs(label.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7))}`;
  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.25" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad.l}
            x2={W - pad.r}
            y1={pad.t + f * (H - pad.t - pad.b)}
            y2={pad.t + f * (H - pad.t - pad.b)}
            stroke="var(--color-rule)"
            strokeDasharray="2 4"
          />
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={x(last.t)} cy={y(last.v)} r="3" fill={color} />
        <text
          x={pad.l}
          y={H - 4}
          fill="var(--color-dim)"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          {fmtTime(t0)} UTC
        </text>
        <text
          x={W - pad.r}
          y={H - 4}
          textAnchor="end"
          fill="var(--color-dim)"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          {fmtTime(t1)} UTC
        </text>
      </svg>
      <figcaption className="mt-1 flex justify-between font-mono text-[0.65rem] text-dim">
        <span>min {format(v0)}</span>
        <span>max {format(v1)}</span>
        <span className="text-paper">{format(last.v)}</span>
      </figcaption>
    </figure>
  );
}
