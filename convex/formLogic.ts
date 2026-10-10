import { isIsoDate, isClockTime, isOnStep, parseNumberInput } from "./formValuePrimitives";
export { isIsoDate, isClockTime, isOnStep, parseNumberInput } from "./formValuePrimitives";
// Pure form logic shared by the Convex backend and the Next.js client.
// No Convex imports: this file must run identically in both places so the
// builder, respondent page and server agree on validation and branching.

export const FORM_SCHEMA_VERSION = 1;

export const languages = ["en", "ar"] as const;
export type Language = (typeof languages)[number];
export const languageNames: Record<Language, string> = { en: "English", ar: "العربية" };
export const rtlLanguages: Language[] = ["ar"];

export const fieldTypes = [
  "text", "textarea", "email", "phone", "url", "number", "date", "time",
  "choice", "dropdown", "multi_choice", "rating", "scale", "ranking", "matrix",
  "file", "statement", "section",
] as const;
export type FieldType = (typeof fieldTypes)[number];

export const fieldTypeLabels: Record<FieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  email: "Email",
  phone: "Phone",
  url: "Website",
  number: "Number",
  date: "Date",
  time: "Time",
  choice: "Single choice",
  dropdown: "Dropdown",
  multi_choice: "Checkboxes",
  rating: "Rating",
  scale: "Linear scale",
  ranking: "Ranking",
  matrix: "Likert / matrix",
  file: "File upload",
  statement: "Text block",
  section: "Section break",
};

/** Field types that do not collect an answer. */
export const contentTypes: FieldType[] = ["statement", "section"];
export const optionTypes: FieldType[] = ["choice", "dropdown", "multi_choice", "ranking", "matrix"];
export const numericTypes: FieldType[] = ["number", "rating", "scale"];
/** Answers that identify or describe a person in free text; never aggregated. */
export const privateTypes: FieldType[] = ["text", "textarea", "email", "phone", "url", "date", "time", "file", "number"];

export type Presentation = "page" | "sections" | "conversational" | "swipe";
export const presentationLabels: Record<Presentation, string> = {
  page: "Classic",
  sections: "Sections",
  conversational: "Typeform style",
  swipe: "Swipe",
};
export const presentationHints: Record<Presentation, string> = {
  page: "Every question on one scrolling page.",
  sections: "One page per section break.",
  conversational: "One question at a time, keyboard friendly.",
  swipe: "Full-screen cards people swipe through, like short videos.",
};

export interface Choice { id: string; label: string; score?: number }

export interface Translation {
  label?: string;
  description?: string;
  placeholder?: string;
  minLabel?: string;
  maxLabel?: string;
  options?: Record<string, string>;
  rows?: Record<string, string>;
}

export type ConditionOp =
  | "equals" | "not_equals" | "includes" | "not_includes"
  | "answered" | "not_answered" | "gt" | "gte" | "lt" | "lte";
export const conditionOpLabels: Record<ConditionOp, string> = {
  equals: "is",
  not_equals: "is not",
  includes: "includes",
  not_includes: "does not include",
  answered: "is answered",
  not_answered: "is not answered",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
};
/** Pseudo-field for the calculated score (sum of selected option scores). */
export const SCORE_FIELD = "calc:score";

export interface Condition { fieldId: string; op: ConditionOp; value?: string | number }
export interface Rule { match: "all" | "any"; conditions: Condition[] }

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  required: boolean;
  /** UTC milliseconds; a section gates its children until the next section. */
  releasesAt?: number;
  placeholder?: string;
  options?: Choice[];
  rows?: Choice[];
  min?: number;
  max?: number;
  /** number: allowed increment from `min` (or 0). scale: whole-number increment. */
  step?: number;
  /** number: whole numbers only. */
  integer?: boolean;
  /** date: earliest/latest allowed "YYYY-MM-DD". time: earliest/latest allowed "HH:mm". Compared as plain text, never converted between time zones. */
  minValue?: string;
  maxValue?: string;
  minLabel?: string;
  maxLabel?: string;
  image?: { url: string; alt: string };
  showIf?: Rule;
  quiz?: { correctOptionIds: string[]; points: number; explanation?: string };
  translations?: Record<string, Translation>;
}

export interface Ending {
  id: string;
  title: string;
  message: string;
  showIf?: Rule;
  translations?: Record<string, { title?: string; message?: string }>;
}

export const themePresetIds = [
  "flow", "chaos", "paper", "soft-grid", "spotlight", "terracotta", "ocean", "midnight", "garden",
  "neon", "aurora", "candy", "terminal", "newsprint", "arcade", "sunset", "velvet", "google-forms", "microsoft-forms",
] as const;
export type ThemePresetId = (typeof themePresetIds)[number];
/** "roboto" loads Roboto (Google Forms style); "segoe" is the Segoe UI system stack and bundles nothing. Both fall back to Cairo for Arabic. */
export type ThemeFont = "sans" | "serif" | "mono" | "display" | "rounded" | "editorial" | "elegant" | "roboto" | "segoe";
/** Page chrome that some looks add on top of the palette: question cards with a title strip, a banner header with numbered questions, or iOS grouped cards. Absent means the usual layouts. */
export type ThemeChrome = "google" | "microsoft" | "apple";
/** Start screen shown before the first question; absent or "none" skips it. */
export type ThemeCover = "none" | "classic" | "split" | "poster" | "minimal" | "terminal" | "arcade" | "editorial" | "scroll";
export type ThemeBackdrop = "none" | "dots" | "grid" | "gradient" | "aurora" | "noise" | "stripes" | "scanlines";
export type ThemeButtons = "solid" | "outline" | "pill" | "brutal" | "soft";
export type ThemeSound = "soft" | "pop" | "arcade" | "wood" | "off";

