import { ImageResponse } from "next/og";
import { getRugReport } from "@quvr/services";
import { OG, OG_SIZE, OgFrame } from "@/lib/og";
import { siteUrl } from "@/lib/seo";

export const runtime = "nodejs";
// Rendered per request: at build time there is no database and no public URL.
export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "QUVR Pulse Rug Report — weekly token risk statistics";

const FLAG_EN: Record<string, string> = {
  "contract-control": "risky contract powers",
  concentrated: "top-10 wallets hold most supply",
  "deployer-share": "creator holds a large share",
  "deployer-selling": "creator already selling",
  clusters: "possibly related wallets",
  "thin-liquidity": "thin liquidity",
  "price-impact": "sells move price a lot",
  "mass-transfers": "mass distributions",
};

export default async function Image() {
  const host = new URL(siteUrl()).host;
  const d = await getRugReport().catch(() => null);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const top = (d?.flags ?? []).filter((f) => f.count > 0).slice(0, 3);
  return new ImageResponse(
    <OgFrame host={host}>
      <div style={{ display: "flex", alignItems: "baseline", marginTop: 34 }}>
        <span style={{ fontSize: 76, fontWeight: 700 }}>Rug</span>
        <span style={{ fontSize: 76, fontWeight: 700, color: OG.signal, marginLeft: 18 }}>
          Report
        </span>
        <span style={{ fontSize: 26, color: OG.muted, marginLeft: 26 }}>
          {d ? `${d.total} tokens · last 7 days` : "weekly token risk stats"}
        </span>
      </div>
      {d && d.total > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 26 }}>
          <div style={{ display: "flex", fontSize: 34, color: OG.high, fontWeight: 700 }}>
            {`${pct(d.verdicts.high / d.total)} high risk`}
          </div>
          {top.map((f) => (
            <div key={f.id} style={{ display: "flex", fontSize: 30, marginTop: 12 }}>
              <span style={{ color: OG.signal, width: 110 }}>{pct(f.share)}</span>
              <span>{FLAG_EN[f.id] ?? f.id}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", fontSize: 34, marginTop: 40, color: OG.muted }}>
          Robinhood Chain · Base · Solana
        </div>
      )}
    </OgFrame>,
    size,
  );
}
