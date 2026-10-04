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
