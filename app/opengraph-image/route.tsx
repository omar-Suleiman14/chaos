import { ImageResponse } from "next/og";
import { defaultOgImage } from "@/lib/seo";

/**
 * The default share card at /opengraph-image, built once at build time. A plain route rather than
 * the opengraph-image file convention: the root layout lives in app/[lang], so pages reference it
 * through metadata (defaultOgImage in lib/seo.ts and the root layout) instead.
 */
export const dynamic = "force-static";

const size = { width: defaultOgImage.width, height: defaultOgImage.height };

const products = ["Lessons", "Courses", "Quizzes", "Forms", "Live games"];

/** The default share card: the Chaos mark, the landing headline and what you can make. */
export function GET() {
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
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2 }}>
            <div>Turn what you know</div>
            <div>into lessons that stick.</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {products.map((product) => (
              <div key={product} style={{ display: "flex", padding: "10px 22px", borderRadius: 999, border: "2px solid #e7e3de", fontSize: 30, color: "#4a4844" }}>
                {product}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 28, color: "#62605c" }}>Open source · English and Arabic · MCP, API and webhooks</div>
        </div>
      </div>
    ),
    size,
  );
}