export interface FormTheme {
  /** Absent on definitions created before theme presets. */
  version?: 1;
  preset?: ThemePresetId | "custom";
  accent: string;
  background: "plain" | "tinted" | "dark";
  font: ThemeFont;
  radius: "none" | "small" | "large";
  logoUrl?: string;
  pageColor?: string;
  surfaceColor?: string;
  textColor?: string;
  layout?: "flat" | "card" | "focus";
  cover?: ThemeCover;
  backdrop?: ThemeBackdrop;
  buttons?: ThemeButtons;
  /** "auto" adds a derived dark palette for respondents in dark mode; "fixed" always uses the colours above. */
  appearance?: "fixed" | "auto";
  sound?: ThemeSound;
  chrome?: ThemeChrome;
}
/** Theme of definitions saved before theme presets existed. */
export const defaultTheme: FormTheme = { accent: "#22c55e", background: "plain", font: "sans", radius: "small" };
/** The original bold Chaos look, shown as "Evergreen". The id stays "chaos" for saved forms. */
export const chaosTheme: FormTheme = {
  version: 1, preset: "chaos", accent: "#2f5333", background: "plain", font: "display", radius: "none",
  pageColor: "#f0efea", surfaceColor: "#ffffff", textColor: "#111111", layout: "flat",
  // Sound is opt-in: new forms are silent until the creator turns it on in Design.
  cover: "poster", backdrop: "none", buttons: "brutal", appearance: "auto", sound: "off",
};
/** Flow: forms as if Apple made them, matching the Flow live-game look. The default for new forms, quizzes and templates. */
export const flowTheme: FormTheme = {
  version: 1, preset: "flow", accent: "#007aff", background: "plain", font: "segoe", radius: "large",
  pageColor: "#f2f2f7", surfaceColor: "#ffffff", textColor: "#1d1d1f", layout: "flat",
  cover: "none", backdrop: "none", buttons: "solid", appearance: "auto", sound: "off", chrome: "apple",
};
/** Paper, the Google Forms look. */
export const paperTheme: FormTheme = {
  version: 1, preset: "paper", accent: "#6942b5", background: "plain", font: "sans", radius: "small",
  pageColor: "#f0ebf8", surfaceColor: "#ffffff", textColor: "#202124", layout: "card",
  cover: "classic", backdrop: "none", buttons: "solid", appearance: "auto", sound: "off",
};

/** Google Forms style. Looks like Google Forms; not affiliated with Google. */
export const googleFormsTheme: FormTheme = {
  version: 1, preset: "google-forms", accent: "#673ab7", background: "plain", font: "roboto", radius: "small",
  pageColor: "#f0ebf8", surfaceColor: "#ffffff", textColor: "#202124", layout: "flat",
  cover: "none", backdrop: "none", buttons: "solid", appearance: "fixed", sound: "off", chrome: "google",
};
/** Microsoft Forms style. Looks like Microsoft Forms; not affiliated with Microsoft. */
export const microsoftFormsTheme: FormTheme = {
  version: 1, preset: "microsoft-forms", accent: "#03787c", background: "plain", font: "segoe", radius: "small",
  pageColor: "#f3f2f1", surfaceColor: "#ffffff", textColor: "#323130", layout: "flat",
  cover: "none", backdrop: "none", buttons: "solid", appearance: "fixed", sound: "off", chrome: "microsoft",
};

export interface FormDefinition {
  schemaVersion: number;
  title: string;
  description: string;
  defaultLanguage: Language;
  languages: Language[];
  presentation: Presentation;
  fields: FormField[];
  endings: Ending[];
  theme: FormTheme;
  /** showAnswers: after submitting, respondents see the key and explanations (default true). */
  quiz?: { enabled: boolean; showAnswers?: boolean };
  translations?: Record<string, { title?: string; description?: string }>;
}

export type FileAnswer = string[];
export type AnswerValue = string | number | string[] | Record<string, string>;
export type Answers = Record<string, AnswerValue>;

export const LIMITS = {
  title: 200,
  description: 5000,
  label: 500,
  fields: 200,
  options: 100,
  rows: 50,
  endings: 20,
  conditions: 20,
  textAnswer: 10000,
  shortTextAnswer: 1000,
  files: 5,
} as const;

const idPattern = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
export function isValidId(id: string): boolean {
  return idPattern.test(id);
}

export function newId(prefix = "f"): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
    : Math.random().toString(36).slice(2, 12);
  return `${prefix}${random}`;
}

export function emptyDefinition(title = "Untitled form"): FormDefinition {
  return {
    schemaVersion: FORM_SCHEMA_VERSION,
    title,
    description: "",
    defaultLanguage: "en",
    languages: ["en"],
    presentation: "page",
    fields: [],
    endings: [],
    theme: { ...flowTheme },
  };
}

export function blankField(type: FieldType): FormField {
  const field: FormField = { id: newId("q"), type, label: "", required: false };
  if (type === "choice" || type === "dropdown" || type === "multi_choice" || type === "ranking") {
    field.options = [{ id: newId("o"), label: "Option 1" }, { id: newId("o"), label: "Option 2" }];
  }
  if (type === "matrix") {
    field.rows = [{ id: newId("r"), label: "Statement 1" }, { id: newId("r"), label: "Statement 2" }];
    field.options = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"].map((label) => ({ id: newId("o"), label }));
  }
  if (type === "rating") field.max = 5;
  if (type === "scale") { field.min = 1; field.max = 5; }
  if (type === "file") field.max = 1;
  if (type === "section") field.label = "New section";
  return field;
}

