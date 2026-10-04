"use client";
import { useEffect, useId, useState } from "react";
import { useLocale } from "@/lib/i18n";
export default function Diagram({ text }: { text: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, ""), { locale } = useLocale(), ar = locale === "ar";
  const [image, setImage] = useState(""), [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => { void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true, maxTextSize: 20_000, htmlLabels: false });
        const { svg } = await mermaid.render(`lessonDiagram${id}`, text);
        if (live) { setImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`); setError(false); }
      } catch { if (live) { setImage(""); setError(true); } }
    })(); }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [text, id]);
  return <figure className="lx-diagram">
    {image ? <img src={image} alt={ar ? "مخطط الدرس" : "Lesson diagram"} /> : <p role="status" className="lx-muted">{error ? (ar ? "تحقق من صيغة المخطط أدناه." : "Check the diagram syntax below.") : (ar ? "جارٍ رسم المخطط…" : "Rendering diagram…")}</p>}
    <details><summary>{ar ? "اعرض نص المخطط" : "View diagram source"}</summary><pre dir="ltr"><code>{text}</code></pre></details>
  </figure>;
}
