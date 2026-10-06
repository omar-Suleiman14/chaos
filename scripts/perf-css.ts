// Style-cost budgets: a static census of the CSS Chaos ships.
//
//   tsx scripts/perf-css.ts            every stylesheet under app/ and components/
//
// Writes perf/results/css.json (ratcheted like every suite, perf/README.md) and
// perf/results/css-detail.md, the per-file breakdown naming the selectors and
// animations behind each count. Runtime style recalculation is measured in the
// browser (perf/browser/render.spec.ts); this catches the patterns that make it
// expensive before they ship.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

type Node = { type: "decl"; text: string } | { type: "rule"; prelude: string; children: Node[] };

/** A small CSS parser: rules, at-rules and nesting, enough to count selectors and declarations. */
function parse(css: string): Node[] {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  const block = (): Node[] => {
    const nodes: Node[] = [];
    let start = i, depth = 0, quote = "";
    while (i < css.length) {
      const c = css[i];
      if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; i++; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (depth === 0 && c === ";") { const text = css.slice(start, i).trim(); if (text) nodes.push({ type: "decl", text }); start = i + 1; }
      else if (depth === 0 && c === "{") { const prelude = css.slice(start, i).trim(); i++; nodes.push({ type: "rule", prelude, children: block() }); start = i; continue; }
      else if (depth === 0 && c === "}") { const text = css.slice(start, i).trim(); if (text) nodes.push({ type: "decl", text }); i++; return nodes; }
      i++;
    }
    const text = css.slice(start).trim();
    if (text) nodes.push({ type: "decl", text });
    return nodes;
  };
  return block();
}

/** Splits on `sep` outside parentheses, brackets and strings. */
function splitTop(text: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0, start = 0, quote = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && sep.test(c)) { out.push(text.slice(start, i)); start = i + 1; }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

const compounds = (selector: string) => splitTop(selector.replace(/\s*([>+~])\s*/g, " "), /\s/);
const LAYOUT = /^(width|height|min-width|min-height|max-width|max-height|top|right|bottom|left|inset(-[a-z-]+)?|margin(-[a-z-]+)?|padding(-[a-z-]+)?|font-size|line-height|border(-[a-z]+)?-width|gap|row-gap|column-gap|grid-template-[a-z]+|flex-basis)$/;
const PAINT = /^(box-shadow|filter|backdrop-filter|-webkit-backdrop-filter|clip-path|background|background-position|background-size|background-image|border-radius|outline|text-shadow|mask(-[a-z-]+)?)$/;
const TIME = /^-?[\d.]+m?s$/;

type Metrics = Record<string, number>;
const COUNTS = ["rules", "selectors", "universalKeySelectors", "hasSelectors", "globalHasSelectors", "deepSelectors", "transitionAll", "layoutTransitions",
  "layoutKeyframes", "paintKeyframes", "backdropFilters", "willChange", "infiniteAnimations", "reducedMotionBlocks"] as const;

