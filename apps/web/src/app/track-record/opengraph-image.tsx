import { ImageResponse } from "next/og";
import { getTrackRecord } from "@quvr/services";
import { OG, OG_SIZE, OgFrame } from "@/lib/og";
import { siteUrl } from "@/lib/seo";

export const runtime = "nodejs";
// Rendered per request: at build time there is no database and no public URL.
export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "QUVR Pulse track record — what happened to tokens after our risk label";

const LEVEL = { low: "Low detected risk", elevated: "Elevated risk" } as const;

export default async function Image() {
  const host = new URL(siteUrl()).host;
  const d = await getTrackRecord("robinhood").catch(() => null);
  const h = d?.headline ?? null;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return new ImageResponse(
    <OgFrame host={host}>
      <div style={{ display: "flex", alignItems: "baseline", marginTop: 30 }}>
        <span style={{ fontSize: 72, fontWeight: 700 }}>Track</span>
        <span style={{ fontSize: 72, fontWeight: 700, color: OG.signal, marginLeft: 18 }}>
          record
        </span>
        <span style={{ fontSize: 26, color: OG.muted, marginLeft: 26 }}>Robinhood Chain</span>
      </div>
      <div style={{ display: "flex", fontSize: 28, color: OG.muted, marginTop: 10 }}>
        Label recorded first. 24 hours later: gone or down 90%+
      </div>
      {h ? (
        <div style={{ display: "flex", marginTop: 34 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 440 }}>
            <div style={{ display: "flex", fontSize: 120, fontWeight: 700, color: OG.high }}>
              {pct(h.high)}
            </div>
            <div style={{ display: "flex", fontSize: 28 }}>{`High risk · n=${h.nHigh}`}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 120,
                fontWeight: 700,
                color: h.otherLevel === "low" ? OG.low : OG.elevated,
              }}
            >
              {pct(h.other)}
            </div>
            <div style={{ display: "flex", fontSize: 28 }}>
              {`${LEVEL[h.otherLevel]} · n=${h.nOther}`}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", fontSize: 34, marginTop: 50, color: OG.muted }}>
          {`${d?.tracked ?? 0} tokens tracked · collecting live data`}
        </div>
      )}
    </OgFrame>,
    size,
  );
}