export function isAnswerable(field: FormField): boolean {
  return !contentTypes.includes(field.type);
}

// ── Localisation ────────────────────────────────────────────────────────────

export function isRtl(language: Language): boolean {
  return rtlLanguages.includes(language);
}

export function localizeField(field: FormField, language: Language, def: FormDefinition): FormField {
  if (language === def.defaultLanguage) return field;
  const t = field.translations?.[language];
  if (!t) return field;
  return {
    ...field,
    label: t.label?.trim() ? t.label : field.label,
    description: t.description?.trim() ? t.description : field.description,
    placeholder: t.placeholder?.trim() ? t.placeholder : field.placeholder,
    minLabel: t.minLabel?.trim() ? t.minLabel : field.minLabel,
    maxLabel: t.maxLabel?.trim() ? t.maxLabel : field.maxLabel,
    options: field.options?.map((o) => ({ ...o, label: t.options?.[o.id]?.trim() ? t.options[o.id] : o.label })),
    rows: field.rows?.map((r) => ({ ...r, label: t.rows?.[r.id]?.trim() ? t.rows[r.id] : r.label })),
  };
}

export function localizedMeta(def: FormDefinition, language: Language): { title: string; description: string } {
  const t = language === def.defaultLanguage ? undefined : def.translations?.[language];
  return {
    title: t?.title?.trim() ? t.title : def.title,
    description: t?.description?.trim() ? t.description : def.description,
  };
}

export function localizeEnding(ending: Ending, language: Language, def: FormDefinition): Ending {
  if (language === def.defaultLanguage) return ending;
  const t = ending.translations?.[language];
  return {
    ...ending,
    title: t?.title?.trim() ? t.title : ending.title,
    message: t?.message?.trim() ? t.message : ending.message,
  };
}

/** Missing translations per language, for the builder's completeness check. */
export function missingTranslations(def: FormDefinition): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const language of def.languages) {
    if (language === def.defaultLanguage) continue;
    const missing: string[] = [];
    if (!def.translations?.[language]?.title?.trim()) missing.push("Form title");
    for (const [i, f] of def.fields.entries()) {
      const t = f.translations?.[language];
      const name = `Field ${i + 1}`;
      if (f.label.trim() && !t?.label?.trim()) missing.push(`${name} label`);
      if (f.description?.trim() && !t?.description?.trim()) missing.push(`${name} description`);
      for (const o of f.options ?? []) if (!t?.options?.[o.id]?.trim()) { missing.push(`${name} options`); break; }
      for (const r of f.rows ?? []) if (!t?.rows?.[r.id]?.trim()) { missing.push(`${name} rows`); break; }
    }
    for (const [i, e] of def.endings.entries()) {
      if (!e.translations?.[language]?.message?.trim()) missing.push(`Ending ${i + 1}`);
    }
    result[language] = missing;
  }
  return result;
}

// ── Answers and logic ───────────────────────────────────────────────────────

export function isEmptyAnswer(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return !value.trim();
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.length === 0;
  return Object.keys(value).length === 0;
}

export function calculatedScore(def: FormDefinition, answers: Answers, visible?: Set<string>): number {
  let total = 0;
  for (const f of def.fields) {
    if (visible && !visible.has(f.id)) continue;
    const a = answers[f.id];
    if (!f.options || a === undefined) continue;
    const ids = typeof a === "string" ? [a] : Array.isArray(a) ? a : [];
    if (f.type === "ranking") continue;
    for (const id of ids) total += f.options.find((o) => o.id === id)?.score ?? 0;
  }
  return total;
}

function conditionHolds(c: Condition, answers: Answers, visible: Set<string>, def: FormDefinition): boolean {
  const value: AnswerValue | undefined = c.fieldId === SCORE_FIELD
    ? calculatedScore(def, answers, visible)
    : visible.has(c.fieldId) ? answers[c.fieldId] : undefined;
  const empty = isEmptyAnswer(value);
  switch (c.op) {
    case "answered": return !empty;
    case "not_answered": return empty;
    case "equals":
      if (empty) return false;
      return typeof value === "number" ? value === Number(c.value) : Array.isArray(value) ? value.length === 1 && value[0] === c.value : value === c.value;
    case "not_equals":
      if (empty) return true;
      return typeof value === "number" ? value !== Number(c.value) : Array.isArray(value) ? !(value.length === 1 && value[0] === c.value) : value !== c.value;
    case "includes":
      return Array.isArray(value) ? value.includes(String(c.value)) : value === c.value;
    case "not_includes":
      return Array.isArray(value) ? !value.includes(String(c.value)) : value !== c.value;
    case "gt": case "gte": case "lt": case "lte": {
      if (typeof value !== "number" || c.value === undefined || !Number.isFinite(Number(c.value))) return false;
      const n = Number(c.value);
      return c.op === "gt" ? value > n : c.op === "gte" ? value >= n : c.op === "lt" ? value < n : value <= n;
    }
  }
}

export function ruleHolds(rule: Rule | undefined, answers: Answers, visible: Set<string>, def: FormDefinition): boolean {
  if (!rule || rule.conditions.length === 0) return true;
  const results = rule.conditions.map((c) => conditionHolds(c, answers, visible, def));
  return rule.match === "all" ? results.every(Boolean) : results.some(Boolean);
}

/** Section index for each field: fields belong to the closest preceding section. */
export function sectionsOf(def: FormDefinition): { section: FormField | null; fields: FormField[] }[] {
  const groups: { section: FormField | null; fields: FormField[] }[] = [{ section: null, fields: [] }];
  for (const f of def.fields) {
    if (f.type === "section") groups.push({ section: f, fields: [] });
    else groups[groups.length - 1].fields.push(f);
  }
  return groups.filter((g, i) => i > 0 || g.fields.length > 0);
}

