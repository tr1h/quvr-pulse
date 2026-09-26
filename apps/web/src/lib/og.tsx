import "server-only";

/** Shared look of the social preview cards (1200×630, rendered by next/og). */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG = {
  ink: "#0e0f0d",
  panel: "#161714",
  rule: "#2c2d27",
  paper: "#ece6d6",
  muted: "#9a9585",
  signal: "#ffb000",
  low: "#5ec8c0",
  elevated: "#ffb000",
  high: "#ff5a3c",
  none: "#6b675c",
};

export function OgFrame({ children, host }: { children: React.ReactNode; host: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: OG.ink,
        color: OG.paper,
        padding: "48px 64px 40px",
        fontFamily: "sans-serif",
        borderTop: `10px solid ${OG.signal}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 700 }}>
        <span>QUVR</span>
        <span style={{ color: OG.signal, marginLeft: 10 }}>Pulse</span>
        <span style={{ marginLeft: "auto", fontSize: 22, color: OG.muted, fontWeight: 400 }}>
          {host}
        </span>
      </div>
      {children}
      <div
        style={{
          display: "flex",
          fontSize: 20,
          color: OG.muted,
          marginTop: "auto",
          paddingTop: 20,
        }}
      >
        Independent read-only analytics · not financial advice
      </div>
    </div>
  );
}
