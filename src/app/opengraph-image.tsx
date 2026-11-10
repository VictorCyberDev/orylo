import { ImageResponse } from "next/og";
import { brand } from "@/config/brand";
export const alt = `${brand.name} — ${brand.category}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#111E2C",
        color: "#F7F8F6",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 40, fontWeight: 600 }}>
        <div style={{ width: 56, height: 56, borderRadius: 28, border: "8px solid #A2EEDB" }} />
        {brand.wordmark}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 76, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2 }}>
          {brand.tagline}
        </div>
        <div style={{ fontSize: 30, color: "#A2EEDB" }}>{brand.category}</div>
      </div>
    </div>,
    size,
  );
}