/**
 * Evaluate branching. A field is visible when its section is visible and its
 * own rule holds, where conditions only see answers to visible fields.
 */
export function visibleFieldIds(def: FormDefinition, answers: Answers): Set<string> {
  const visible = new Set<string>();
  let sectionVisible = true;
  for (const f of def.fields) {
    if (f.type === "section") {
      sectionVisible = ruleHolds(f.showIf, answers, visible, def);
      if (sectionVisible) visible.add(f.id);
      continue;
    }
    if (sectionVisible && ruleHolds(f.showIf, answers, visible, def)) visible.add(f.id);
  }
  return visible;
}

export interface VisibilityExplanation {
  fieldId: string;
  visible: boolean;
  reason: string;
}

function describeCondition(c: Condition, def: FormDefinition): string {
  if (c.fieldId === SCORE_FIELD) return `score ${conditionOpLabels[c.op]} ${c.value ?? ""}`.trim();
  const source = def.fields.find((f) => f.id === c.fieldId);
  const name = source ? `“${source.label || source.id}”` : `unknown field ${c.fieldId}`;
  const option = source?.options?.find((o) => o.id === c.value)?.label;
  const value = c.op === "answered" || c.op === "not_answered" ? "" : ` “${option ?? c.value ?? ""}”`;
  return `${name} ${conditionOpLabels[c.op]}${value}`;
}

export function describeRule(rule: Rule, def: FormDefinition): string {
  const parts = rule.conditions.map((c) => describeCondition(c, def));
  return parts.join(rule.match === "all" ? " and " : " or ");
}

/** Debugger output: why each field is shown or hidden for these answers. */
export function explainVisibility(def: FormDefinition, answers: Answers): VisibilityExplanation[] {
  const visible = visibleFieldIds(def, answers);
  const out: VisibilityExplanation[] = [];
  let currentSection: FormField | null = null;
  for (const f of def.fields) {
    if (f.type === "section") currentSection = f;
    const isVisible = visible.has(f.id);
    let reason = "Always shown.";
    if (f.type !== "section" && currentSection && !visible.has(currentSection.id)) {
      reason = `Hidden because section “${currentSection.label}” is hidden.`;
    } else if (f.showIf && f.showIf.conditions.length) {
      reason = `${isVisible ? "Shown" : "Hidden"}: requires ${describeRule(f.showIf, def)}.`;
    }
    out.push({ fieldId: f.id, visible: isVisible, reason });
  }
  return out;
}

export function selectEnding(def: FormDefinition, answers: Answers): Ending | null {
  const visible = visibleFieldIds(def, answers);
  for (const e of def.endings) if (e.showIf && e.showIf.conditions.length && ruleHolds(e.showIf, answers, visible, def)) return e;
  return def.endings.find((e) => !e.showIf || e.showIf.conditions.length === 0) ?? null;
}

/** Display text for an answer, in the requested language. */
export function answerText(field: FormField, value: AnswerValue | undefined): string {
  if (value === undefined || isEmptyAnswer(value)) return "";
  const label = (id: string) => field.options?.find((o) => o.id === id)?.label ?? id;
  switch (field.type) {
    case "choice": case "dropdown": return label(String(value));
    case "multi_choice": return Array.isArray(value) ? value.map(label).join(", ") : String(value);
    case "ranking": return Array.isArray(value) ? value.map((id, i) => `${i + 1}. ${label(id)}`).join("; ") : String(value);
    case "matrix":
      if (typeof value !== "object" || Array.isArray(value)) return String(value);
      return (field.rows ?? []).filter((r) => value[r.id]).map((r) => `${r.label}: ${label(value[r.id])}`).join("; ");
    case "file": return Array.isArray(value) ? `${value.length} file${value.length === 1 ? "" : "s"}` : "";
    default: return String(value);
  }
}

/** Replace {{fieldId}} (and {{score}}) with the respondent's answers. */
export function pipeText(text: string, def: FormDefinition, answers: Answers, language: Language): string {
  if (!text.includes("{{")) return text;
  const visible = visibleFieldIds(def, answers);
  return text.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_-]{0,79})\s*\}\}/g, (match, id: string) => {
    if (id === "score") return String(calculatedScore(def, answers, visible));
    const field = def.fields.find((f) => f.id === id);
    if (!field || !visible.has(id) || field.type === "file") return "";
    return answerText(localizeField(field, language, def), answers[id]);
  });
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface DefinitionReport { errors: string[]; warnings: string[] }

function fieldName(f: FormField, i: number) {
  return `Field ${i + 1}${f.label.trim() ? ` (“${f.label.trim().slice(0, 40)}”)` : ""}`;
}

