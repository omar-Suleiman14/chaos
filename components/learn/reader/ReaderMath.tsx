"use client";

import { useEffect, useState } from "react";
import "katex/dist/katex.min.css";

/** An equation block. KaTeX loads only when a lesson has one; the LaTeX source shows until then, and if it fails to parse. */
export default function ReaderMath({ source }: { source: string }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let live = true;
    void import("katex").then(({ default: katex }) => {
      let rendered = "";
      try {
        rendered = katex.renderToString(source, { displayMode: true, throwOnError: true, output: "htmlAndMathml", strict: "ignore", trust: false });
      } catch { /* invalid LaTeX keeps the source */ }
      if (live) setHtml(rendered);
    });
    return () => { live = false; };
  }, [source]);
  return html ? <div className="lx-math" dangerouslySetInnerHTML={{ __html: html }} /> : <pre>{source}</pre>;
}
