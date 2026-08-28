import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Papuc — evaluate rental deals and invest socially";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0b0f",
          color: "#f5f5f7",
          padding: "64px 72px",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "#7c5cff",
          }}
        >
          Papuc
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              maxWidth: 980,
            }}
          >
            Evaluate rentals. Run scenarios. Build your investor friends.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              color: "#8b8b96",
              lineHeight: 1.4,
              maxWidth: 900,
            }}
          >
            Real estate social investing + deal evaluation — DSCR and cash flow
            without the jargon.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 22,
            color: "#8b8b96",
          }}
        >
          papuc.app
        </div>
      </div>
    ),
    { ...size },
  );
}
