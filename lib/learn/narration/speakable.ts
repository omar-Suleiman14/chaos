/**
 * Spoken forms for lesson text. Pure: no DOM, no speech engine.
 *
 * The reader never changes what is displayed. Narration speaks a rewritten copy of the
 * text (units, symbols, abbreviations) and keeps a map from every spoken character back
 * to the displayed characters, so word timing from the speech engine can highlight the
 * words the reader actually sees.
 */

export type Lang = "en" | "ar";

/** A run of spoken text and the displayed text it came from. `ds`/`de` are display offsets. */
export interface Chunk { s: number; e: number; ds: number; de: number; identity: boolean }
export interface Spoken { text: string; map: Chunk[] }

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LATIN = /[A-Za-zÀ-ɏͰ-Ͽ]/;

export function scriptOf(ch: string): Lang | null {
  if (ARABIC.test(ch)) return "ar";
  if (LATIN.test(ch)) return "en";
  return null;
}

/** The language a stored lesson language code is spoken in. */
export function baseLang(language: string | undefined): Lang {
  return (language ?? "").toLowerCase().startsWith("ar") ? "ar" : "en";
}

/** Most common script in a piece of text, or the fallback when it has no letters. */
export function dominantLang(text: string, fallback: Lang): Lang {
  let ar = 0, en = 0;
  for (const ch of text) { const s = scriptOf(ch); if (s === "ar") ar++; else if (s === "en") en++; }
  return ar === en ? fallback : ar > en ? "ar" : "en";
}

/**
 * Splits [start, end) of `text` into runs of one script. Digits, spaces and punctuation
 * join the run they follow, so "ضغط 120 mmHg" becomes Arabic "ضغط 120 " and English "mmHg".
 */
export function languageSpans(text: string, start = 0, end = text.length, fallback: Lang = "en"): { lang: Lang; start: number; end: number }[] {
  const spans: { lang: Lang; start: number; end: number }[] = [];
  let current: Lang | null = null;
  let runStart = start;
  for (let i = start; i < end; i++) {
    const s = scriptOf(text[i]);
    if (!s || s === current) continue;
    if (current === null) { current = s; continue; } // leading neutral characters join the first run
    spans.push({ lang: current, start: runStart, end: i });
    current = s;
    runStart = i;
  }
  if (end > start) spans.push({ lang: current ?? fallback, start: runStart, end });
  return spans;
}

/* ── Sentences ───────────────────────────────────────────────────────────── */

const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs", "dr", "mr", "mrs", "ms", "prof", "approx", "fig", "figs", "no", "st", "cf", "al", "jr", "sr", "dept", "vol", "ed", "eds", "p", "pp", "ca", "b.i.d", "t.i.d", "q.i.d", "p.o", "a.m", "p.m", "inc", "ltd", "resp", "max", "min", "ref"]);
const MAX_SENTENCE = 180;

/**
 * Sentence ranges of `text` in reading order, trimmed of surrounding spaces. Abbreviations,
 * initials and decimals do not end a sentence; very long sentences are cut at a comma or
 * space so highlights stay readable and engines that stop long utterances keep going.
 */
