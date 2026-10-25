import { ImageResponse } from "next/og";

export const alt = "Craves – Homemade food from trusted home chefs in Hyderabad and Bangalore";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#F62E18",
          color: "#FFFFFF",
        }}
      >
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: 6 }}>CRAVES</div>
        <div style={{ marginTop: 28, fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
          Homemade food from trusted home chefs
        </div>
        <div style={{ marginTop: 32, fontSize: 36, opacity: 0.9 }}>
          Biryani · Tiffin · Lunch & dinner · Meal plans — Hyderabad & Bangalore
        </div>
        <div style={{ marginTop: 40, fontSize: 32, fontWeight: 700 }}>craves.in</div>
      </div>
    ),
    size,
  );
}
