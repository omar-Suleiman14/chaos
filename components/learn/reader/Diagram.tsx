"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { useTheme } from "@/components/ThemeProvider";
import { BlockPlaceholder, useNearViewport } from "./LazyBlock";

/**
 * Rendered diagrams are kept on the device by a hash of their source and theme, so reopening a
 * lesson shows them at once instead of loading Mermaid and laying each one out again. The key is
 * derived from the source itself: only someone who already has the diagram's text can hit it.
 */
const CACHE = "chaos.diagram.v1:";
const MAX_CACHED = 40;
const memory = new Map<string, string>();
function hash(value: string) {
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let i = 0; i < value.length; i++) { const c = value.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
}
function cachedDiagram(key: string): string {
  const hit = memory.get(key);
  if (hit) return hit;
  try { const stored = localStorage.getItem(CACHE + key); if (stored) memory.set(key, stored); return stored ?? ""; } catch { return ""; }
}
function keepDiagram(key: string, image: string) {
  memory.set(key, image);
  try {
    const index = (JSON.parse(localStorage.getItem(`${CACHE}index`) ?? "[]") as string[]).filter((k) => k !== key);
    for (const old of index.splice(0, Math.max(0, index.length - MAX_CACHED + 1))) localStorage.removeItem(CACHE + old);
    if (image.length < 200_000) { localStorage.setItem(CACHE + key, image); index.push(key); }
    localStorage.setItem(`${CACHE}index`, JSON.stringify(index));
  } catch { /* storage full or blocked: the in-memory copy still serves this visit */ }
}

export default function Diagram({ text }: { text: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, ""), { locale } = useLocale(), ar = locale === "ar";
  const { theme } = useTheme();
  const key = hash(`${theme}
${text}`);
  const [rendered, setRendered] = useState<{ key: string; image: string }>({ key: "", image: "" }), [error, setError] = useState(false);
  // Mermaid runs only for diagrams near the viewport (LazyBlock.tsx), and never twice for the same source.
  const [ref, near] = useNearViewport<HTMLElement>();
  const cached = near ? cachedDiagram(key) : "";
  const image = rendered.key === key ? rendered.image : cached;
  // The first render starts at once; later source changes (typing in the editor) wait for a pause.
  const drawn = useRef(false);
  useEffect(() => {
    if (!near || cachedDiagram(key)) return;
    let live = true;
    const timer = setTimeout(() => { void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = theme === "dark";
        const colors = dark
          ? { surface: "#19232e", text: "#eef5ff", blue: "#78bcff", purple: "#bc9cff", green: "#70d9bb", line: "#91a6bc" }
          : { surface: "#f2f7fc", text: "#17283b", blue: "#277DC5", purple: "#9065B0", green: "#2E8B57", line: "#637a91" };
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true, maxTextSize: 20_000, htmlLabels: false,
          theme: "base", themeVariables: { background: "transparent", primaryColor: colors.surface, primaryTextColor: colors.text,
            primaryBorderColor: colors.blue, lineColor: colors.line, secondaryColor: colors.surface, tertiaryColor: colors.surface,
            fontFamily: "system-ui, sans-serif", fontSize: "15px" },
          flowchart: { htmlLabels: false, curve: "basis", nodeSpacing: 36, rankSpacing: 52 },
        });
        const { svg: rendered } = await mermaid.render(`lessonDiagram${id}`, text);
        // The SVG remains an isolated image: Mermaid's strict mode never injects authored HTML into the page.
        const parsed = new DOMParser().parseFromString(rendered, "image/svg+xml");
        const root = parsed.documentElement;
        root.querySelectorAll(".node").forEach((node, index) => {
          const fill = (dark ? ["#1a2c3f", "#2c2440", "#18352f"] : ["#eaf3fc", "#f1ebfa", "#e8f5ed"])[index % 3];
          const outline = dark ? "#8c9aa9" : "#9ba8b6";
          node.querySelectorAll("rect, circle, ellipse, polygon, path").forEach(shape => {
            if (shape.tagName.toLowerCase() === "rect") { shape.setAttribute("rx", "24"); shape.setAttribute("ry", "24"); }
            shape.setAttribute("style", `fill:${fill}!important;stroke:${outline}!important;stroke-width:1.5!important;stroke-dasharray:5 7!important;stroke-linecap:round!important;filter:none!important`);
          });
          node.setAttribute("class", `${node.getAttribute("class") ?? ""} chaos-diagram-node`);
          (node as SVGElement).style.setProperty("--diagram-fill", fill);
        });
        root.querySelectorAll("text, tspan, .nodeLabel").forEach(label => {
          label.setAttribute("style", `fill:${colors.text}!important;color:${colors.text}!important`);
        });
        root.querySelectorAll(".flowchart-link, .edgePath path, .relationshipLine").forEach(edge => {
          edge.setAttribute("style", `stroke:${colors.line}!important;stroke-width:1.8!important;fill:none!important`);
        });
        root.querySelectorAll("marker path, marker polygon").forEach(arrow => {
          arrow.setAttribute("style", `fill:${colors.line}!important;stroke:${colors.line}!important`);
        });
        root.querySelectorAll(".labelBkg").forEach(label => label.setAttribute("style", `fill:${colors.surface}!important`));
        const style = parsed.createElementNS("http://www.w3.org/2000/svg", "style");
        // Mermaid's node shadows can be attached to either a shape or its parent group.
        root.querySelectorAll("[filter]").forEach(element => element.removeAttribute("filter"));
        style.textContent = `.node,.node *{filter:none!important;text-shadow:none!important;box-shadow:none!important}.chaos-diagram-node > rect,.chaos-diagram-node > circle,.chaos-diagram-node > ellipse,.chaos-diagram-node > polygon,.chaos-diagram-node > path{animation:diagram-background 12s ease-in-out infinite alternate} @keyframes diagram-background{from{fill-opacity:.85}to{fill-opacity:1}} @media(prefers-reduced-motion:reduce){.chaos-diagram-node > *{animation:none!important}}`;

        root.appendChild(style);
        const svg = new XMLSerializer().serializeToString(root);
        const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        keepDiagram(key, url);
        if (live) { setRendered({ key, image: url }); setError(false); }
      } catch { if (live) { setRendered({ key, image: "" }); setError(true); } }
    })(); }, drawn.current ? 350 : 0);
    drawn.current = true;
    return () => { live = false; clearTimeout(timer); };
  }, [text, id, theme, key, near]);
  return <figure ref={ref} className="lx-diagram" data-theme={theme}>
    {image ? <img src={image} alt={ar ? "مخطط الدرس" : "Lesson diagram"} /> : error ? <p role="status" className="lx-muted">{ar ? "تحقق من صيغة المخطط أدناه." : "Check the diagram syntax below."}</p> : <BlockPlaceholder label={ar ? "جارٍ رسم المخطط…" : "Rendering diagram…"} height={220} />}
    <details><summary>{ar ? "اعرض نص المخطط" : "View diagram source"}</summary><pre dir="ltr"><code>{text}</code></pre></details>
  </figure>;
}