function checkRule(rule: Rule | undefined, owner: string, earlier: Map<string, FormField>, errors: string[], def: FormDefinition) {
  if (!rule) return;
  if (rule.match !== "all" && rule.match !== "any") errors.push(`${owner}: invalid rule.`);
  if (rule.conditions.length > LIMITS.conditions) errors.push(`${owner}: use at most ${LIMITS.conditions} conditions.`);
  const equalsBySource = new Map<string, Set<string>>();
  for (const c of rule.conditions) {
    if (c.fieldId === SCORE_FIELD) {
      if (!["gt", "gte", "lt", "lte", "equals", "not_equals"].includes(c.op) || !Number.isFinite(Number(c.value))) errors.push(`${owner}: score conditions need a number.`);
      continue;
    }
    const source = earlier.get(c.fieldId);
    if (!source) {
      const later = def.fields.some((f) => f.id === c.fieldId);
      errors.push(`${owner}: ${later ? "a condition refers to a question that comes later" : "a condition refers to a missing question"}.`);
      continue;
    }
    if (!isAnswerable(source)) { errors.push(`${owner}: conditions cannot refer to text blocks or sections.`); continue; }
    if (c.op === "answered" || c.op === "not_answered") continue;
    if (c.value === undefined || c.value === "") { errors.push(`${owner}: a condition is missing its value.`); continue; }
    if (["gt", "gte", "lt", "lte"].includes(c.op)) {
      if (!numericTypes.includes(source.type) || !Number.isFinite(Number(c.value))) errors.push(`${owner}: comparisons need a numeric question and a number.`);
      continue;
    }
    if (source.options && source.type !== "matrix") {
      if (!source.options.some((o) => o.id === c.value)) errors.push(`${owner}: a condition refers to an option that no longer exists.`);
      if (c.op === "equals" && (source.type === "choice" || source.type === "dropdown")) {
        const set = equalsBySource.get(source.id) ?? new Set<string>();
        set.add(String(c.value));
        equalsBySource.set(source.id, set);
      }
    } else if (source.type === "matrix") {
      errors.push(`${owner}: branching on matrix questions is not supported.`);
    }
  }
  if (rule.match === "all") {
    for (const [source, values] of equalsBySource) {
      if (values.size > 1) errors.push(`${owner}: can never be shown because “${earlier.get(source)?.label ?? source}” cannot equal two answers at once.`);
    }
  }
}