export function sentences(text: string): [number, number][] {
  const out: [number, number][] = [];
  const push = (s: number, e: number) => {
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e <= s) return;
    while (e - s > MAX_SENTENCE) {
      const slice = text.slice(s, s + MAX_SENTENCE);
      let cut = Math.max(slice.lastIndexOf(", "), slice.lastIndexOf("; "), slice.lastIndexOf("، "), slice.lastIndexOf("؛ "));
      if (cut < MAX_SENTENCE * 0.4) cut = slice.lastIndexOf(" ");
      if (cut <= 0) break;
      out.push([s, s + cut + 1]);
      s += cut + 1;
      while (s < e && /\s/.test(text[s])) s++;
    }
    if (e > s) out.push([s, e]);
  };
  const end = /[.!?؟…]+["'”’»)\]]*(?=\s|$)|\n+/g;
  let start = 0;
  for (let m = end.exec(text); m; m = end.exec(text)) {
    const stop = m.index + m[0].length;
    if (m[0] === "." ) {
      const word = /(\S+)$/.exec(text.slice(start, m.index))?.[1] ?? "";
      const bare = word.replace(/^[("'“‘]+/, "").toLowerCase();
      const next = text.slice(stop).match(/^\s*(\S)/)?.[1] ?? "";
      if (ABBREVIATIONS.has(bare) || /^[a-z]$/i.test(bare) || /^[a-z]$/.test(next)) continue;
    }
    push(start, stop);
    start = stop;
  }
  push(start, text.length);
  return out;
}

/* ── Spoken forms ────────────────────────────────────────────────────────── */

type Say = string | ((match: string, text: string, at: number) => string);
interface Rule { re: string; en: Say; ar?: Say }

const UNITS: Record<string, [string, string]> = {
  mmHg: ["millimetre of mercury", "millimetres of mercury"], cmH2O: ["centimetre of water", "centimetres of water"], "cmH₂O": ["centimetre of water", "centimetres of water"],
  "mmol/L": ["millimole per litre", "millimoles per litre"], "mEq/L": ["milliequivalent per litre", "milliequivalents per litre"], "mg/dL": ["milligram per decilitre", "milligrams per decilitre"],
  "g/dL": ["gram per decilitre", "grams per decilitre"], "mg/kg": ["milligram per kilogram", "milligrams per kilogram"], "mOsm/kg": ["milliosmole per kilogram", "milliosmoles per kilogram"],
  mcg: ["microgram", "micrograms"], "μg": ["microgram", "micrograms"], "µg": ["microgram", "micrograms"], mg: ["milligram", "milligrams"], kg: ["kilogram", "kilograms"],
  mL: ["millilitre", "millilitres"], ml: ["millilitre", "millilitres"], dL: ["decilitre", "decilitres"], L: ["litre", "litres"], g: ["gram", "grams"], IU: ["international unit", "international units"],
  bpm: ["beat per minute", "beats per minute"], cm: ["centimetre", "centimetres"], mm: ["millimetre", "millimetres"], "μm": ["micrometre", "micrometres"], "µm": ["micrometre", "micrometres"],
  nm: ["nanometre", "nanometres"], Hz: ["hertz", "hertz"], kPa: ["kilopascal", "kilopascals"], mV: ["millivolt", "millivolts"], ms: ["millisecond", "milliseconds"],
};
const unitNames = Object.keys(UNITS).sort((a, b) => b.length - a.length).map((u) => u.replace(/[/]/g, "\\/"));
const unit: Say = (m, text, at) => {
  const name = UNITS[m.trim()];
  const number = /(\d+(?:[.,]\d+)?)\s?$/.exec(text.slice(0, at))?.[1];
  return ` ${name[number === "1" ? 0 : 1]}`;
};

const GREEK: Record<string, string> = { α: "alpha", β: "beta", γ: "gamma", δ: "delta", Δ: "delta", ε: "epsilon", κ: "kappa", λ: "lambda", μ: "mu", θ: "theta", σ: "sigma", Σ: "sigma", τ: "tau", φ: "phi", ω: "omega", Ω: "omega", π: "pi", ρ: "rho", χ: "chi", ψ: "psi" };
const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

/** Order matters: at one position, the first rule that matches wins. No capturing groups. */
const RULES: Rule[] = [
  { re: String.raw`(?:https?:\/\/|www\.)[^\s)\]]+`, en: "" },
  { re: String.raw`\[\d+(?:\s*[,–-]\s*\d+)*\]`, en: "" },
  { re: String.raw`->|=>|→|⇒|⟶|⟹`, en: " leads to ", ar: " يؤدي إلى " },
  { re: String.raw`⇌`, en: " is in equilibrium with ", ar: " في توازن مع " },
  { re: String.raw`<->|↔|⇔`, en: " and ", ar: " و " },
  { re: String.raw`<-|←`, en: " comes from ", ar: " ينتج عن " },
  { re: String.raw`↑`, en: " increased ", ar: " ارتفاع " },
  { re: String.raw`↓`, en: " decreased ", ar: " انخفاض " },
  { re: String.raw`±`, en: " plus or minus ", ar: " زائد أو ناقص " },
  { re: String.raw`≥|>=`, en: " greater than or equal to ", ar: " أكبر من أو يساوي " },
  { re: String.raw`≤|<=`, en: " less than or equal to ", ar: " أصغر من أو يساوي " },
  { re: String.raw`≠|!=`, en: " not equal to ", ar: " لا يساوي " },
  { re: String.raw`≈|~(?=\s?\d)`, en: " approximately ", ar: " حوالي " },
  { re: String.raw`>`, en: " greater than ", ar: " أكبر من " },
  { re: String.raw`<`, en: " less than ", ar: " أصغر من " },
  { re: String.raw`(?<=\d)\s?[×x](?=\s?\d)|×`, en: " times ", ar: " ضرب " },
  { re: String.raw`°\s?C(?![A-Za-z])`, en: " degrees Celsius", ar: " درجة مئوية" },
  { re: String.raw`°\s?F(?![A-Za-z])`, en: " degrees Fahrenheit", ar: " درجة فهرنهايت" },
  { re: String.raw`°`, en: " degrees", ar: " درجة" },
  { re: String.raw`\s?[%٪]`, en: " percent", ar: " بالمئة" },
  { re: String.raw`HCO(?:3|₃)(?:[−-]|⁻)?(?![A-Za-z0-9])`, en: "bicarbonate" },
  { re: String.raw`Ca(?:2\+|\+\+|²⁺)`, en: "calcium" },
  { re: String.raw`Mg(?:2\+|\+\+|²⁺)`, en: "magnesium" },
  { re: String.raw`Na(?:\+|⁺)`, en: "sodium" },
  { re: String.raw`(?<![A-Za-z])K(?:\+|⁺)`, en: "potassium" },
  { re: String.raw`(?<![A-Za-z])Cl(?:[−-]|⁻)(?![A-Za-z0-9])`, en: "chloride" },
  { re: String.raw`(?<![A-Za-z])H(?:\+|⁺)`, en: "hydrogen ion" },
  { re: String.raw`(?<![A-Za-z])(?:CO2|CO₂)(?![A-Za-z0-9])`, en: "carbon dioxide" },
  { re: String.raw`(?<![A-Za-z])(?:O2|O₂)(?![A-Za-z0-9])`, en: "oxygen" },
  { re: String.raw`(?<![A-Za-z])(?:H2O|H₂O)(?![A-Za-z0-9])`, en: "water" },
  { re: String.raw`(?<=\d\s?)(?:${unitNames.join("|")})(?![A-Za-z])`, en: unit },
  { re: String.raw`(?<=\d)(?:\s?[–—]\s?|-)(?=[A-Za-z]{0,2}\d)`, en: " to ", ar: " إلى " },
  { re: String.raw`(?<=\d)\/(?=\d)`, en: " over ", ar: " على " },
  { re: String.raw`(?<=[A-Za-z])\/(?=[A-Za-z])`, en: " " },
  { re: String.raw`\be\.g\.`, en: "for example" },
  { re: String.raw`\bi\.e\.`, en: "that is" },
  { re: String.raw`\betc\.`, en: "et cetera" },
  { re: String.raw`\bvs\.?(?=\s)`, en: "versus" },
  { re: String.raw`\bapprox\.`, en: "approximately" },
  { re: String.raw`\bcf\.`, en: "compare" },
  { re: String.raw`\bet al\.`, en: "and colleagues" },
  { re: String.raw`\bFigs?\.`, en: "Figure" },
  { re: String.raw`\bDr\.`, en: "Doctor" },
  { re: String.raw`\bProf\.`, en: "Professor" },
  { re: String.raw`\b[Nn]o\.(?=\s?\d)`, en: "number" },
  { re: String.raw`\bb\.i\.d\.|\bBID\b`, en: "twice daily" },
  { re: String.raw`\bt\.i\.d\.|\bTID\b`, en: "three times daily" },
  { re: String.raw`\bq\.i\.d\.|\bQID\b`, en: "four times daily" },
  { re: String.raw`\bp\.o\.`, en: "by mouth" },
  { re: String.raw`\bDx\b`, en: "diagnosis" },
  { re: String.raw`\bTx\b`, en: "treatment" },
  { re: String.raw`\bHx\b`, en: "history" },
  { re: String.raw`\bSx\b`, en: "symptoms" },
  { re: String.raw`\bFx\b`, en: "fracture" },
  { re: String.raw`\+ve\b`, en: " positive" },
  { re: String.raw`-ve\b`, en: " negative" },
  { re: String.raw`&`, en: " and ", ar: " و " },
  { re: String.raw`²`, en: " squared", ar: " تربيع" },
  { re: String.raw`³`, en: " cubed", ar: " تكعيب" },
  { re: `[${SUBSCRIPT}]`, en: (m) => String(SUBSCRIPT.indexOf(m)) },
  { re: `[${Object.keys(GREEK).join("")}]`, en: (m) => ` ${GREEK[m]} ` },
  { re: String.raw`\s[—–]\s|—`, en: ", ", ar: "، " },
  { re: String.raw`[\p{Extended_Pictographic}•◦▪●‣⁃️]`, en: "" },
];
const COMBINED = new RegExp(RULES.map((r) => `(${r.re})`).join("|"), "gu");

/**
 * The spoken form of display text [start, end), in one language, with its offset map.
 * The whole display text is passed so rules can look behind the range ("120 mmHg" spoken
 * in English after an Arabic number).
 */
export function speakable(display: string, start = 0, end = display.length, lang: Lang = "en"): Spoken {
  let text = "";
  const map: Chunk[] = [];
  const copy = (from: number, to: number) => {
    if (to <= from) return;
    map.push({ s: text.length, e: text.length + (to - from), ds: from, de: to, identity: true });
    text += display.slice(from, to);
  };
  let cursor = start;
  COMBINED.lastIndex = start;
  for (let m = COMBINED.exec(display); m && m.index < end; m = COMBINED.exec(display)) {
    if (m[0] === "") { COMBINED.lastIndex++; continue; }
    if (m.index + m[0].length > end) break;
    const rule = RULES[m.findIndex((g, i) => i > 0 && g !== undefined) - 1];
    const say = (lang === "ar" ? rule.ar : undefined) ?? rule.en;
    const spoken = typeof say === "function" ? say(m[0], display, m.index) : say;
    copy(cursor, m.index);
    map.push({ s: text.length, e: text.length + spoken.length, ds: m.index, de: m.index + m[0].length, identity: false });
    text += spoken;
    cursor = m.index + m[0].length;
  }
  copy(cursor, end);
  return { text, map };
}

/** Display range [ds, de) for spoken range [s, e). Replaced words map to their whole display form. */
export function toDisplay(map: Chunk[], s: number, e: number): [number, number] | null {
  let ds = -1, de = -1;
  for (const c of map) {
    if (c.e <= s || c.s >= Math.max(e, s + 1)) continue;
    const from = c.identity ? c.ds + Math.max(0, s - c.s) : c.ds;
    const to = c.identity ? c.ds + Math.min(c.e, e) - c.s : c.de;
    if (ds === -1 || from < ds) ds = from;
    if (to > de) de = to;
  }
  return ds === -1 || de <= ds ? null : [ds, de];
}

/** End of the word that starts at `at` in spoken text (engines without charLength). */
export function wordEnd(text: string, at: number): number {
  const m = /^[^\s]+/u.exec(text.slice(at));
  return at + (m ? m[0].length : 0);
}

/* ── Equations ───────────────────────────────────────────────────────────── */

const LATEX_WORDS: Record<string, string> = {
  times: " times ", cdot: " times ", div: " divided by ", pm: " plus or minus ", mp: " minus or plus ", leq: " less than or equal to ", le: " less than or equal to ",
  geq: " greater than or equal to ", ge: " greater than or equal to ", neq: " not equal to ", ne: " not equal to ", approx: " approximately ", propto: " is proportional to ",
  to: " goes to ", rightarrow: " gives ", Rightarrow: " implies ", leftarrow: " comes from ", rightleftharpoons: " is in equilibrium with ", infty: " infinity ", sum: " the sum of ",
  int: " the integral of ", partial: " partial ", log: " log ", ln: " natural log ", sin: " sine ", cos: " cosine ", tan: " tangent ", lim: " the limit ", cdots: " and so on ", ldots: " and so on ",
  alpha: " alpha ", beta: " beta ", gamma: " gamma ", delta: " delta ", Delta: " delta ", epsilon: " epsilon ", theta: " theta ", lambda: " lambda ", mu: " mu ", pi: " pi ", rho: " rho ",
  sigma: " sigma ", Sigma: " sigma ", tau: " tau ", phi: " phi ", omega: " omega ", Omega: " omega ", degree: " degrees ", circ: " degrees ", percent: " percent ",
};

/** A readable spoken form of a LaTeX equation: "\frac{a}{b}^2" → "a over b squared". */
export function speakLatex(source: string): string {
  let s = source;
  const group = String.raw`\{((?:[^{}]|\{[^{}]*\})*)\}`;
  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s.replace(new RegExp(String.raw`\\[dt]?frac\s*${group}\s*${group}`, "g"), " $1 over $2 ")
      .replace(new RegExp(String.raw`\\sqrt\s*\[([^\]]*)\]\s*${group}`, "g"), " the $1th root of $2 ")
      .replace(new RegExp(String.raw`\\sqrt\s*${group}`, "g"), " the square root of $1 ")
      .replace(new RegExp(String.raw`\\(?:text|mathrm|mathbf|mathit|operatorname)\s*${group}`, "g"), " $1 ");
    if (s === before) break;
  }
  s = s.replace(/\\(?:left|right|big|Big|bigg|Bigg)\b/g, "")
    .replace(/\^\s*\{?\s*2\s*\}?/g, " squared ").replace(/\^\s*\{?\s*3\s*\}?/g, " cubed ")
    .replace(/\^\s*\{([^{}]*)\}/g, " to the power of $1 ").replace(/\^\s*(\S)/g, " to the power of $1 ")
    .replace(/_\s*\{([^{}]*)\}/g, " sub $1 ").replace(/_\s*(\S)/g, " sub $1 ")
    .replace(/\\([A-Za-z]+)/g, (_, name: string) => LATEX_WORDS[name] ?? ` ${name} `)
    .replace(/\\[,;:! ]/g, " ").replace(/[{}]/g, " ")
    .replace(/=/g, " equals ").replace(/\+/g, " plus ").replace(/(?<=[\w)\s])-(?=[\s\w(])/g, " minus ").replace(/\*/g, " times ")
    .replace(/(?<=\w|\))\/(?=\w|\()/g, " over ");
  return s.replace(/\s+/g, " ").trim();
}
