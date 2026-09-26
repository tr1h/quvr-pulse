import { ImageResponse } from "next/og";
import { getTokenReport } from "@quvr/services";
import { riskVerdict } from "@quvr/scoring";
import { formatUsd, tokenRefSchema, type ScoreResult, type TokenReport } from "@quvr/shared";
import { OG, OG_SIZE, OgFrame } from "@/lib/og";
import { siteUrl } from "@/lib/seo";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "QUVR Pulse token risk report";

const LEVEL: Record<string, { text: string; color: string }> = {
  low: { text: "Low detected risk", color: OG.low },
  elevated: { text: "Elevated risk", color: OG.elevated },
  high: { text: "High risk", color: OG.high },
  insufficient: { text: "Insufficient data", color: OG.none },
};
const NAMES: Array<[keyof TokenReport["scores"], string]> = [
  ["contractSafety", "Contract"],
  ["liquidityHealth", "Liquidity"],
  ["distributionHealth", "Distribution"],
  ["socialMomentum", "Social"],
];

function Score({ label, s }: { label: string; s: ScoreResult }) {
  const color = s.key === "socialMomentum" ? OG.signal : (LEVEL[s.level]?.color ?? OG.muted);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        background: OG.panel,
        border: `2px solid ${OG.rule}`,
        padding: "18px 22px",
        marginRight: 16,
      }}
    >
      <div style={{ display: "flex", fontSize: 22, color: OG.muted }}>{label}</div>
      <div style={{ display: "flex", fontSize: 60, fontWeight: 700, color }}>
        {String(s.value ?? "—")}
      </div>
      <div style={{ display: "flex", height: 8, background: OG.rule }}>
        <div style={{ display: "flex", width: `${s.value ?? 0}%`, background: color }} />
      </div>
    </div>
  );
}

/** Uses the cached report; a slow or failed scan falls back to a generic card instead of hanging. */
export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const host = new URL(siteUrl()).host;
  const parsed = tokenRefSchema.safeParse(decodeURIComponent((await params).address));
  const r = parsed.success
    ? await Promise.race([
        // Preview fetchers are bots: stored report only, no fresh scan.
        getTokenReport(parsed.data.address, { crawler: true })
          .then((x) => x.report)
          .catch(() => null),
        new Promise<null>((res) => setTimeout(() => res(null), 8_000)),
      ])
    : null;

  if (!r) {
    return new ImageResponse(
      <OgFrame host={host}>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, marginTop: 120 }}>
          Token risk report
        </div>
      </OgFrame>,
      size,
    );
  }

  const v = riskVerdict({
    scores: r.scores,
    findings: r.findings,
    priceChange24h: null,
    buys24h: null,
    sells24h: null,
    liquidityUsd: null,
    marketCapUsd: null,
    volume24hUsd: null,
  });
  const level = LEVEL[v.level]!;
  const name = (r.token.name.value ?? "Unknown token").slice(0, 28);
  const sym = r.token.symbol.value ? `$${r.token.symbol.value.slice(0, 12)}` : "";
  const mcap = formatUsd(r.market.marketCapUsd.value, "en");
  return new ImageResponse(
    <OgFrame host={host}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginTop: 36,
          fontSize: 22,
          color: OG.signal,
        }}
      >
        <span style={{ border: `2px solid ${OG.signal}`, padding: "4px 12px" }}>{r.chainName}</span>
        {mcap && <span style={{ marginLeft: 18, color: OG.muted }}>{`MCap ${mcap}`}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", marginTop: 16 }}>
        <span style={{ fontSize: 68, fontWeight: 700 }}>{name}</span>
        <span style={{ fontSize: 52, fontWeight: 700, color: OG.signal, marginLeft: 20 }}>
          {sym}
        </span>
      </div>
      <div
        style={{ display: "flex", fontSize: 42, fontWeight: 700, color: level.color, marginTop: 6 }}
      >
        {level.text}
      </div>
      <div style={{ display: "flex", marginTop: 30 }}>
        {NAMES.map(([k, label]) => (
          <Score key={k} label={label} s={r.scores[k]} />
        ))}
      </div>
    </OgFrame>,
    size,
  );
}
