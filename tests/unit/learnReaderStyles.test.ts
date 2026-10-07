import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Style contracts for the reader that jsdom cannot lay out: which rules may size the theme
 * toggle, where the block ⋯ menu may sit, and motion guards. Geometry itself is checked in
 * Chromium by tests/layout/reader.layout.spec.ts.
 */
type Rule = { selector: string; body: string; media: string };
function rules(path: string): Rule[] {
  const css = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const walk = (text: string, media: string) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const prelude = text.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (depth && j < text.length) { if (text[j] === "{") depth++; else if (text[j] === "}") depth--; j++; }
      const body = text.slice(open + 1, j - 1);
      if (prelude.startsWith("@media") || prelude.startsWith("@layer") || prelude.startsWith("@scope")) walk(body, `${media} ${prelude}`.trim());
      else if (!prelude.startsWith("@")) out.push({ selector: prelude, body, media });
      i = j;
    }
  };
  walk(css, "");
  return out;
}
const all = [...rules("app/workspace.css"), ...rules("app/globals.css"), ...rules("components/learn/learn.css")];
const SIZE = /(^|;)\s*(width|height|min-width|min-height|max-width|max-height|padding(-[a-z-]+)?|font-size|display|flex(-basis|-grow)?)\s*:/;
const parts = (selector: string) => selector.split(/,(?![^(]*\))/).map((s) => s.trim());

describe("theme toggle in the reading settings menu", () => {
  it("menu row styles never apply to icon buttons placed in a menu", () => {
    const rows = all.filter((r) => SIZE.test(r.body)).flatMap((r) => parts(r.selector)).filter((s) => /\.ws-menu button(?![\w-])/.test(s));
    expect(rows.length).toBeGreaterThan(0);
    for (const s of rows) expect(s, s).toMatch(/\.ws-menu button(?::not\(:where\(\.ws-icon-button\)\))|\.ws-menu button:disabled/);
  });

  it("no hover or focus rule changes the size of an icon button or the theme toggle", () => {
    const offenders = all.filter((r) => SIZE.test(r.body) && parts(r.selector).some((s) => /:(hover|focus|focus-visible|focus-within|active)/.test(s) && /\.(ws-icon-button|theme-toggle)\b/.test(s)));
    expect(offenders.map((r) => r.selector)).toEqual([]);
  });

  it("the toggle's icons are absolutely placed, so swapping sun and moon cannot resize it", () => {
    expect(all.find((r) => r.selector === ".theme-toggle svg")?.body).toMatch(/position:\s*absolute/);
  });
});

describe("block ⋯ menu placement", () => {
  const narrow = all.filter((r) => r.media.includes("max-width: 1180px") && r.media.includes("hover: none"));
  it("is hidden inside blocks on narrow and touch screens (it docks in .lx-block-bar instead)", () => {
    expect(narrow.some((r) => r.selector === ".lx-block__handle" && /display:\s*none/.test(r.body))).toBe(true);
    const shown = narrow.filter((r) => /lx-block__handle/.test(r.selector) && /display:\s*(block|flex|grid)/.test(r.body));
    expect(shown.map((r) => r.selector)).toEqual([]);
  });

  it("sits in the side gutter on large screens, including for list items", () => {
    const handle = all.filter((r) => !r.media && r.selector === ".lx-block__handle").map((r) => r.body).join(";");
    expect(handle).toMatch(/inset-inline-start:\s*-34px/);
    expect(all.find((r) => r.selector.includes('[data-type="list"] > li > .lx-block__handle'))?.body).toMatch(/calc\(-34px - 1\.4em\)/);
    expect(all.find((r) => r.selector === ".lx-article" && !r.media && /padding-inline/.test(r.body))?.body).toMatch(/padding-inline:\s*36px/);
  });

  it("the docked bar is fixed to the screen edge, never laid out inside the lesson", () => {
    expect(all.find((r) => r.selector === ".lx-block-bar")?.body).toMatch(/position:\s*fixed/);
  });
});

describe("motion", () => {
  const guarded = (selector: string) => {
    const system = all.some((r) => r.media.includes("prefers-reduced-motion: reduce") && r.selector.includes(selector));
    const chaos = all.some((r) => r.selector.includes(`.reduce-motion ${selector}`));
    return system && chaos;
  };
  it.each([".lx-narr-layer > span", ".lx-narration", ".lx-toc-desk__body"])("%s respects system and Chaos reduce motion", (selector) => {
    expect(guarded(selector)).toBe(true);
  });

  it("the narration overlay animates only itself, never lesson text", () => {
    const transitions = all.filter((r) => /transition:/.test(r.body) && /lx-narr(-|\b)(?!ation)/.test(r.selector));
    expect(transitions.length).toBeGreaterThan(0);
    for (const r of transitions) expect(r.selector).toMatch(/^(\.reduce-motion |\.dark )?\.lx-narr-layer/);
  });

  it("narration tints blend so text stays crisp in light and dark appearance", () => {
    expect(all.find((r) => r.selector === ".lx-narr-layer > span")?.body).toMatch(/background:\s*var\(--narr\).*mix-blend-mode:\s*multiply/);
    expect(all.find((r) => r.selector === ".dark .lx-narr-layer > span")?.body).toMatch(/mix-blend-mode:\s*screen/);
  });
});