/** Errors block publication; warnings are shown but do not block. */
export function checkDefinition(def: FormDefinition): DefinitionReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!def.title.trim()) errors.push("Enter a form title.");
  if (def.title.length > LIMITS.title) errors.push(`The title can have at most ${LIMITS.title} characters.`);
  if (def.description.length > LIMITS.description) errors.push("The description is too long.");
  if (!def.languages.includes(def.defaultLanguage)) errors.push("The default language must be enabled.");
  if (def.fields.length > LIMITS.fields) errors.push(`A form can contain at most ${LIMITS.fields} fields.`);
  if (!def.fields.some(isAnswerable)) errors.push("Add at least one question.");
  if (def.quiz?.enabled && !def.fields.some((f) => f.quiz?.correctOptionIds.length)) errors.push("Add an answer key to at least one choice question.");
  if (def.endings.length > LIMITS.endings) errors.push(`Use at most ${LIMITS.endings} endings.`);
  if (!/^#[0-9a-fA-F]{6}$/.test(def.theme.accent)) errors.push("Choose a valid accent colour.");
  if (def.theme.version === 1) {
    for (const [name, color] of [["Page", def.theme.pageColor], ["Surface", def.theme.surfaceColor], ["Text", def.theme.textColor]] as const) {
      if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) errors.push(`${name} colour must be a six-digit hex value.`);
    }
  }
  if (def.theme.logoUrl && !/^https:\/\//.test(def.theme.logoUrl)) errors.push("The logo must be an https:// image address.");

  const seen = new Map<string, FormField>();
  for (const [i, f] of def.fields.entries()) {
    const name = fieldName(f, i);
    if (!isValidId(f.id)) errors.push(`${name}: invalid identifier.`);
    if (seen.has(f.id)) errors.push(`${name}: duplicate identifier ${f.id}.`);
    if (!fieldTypes.includes(f.type)) errors.push(`${name}: unsupported type.`);
    if (!f.label.trim() && f.type !== "statement") errors.push(`${name}: enter a label.`);
    if (f.type === "statement" && !f.label.trim() && !f.description?.trim()) errors.push(`${name}: add some text.`);
    if (f.label.length > LIMITS.label) errors.push(`${name}: the label is too long.`);
    if ((f.description?.length ?? 0) > LIMITS.description) errors.push(`${name}: the description is too long.`);
    if (f.image && (!/^https:\/\//.test(f.image.url) || !f.image.alt.trim())) errors.push(`${name}: images need an https:// address and alternative text.`);
    if (optionTypes.includes(f.type)) {
      const opts = f.options ?? [];
      const minimum = f.type === "multi_choice" ? 1 : 2;
      if (opts.length < minimum) errors.push(`${name}: add at least ${minimum} options.`);
      if (opts.length > LIMITS.options) errors.push(`${name}: use at most ${LIMITS.options} options.`);
      if (opts.some((o) => !o.label.trim())) errors.push(`${name}: options cannot be empty.`);
      if (new Set(opts.map((o) => o.id)).size !== opts.length || opts.some((o) => !isValidId(o.id))) errors.push(`${name}: option identifiers must be unique.`);
      if (new Set(opts.map((o) => o.label.trim().toLowerCase())).size !== opts.length) warnings.push(`${name}: two options have the same text.`);
      if (opts.some((o) => o.score !== undefined && !Number.isFinite(o.score))) errors.push(`${name}: option scores must be numbers.`);
    }
    if (def.quiz?.enabled) {
      if (f.showIf?.conditions.some((condition) => condition.fieldId === SCORE_FIELD)) errors.push(`${name}: quiz branching cannot reveal a calculated score before submission.`);
      if (f.options?.some((option) => option.score !== undefined)) errors.push(`${name}: remove calculated option scores when using quiz mode; use the answer key instead.`);
      if (f.quiz) {
        if (!["choice", "dropdown", "multi_choice"].includes(f.type)) errors.push(`${name}: only choice questions can have an answer key.`);
        if (!Number.isFinite(f.quiz.points) || f.quiz.points < 0 || f.quiz.points > 1000) errors.push(`${name}: points must be between 0 and 1000.`);
        if (!f.quiz.correctOptionIds.length) errors.push(`${name}: choose at least one correct answer.`);
        if (f.type !== "multi_choice" && f.quiz.correctOptionIds.length !== 1) errors.push(`${name}: choose one correct answer.`);
        if (new Set(f.quiz.correctOptionIds).size !== f.quiz.correctOptionIds.length || f.quiz.correctOptionIds.some((id) => !f.options?.some((option) => option.id === id))) errors.push(`${name}: the answer key refers to a missing option.`);
        if ((f.quiz.explanation?.length ?? 0) > 2000) errors.push(`${name}: the explanation is too long.`);
      }
    }
    if (f.type === "matrix") {
      const rows = f.rows ?? [];
      if (!rows.length) errors.push(`${name}: add at least one row.`);
      if (rows.length > LIMITS.rows) errors.push(`${name}: use at most ${LIMITS.rows} rows.`);
      if (rows.some((r) => !r.label.trim())) errors.push(`${name}: rows cannot be empty.`);
      if (new Set(rows.map((r) => r.id)).size !== rows.length || rows.some((r) => !isValidId(r.id))) errors.push(`${name}: row identifiers must be unique.`);
    }
    if (f.min !== undefined && !Number.isFinite(f.min)) errors.push(`${name}: minimum must be a number.`);
    if (f.max !== undefined && !Number.isFinite(f.max)) errors.push(`${name}: maximum must be a number.`);
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) errors.push(`${name}: minimum is greater than maximum.`);
    if (f.type === "number") {
      if (f.step !== undefined && !(Number.isFinite(f.step) && f.step > 0)) errors.push(`${name}: the step must be greater than 0.`);
      if (f.integer && ((f.min !== undefined && !Number.isInteger(f.min)) || (f.max !== undefined && !Number.isInteger(f.max)) || (f.step !== undefined && !Number.isInteger(f.step)))) errors.push(`${name}: whole-number fields need whole-number limits and step.`);
    }
    if (f.type === "scale" && f.step !== undefined && (!Number.isInteger(f.step) || f.step < 1 || f.step > 9)) errors.push(`${name}: the scale step must be a whole number.`);
    if (f.type === "date" || f.type === "time") {
      const valid = f.type === "date" ? isIsoDate : isClockTime;
      const kind = f.type === "date" ? "date" : "time";
      if (f.minValue !== undefined && !valid(f.minValue)) errors.push(`${name}: the earliest ${kind} is not valid.`);
      if (f.maxValue !== undefined && !valid(f.maxValue)) errors.push(`${name}: the latest ${kind} is not valid.`);
      if (f.minValue !== undefined && f.maxValue !== undefined && f.minValue > f.maxValue) errors.push(`${name}: the earliest ${kind} is after the latest.`);
    }
    if (f.type === "rating" && (!Number.isInteger(f.max ?? 5) || (f.max ?? 5) < 3 || (f.max ?? 5) > 10)) errors.push(`${name}: rating must use 3–10 steps.`);
    if (f.type === "scale") {
      const lo = f.min ?? 1, hi = f.max ?? 5;
      if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || lo > 1 || hi < 2 || hi > 10) errors.push(`${name}: a scale starts at 0 or 1 and ends between 2 and 10.`);
    }
    if (f.type === "file" && (!Number.isInteger(f.max ?? 1) || (f.max ?? 1) < 1 || (f.max ?? 1) > LIMITS.files)) errors.push(`${name}: allow 1–${LIMITS.files} files.`);
    if (f.type === "multi_choice" && f.max !== undefined && f.max > (f.options?.length ?? 0)) warnings.push(`${name}: the selection limit exceeds the number of options.`);
    if (f.required && !isAnswerable(f)) warnings.push(`${name}: text blocks and sections cannot be required.`);
    if (f.releasesAt !== undefined && (!Number.isSafeInteger(f.releasesAt) || f.releasesAt < 0 || f.releasesAt > 8640000000000000)) errors.push(`${name}: release time must be a valid UTC timestamp in milliseconds.`);
    checkRule(f.showIf, name, seen, errors, def);
    for (const [lang, t] of Object.entries(f.translations ?? {})) {
      if (!(languages as readonly string[]).includes(lang)) errors.push(`${name}: unsupported translation language ${lang}.`);
      if ((t.label?.length ?? 0) > LIMITS.label || (t.description?.length ?? 0) > LIMITS.description) errors.push(`${name}: a translation is too long.`);
    }
    seen.set(f.id, f);
  }
  for (const [i, e] of def.endings.entries()) {
    const name = `Ending ${i + 1}`;
    if (!isValidId(e.id)) errors.push(`${name}: invalid identifier.`);
    if (!e.message.trim() && !e.title.trim()) errors.push(`${name}: add a title or message.`);
    if (e.message.length > LIMITS.description) errors.push(`${name}: the message is too long.`);
    checkRule(e.showIf, name, seen, errors, def);
    if (def.quiz?.enabled && e.showIf?.conditions.some((condition) => condition.fieldId === SCORE_FIELD)) errors.push(`${name}: quiz endings cannot use calculated option scores.`);
  }
  if (def.endings.length && def.endings.every((e) => e.showIf && e.showIf.conditions.length)) {
    warnings.push("Every ending has conditions; respondents who match none see the default confirmation.");
  }
  for (const [language, missing] of Object.entries(missingTranslations(def))) {
    if (missing.length) warnings.push(`${language === "ar" ? "Arabic" : "English"} translation is incomplete (${missing.length} item${missing.length === 1 ? "" : "s"}); the ${def.defaultLanguage === "ar" ? "Arabic" : "English"} text is shown instead.`);
  }
  // Unreachable: required questions hidden by every path are fine, but fields
  // whose section can never be shown are reported by checkRule above.
  return { errors, warnings };
}

