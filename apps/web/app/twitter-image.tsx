import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Papuc";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
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
            color: "#7c5cff",
          }}
        >
          Papuc
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: 980,
          }}
        >
          Deal scenarios + social investing for rentals
        </div>
        <div style={{ display: "flex", fontSize: 22, color: "#8b8b96" }}>
          Evaluate · Collaborate · Share
        </div>
      </div>
    ),
    { ...size },
  );
}