function analyze(css: string) {
  const m: Metrics = Object.fromEntries(COUNTS.map((k) => [k, 0]));
  const examples: Record<string, string[]> = {};
  const note = (k: string, text: string) => { m[k]++; const list = (examples[k] ??= []); if (list.length < 6) list.push(text.replace(/\s+/g, " ").slice(0, 120)); };
  const decl = (text: string, where: string) => {
    const at = text.indexOf(":");
    if (at < 0) return;
    const prop = text.slice(0, at).trim().toLowerCase(), value = text.slice(at + 1).trim().toLowerCase().replace(/\s*!important$/, "");
    if (prop === "transition" || prop === "transition-property") {
      for (const part of splitTop(value, /,/)) {
        const tokens = part.split(/\s+/);
        const named = prop === "transition-property" ? tokens[0] : tokens.find((t) => !TIME.test(t) && !/^(ease|linear|step|cubic-bezier|allow-discrete|normal)/.test(t) && !/^var\(/.test(t));
        if (named === "all" || (prop === "transition" && !named && part !== "none")) note("transitionAll", `${where} { ${text} }`);
        else if (named && LAYOUT.test(named)) note("layoutTransitions", `${where} { ${text} }`);
      }
    }
    if ((prop === "backdrop-filter" || prop === "-webkit-backdrop-filter") && value !== "none") note("backdropFilters", where);
    if (prop === "will-change" && value !== "auto") note("willChange", `${where} { ${text} }`);
    if ((prop === "animation" || prop === "animation-iteration-count") && /\binfinite\b/.test(value)) note("infiniteAnimations", `${where} { ${text} }`);
  };
  const keyframes = (name: string, frames: Node[]) => {
    const props = new Set<string>();
    for (const f of frames) if (f.type === "rule") for (const d of f.children) if (d.type === "decl") props.add(d.text.slice(0, d.text.indexOf(":")).trim().toLowerCase());
    const layout = [...props].filter((p) => LAYOUT.test(p)), paint = [...props].filter((p) => PAINT.test(p));
    if (layout.length) note("layoutKeyframes", `@keyframes ${name}: ${layout.join(", ")}`);
    if (paint.length) note("paintKeyframes", `@keyframes ${name}: ${paint.join(", ")}`);
  };
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.type === "decl") continue;
      const p = n.prelude;
      if (p.startsWith("@")) {
        if (/^@(-webkit-)?keyframes/i.test(p)) { keyframes(p.split(/\s+/)[1] ?? "", n.children); continue; }
        if (/prefers-reduced-motion/i.test(p)) m.reducedMotionBlocks++;
        walk(n.children);
        for (const d of n.children) if (d.type === "decl") decl(d.text, p);
        continue;
      }
      m.rules++;
      for (const selector of splitTop(p, /,/)) {
        m.selectors++;
        const parts = compounds(selector);
        const key = (parts.at(-1) ?? "").replace(/::?(before|after|marker|placeholder|selection|backdrop|first-line|first-letter|-webkit-[a-z-]+)\b/g, "");
        // `.x *`, `.x > *`, `* + *`: the key matches every element, so each one walks its ancestors.
        // Functional pseudo-classes (`:is(h2, h3)`, `:global(.x)`) qualify the key; bare ones (`:hover`) do not.
        if (parts.length > 1 && key !== "" && /^\*?(:[a-z-]+)*$/.test(key)) note("universalKeySelectors", selector);
        if (selector.includes(":has(")) {
          note("hasSelectors", selector);
          // `body:has(…)` / `html:has(…)` / `:root:has(…)` re-evaluate on any change anywhere in the page.
          if (/^(html|body|:root)\b[^ ]*:has\(/.test(parts[0] ?? "")) note("globalHasSelectors", selector);
        }
        if (parts.length > 4) note("deepSelectors", selector);
      }
      for (const d of n.children) if (d.type === "decl") decl(d.text, p);
      walk(n.children);
    }
  };
  walk(parse(css));
  return { metrics: m, examples };
}

function files(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    return statSync(path).isDirectory() ? files(path, ext) : path.endsWith(ext) ? [path] : [];
  }).sort();
}

const metrics: Record<string, { value: number; unit: "count" | "bytes" }> = {};
const detail: string[] = ["# CSS cost census", "", "Counts per file; examples show what each count refers to. Totals are budgeted in perf/baselines/css.json.", ""];
const offenders = ["universalKeySelectors", "globalHasSelectors", "transitionAll", "layoutTransitions", "layoutKeyframes", "paintKeyframes", "infiniteAnimations"];

function suite(label: string, paths: string[]) {
  const total: Metrics = Object.fromEntries(COUNTS.map((k) => [k, 0]));
  let bytes = 0, unguarded = 0;
  detail.push(`## ${label}`, "");
  for (const path of paths) {
    const css = readFileSync(path, "utf8");
    const { metrics: m, examples } = analyze(css);
    bytes += Buffer.byteLength(css);
    for (const k of COUNTS) total[k] += m[k];
    // Constant motion with no reduced-motion override in the same file.
    if (m.infiniteAnimations && !m.reducedMotionBlocks) unguarded++;
    const notable = offenders.filter((k) => m[k]);
    if (!notable.length) continue;
    detail.push(`### ${relative(".", path).replace(/\\/g, "/")}`, "", ...notable.flatMap((k) => [`- **${k}**: ${m[k]}`, ...(examples[k] ?? []).map((e) => `  - \`${e}\``)]), "");
  }
  for (const k of COUNTS) if (k !== "reducedMotionBlocks") metrics[`${label}.${k}`] = { value: total[k], unit: "count" };
  metrics[`${label}.unguardedMotionFiles`] = { value: unguarded, unit: "count" };
  metrics[`${label}.bytes`] = { value: bytes, unit: "bytes" };
}

suite("source", [...files("app", ".css"), ...files("components", ".css")]);

mkdirSync(join("perf", "results"), { recursive: true });
writeFileSync(join("perf", "results", "css.json"), JSON.stringify({ suite: "css", failed: [], metrics }, null, 2) + "\n");
writeFileSync(join("perf", "results", "css-detail.md"), detail.join("\n") + "\n");
for (const [k, v] of Object.entries(metrics)) if (v.unit === "count" && v.value) console.log(`${k}: ${v.value}`);