export interface AnswerCheck { answers: Answers; errors: Record<string, string>; hidden: string[] }

/**
 * Validate answers against a definition. Answers to hidden fields are dropped,
 * so logic changes can never smuggle data through invisible questions.
 * `partial` skips required checks (used for saved progress).
 */
export function checkAnswers(def: FormDefinition, input: Answers, options: { partial?: boolean; fileIds?: Set<string> } = {}): AnswerCheck {
  const visible = visibleFieldIds(def, input);
  const answers: Answers = {};
  const errors: Record<string, string> = {};
  const hidden: string[] = [];
  for (const f of def.fields) {
    if (!isAnswerable(f)) continue;
    if (!visible.has(f.id)) { hidden.push(f.id); continue; }
    const a = input[f.id];
    if (isEmptyAnswer(a)) {
      if (f.required && !options.partial) errors[f.id] = "This question is required.";
      continue;
    }
    const error = answerError(f, a as AnswerValue, options.fileIds);
    if (error) errors[f.id] = error;
    else answers[f.id] = normalizeAnswer(f, a as AnswerValue);
  }
  return { answers, errors, hidden };
}

function normalizeAnswer(f: FormField, a: AnswerValue): AnswerValue {
  if (typeof a === "string" && f.type !== "textarea") return a.trim();
  return a;
}


export function answerError(f: FormField, a: AnswerValue, fileIds?: Set<string>): string | null {
  const optionIds = new Set((f.options ?? []).map((o) => o.id));
  switch (f.type) {
    case "number": case "rating": case "scale": {
      if (typeof a !== "number" || !Number.isFinite(a)) return "Enter a number.";
      if (f.type === "rating" && (!Number.isInteger(a) || a < 1 || a > (f.max ?? 5))) return "Choose a rating.";
      if (f.type === "scale") {
        const lo = f.min ?? 1;
        if (!Number.isInteger(a) || a < lo || a > (f.max ?? 5) || (a - lo) % (f.step ?? 1) !== 0) return "Choose a value on the scale.";
      }
      if (f.type === "number") {
        if (f.integer && !Number.isInteger(a)) return "Enter a whole number.";
        if (f.min !== undefined && a < f.min) return `Enter ${f.min} or more.`;
        if (f.max !== undefined && a > f.max) return `Enter ${f.max} or less.`;
        if (f.step !== undefined && f.step > 0 && !isOnStep(a, f.step, f.min ?? 0)) return f.min ? `Enter ${f.min} plus a multiple of ${f.step}.` : `Enter a multiple of ${f.step}.`;
      }
      return null;
    }
    case "choice": case "dropdown":
      return typeof a === "string" && optionIds.has(a) ? null : "Choose one of the options.";
    case "multi_choice": {
      if (!Array.isArray(a) || new Set(a).size !== a.length || !a.every((x) => optionIds.has(x))) return "Choose from the options.";
      if (f.min !== undefined && a.length < f.min) return `Choose at least ${f.min}.`;
      if (f.max !== undefined && a.length > f.max) return `Choose at most ${f.max}.`;
      return null;
    }
    case "ranking":
      return Array.isArray(a) && a.length === optionIds.size && new Set(a).size === a.length && a.every((x) => optionIds.has(x)) ? null : "Rank every option.";
    case "matrix": {
      if (typeof a !== "object" || Array.isArray(a)) return "Answer each row.";
      const rowIds = new Set((f.rows ?? []).map((r) => r.id));
      if (!Object.entries(a).every(([row, col]) => rowIds.has(row) && optionIds.has(col))) return "Answer each row.";
      if (f.required && [...rowIds].some((r) => !a[r])) return "Answer every row.";
      return null;
    }
    case "file": {
      if (!Array.isArray(a) || !a.length) return "Upload a file.";
      if (a.length > (f.max ?? 1)) return `Upload at most ${f.max ?? 1} file${(f.max ?? 1) === 1 ? "" : "s"}.`;
      if (fileIds && !a.every((id) => fileIds.has(id))) return "An uploaded file is missing. Upload it again.";
      return null;
    }
    default: {
      if (typeof a !== "string") return "Enter text.";
      const limit = f.type === "textarea" ? LIMITS.textAnswer : LIMITS.shortTextAnswer;
      if (a.length > limit) return `Use at most ${limit} characters.`;
      const text = a.trim();
      if ((f.type === "text" || f.type === "textarea") && f.min !== undefined && text.length < f.min) return `Use at least ${f.min} characters.`;
      if ((f.type === "text" || f.type === "textarea") && f.max !== undefined && text.length > f.max) return `Use at most ${f.max} characters.`;
      if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "Enter a valid email address.";
      if (f.type === "phone" && !/^\+?[\d\s().-]{5,30}$/.test(text)) return "Enter a valid phone number.";
      if (f.type === "url") {
        try { if (!["https:", "http:"].includes(new URL(text).protocol)) return "Enter a web address starting with https://."; }
        catch { return "Enter a web address starting with https://."; }
      }
      if (f.type === "date") {
        if (!isIsoDate(text)) return "Enter a valid date.";
        if (f.minValue && isIsoDate(f.minValue) && text < f.minValue) return `Choose ${f.minValue} or later.`;
        if (f.maxValue && isIsoDate(f.maxValue) && text > f.maxValue) return `Choose ${f.maxValue} or earlier.`;
      }
      if (f.type === "time") {
        if (!isClockTime(text)) return "Enter a valid time.";
        if (f.minValue && isClockTime(f.minValue) && text < f.minValue) return `Choose ${f.minValue} or later.`;
        if (f.maxValue && isClockTime(f.maxValue) && text > f.maxValue) return `Choose ${f.maxValue} or earlier.`;
      }
      return null;
    }
  }
}

