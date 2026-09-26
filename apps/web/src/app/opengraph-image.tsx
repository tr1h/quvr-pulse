import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgFrame } from "@/lib/og";
import { siteUrl } from "@/lib/seo";

export const runtime = "nodejs";
// Rendered per request: at build time there is no database and no public URL.
export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "QUVR Pulse — token scam & rug-pull checker for Robinhood Chain, Base and Solana";

export default function Image() {
  const host = new URL(siteUrl()).host;
  return new ImageResponse(
    <OgFrame host={host}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 90 }}>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>Check a token</div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, color: OG.signal }}>
          before you ape in.
        </div>
        <div style={{ fontSize: 30, color: OG.muted, marginTop: 28 }}>
          Contract · liquidity · holders · creator · possibly related wallets
        </div>
        <div style={{ fontSize: 30, color: OG.muted, marginTop: 8 }}>
          Robinhood Chain · Base · Solana · free, no wallet
        </div>
      </div>
    </OgFrame>,
    size,
  );
}
