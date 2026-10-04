"use client";
import { useEffect, useId, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { useTheme } from "@/components/ThemeProvider";
export default function Diagram({ text }: { text: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, ""), { locale } = useLocale(), ar = locale === "ar";
  const { theme } = useTheme();
  const [image, setImage] = useState(""), [error, setError] = useState(false);
  useEffect(() => {
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
          const accent = [colors.blue, colors.purple, colors.green][index % 3];
          node.querySelectorAll("rect, circle, ellipse, polygon, path").forEach(shape => {
            shape.setAttribute("style", `fill:${colors.surface};stroke:${accent};stroke-width:2;stroke-dasharray:38 10 74 10;stroke-linecap:round`);
          });
          node.setAttribute("class", `${node.getAttribute("class") ?? ""} chaos-diagram-node`);
          (node as SVGElement).style.setProperty("--diagram-accent", accent);
        });
        const style = parsed.createElementNS("http://www.w3.org/2000/svg", "style");
        style.textContent = `.chaos-diagram-node > rect,.chaos-diagram-node > circle,.chaos-diagram-node > ellipse,.chaos-diagram-node > polygon,.chaos-diagram-node > path{animation:diagram-outline 18s linear infinite;filter:drop-shadow(0 2px 5px ${dark ? "#00000040" : "#277dc512"})} @keyframes diagram-outline{to{stroke-dashoffset:-132}} @media(prefers-reduced-motion:reduce){.chaos-diagram-node > *{animation:none!important}}`;
        root.appendChild(style);
        const svg = new XMLSerializer().serializeToString(root);
        if (live) { setImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`); setError(false); }
      } catch { if (live) { setImage(""); setError(true); } }
    })(); }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [text, id, theme]);
  return <figure className="lx-diagram" data-theme={theme}>
    {image ? <img src={image} alt={ar ? "مخطط الدرس" : "Lesson diagram"} /> : <p role="status" className="lx-muted">{error ? (ar ? "تحقق من صيغة المخطط أدناه." : "Check the diagram syntax below.") : (ar ? "جارٍ رسم المخطط…" : "Rendering diagram…")}</p>}
    <details><summary>{ar ? "اعرض نص المخطط" : "View diagram source"}</summary><pre dir="ltr"><code>{text}</code></pre></details>
  </figure>;
}