/** Text indexed for inbox search. Excludes files; bounded for the search index. */
export function searchTextFor(def: FormDefinition, answers: Answers): string {
  const parts: string[] = [];
  for (const f of def.fields) {
    if (!isAnswerable(f) || f.type === "file") continue;
    const text = answerText(f, answers[f.id]);
    if (text) parts.push(text);
  }
  return parts.join(" \n ").slice(0, 16000);
}

// ── Aggregation ─────────────────────────────────────────────────────────────

/** Per-field counts: `answered` plus, for option fields, `options[optionId]`. */
export type FieldAggregate = { answered: number; options?: Record<string, number>; sum?: number };
export type Aggregates = Record<string, FieldAggregate>;

export function aggregateDelta(def: FormDefinition, answers: Answers, sign: 1 | -1, into: Aggregates): Aggregates {
  for (const f of def.fields) {
    if (!isAnswerable(f)) continue;
    const a = answers[f.id];
    if (isEmptyAnswer(a)) continue;
    const agg = into[f.id] ?? { answered: 0 };
    agg.answered += sign;
    if (f.type === "choice" || f.type === "dropdown" || f.type === "multi_choice") {
      const ids = typeof a === "string" ? [a] : Array.isArray(a) ? a : [];
      agg.options = agg.options ?? {};
      for (const id of ids) agg.options[id] = (agg.options[id] ?? 0) + sign;
    } else if (f.type === "ranking" && Array.isArray(a) && a.length) {
      // Count first-place choices.
      agg.options = agg.options ?? {};
      agg.options[a[0]] = (agg.options[a[0]] ?? 0) + sign;
    } else if ((f.type === "rating" || f.type === "scale") && typeof a === "number") {
      agg.options = agg.options ?? {};
      agg.options[`v${a}`] = (agg.options[`v${a}`] ?? 0) + sign;
      agg.sum = (agg.sum ?? 0) + sign * a;
    }
    into[f.id] = agg;
  }
  return into;
}

export const MINIMUM_GROUP_SIZE = 5;

export interface PublicSummaryQuestion {
  fieldId: string;
  label: string;
  type: FieldType;
  answeredCount: number | null;
  distribution: { option: string; count: number | null }[] | null;
}

/**
 * Privacy-preserving summary: aggregates only, small groups suppressed, no
 * free text or identities. Used for integrations and shared summaries.
 */
/**
 * Option counts safe to share outside Chaos: buckets below `minimum` are merged into one
 * "Other" entry with no count. When that would hide a single bucket, the smallest shown
 * bucket is merged too; otherwise the hidden count could be worked out by subtracting the
 * shown counts from the answered total.
 */
export function suppressSmallBuckets(buckets: { option: string; count: number }[], minimum: number): { option: string; count: number | null }[] {
  const hidden = new Set(buckets.filter((b) => b.count > 0 && b.count < minimum));
  if (hidden.size === 1) {
    const next = buckets.filter((b) => !hidden.has(b)).sort((a, b) => a.count - b.count)[0];
    if (next) hidden.add(next);
  }
  const out: { option: string; count: number | null }[] = buckets.filter((b) => !hidden.has(b)).map((b) => ({ option: b.option, count: b.count }));
  if (hidden.size) out.push({ option: `Other (fewer than ${minimum})`, count: null });
  return out;
}

export function publicSummary(def: FormDefinition, aggregates: Aggregates, responseCount: number, minimum = MINIMUM_GROUP_SIZE): { suppressed: boolean; questions: PublicSummaryQuestion[] } {
  if (responseCount < minimum) return { suppressed: true, questions: [] };
  const questions: PublicSummaryQuestion[] = [];
  for (const f of def.fields) {
    if (!isAnswerable(f)) continue;
    const agg = aggregates[f.id] ?? { answered: 0 };
    const answeredCount = agg.answered >= minimum ? agg.answered : null;
    let distribution: PublicSummaryQuestion["distribution"] = null;
    const buckets: { option: string; count: number }[] = [];
    if (f.type === "choice" || f.type === "dropdown" || f.type === "multi_choice" || f.type === "ranking") {
      for (const o of f.options ?? []) buckets.push({ option: o.label, count: agg.options?.[o.id] ?? 0 });
    } else if (f.type === "rating" || f.type === "scale") {
      const lo = f.type === "rating" ? 1 : f.min ?? 1;
      const hi = f.max ?? 5;
      for (let n = lo; n <= hi; n++) buckets.push({ option: String(n), count: agg.options?.[`v${n}`] ?? 0 });
    }
    if (buckets.length && answeredCount !== null) distribution = suppressSmallBuckets(buckets, minimum);
    questions.push({ fieldId: f.id, label: f.label, type: f.type, answeredCount, distribution });
  }
  return { suppressed: false, questions };
}

// ── CSV ─────────────────────────────────────────────────────────────────────

const PLAIN_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/** Quote a CSV cell and neutralise spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  let s = typeof value === "string" ? value : value === undefined || value === null ? "" : typeof value === "number" ? String(value) : JSON.stringify(value);
  // A plain number such as -5 or +3.5 is not a formula, so leave it unchanged.
  if (/^[\s]*[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
