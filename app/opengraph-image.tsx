import { ImageResponse } from "next/og";

export const alt = "Chaos: Forms, surveys and live quizzes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The share card: the Chaos mark, the name and one plain line. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 88,
          background: "#fdfcfb",
          color: "#242321",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {/* The logo from public/icon.svg: an orange rounded square. */}
          <div style={{ width: 88, height: 88, borderRadius: 23, background: "linear-gradient(135deg, #fca535, #e9482b)" }} />
          <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: -1 }}>Chaos</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2, maxWidth: 960 }}>
            Forms, surveys and live quizzes.
          </div>
          <div style={{ fontSize: 32, color: "#62605c" }}>Create forms, collect responses and host quiz games.</div>
        </div>
      </div>
    ),
    size,
  );
}
