// Pure translation between the ChatGPT app (MCP) tool contract and Chaos form
// definitions. No Convex imports, so it is unit-testable and shared with the
// Next.js /mcp route, which builds its input schemas from these constants.

import { emptyDefinition, isValidId, LIMITS, newId, themePresetIds } from "./formLogic";
import type {
  Choice, FieldType, FormDefinition, FormField, FormTheme, Presentation, ThemeBackdrop, ThemeButtons, ThemeChrome, ThemeCover, ThemeFont, ThemePresetId, ThemeSound,
} from "./formLogic";

/** Question types in plain words; the model reads these names. */
export const MCP_QUESTION_TYPES = [
  "short_text", "long_text", "single_choice", "multiple_choice", "dropdown",
  "number", "email", "phone", "url", "date", "time",
  "rating", "scale", "ranking", "matrix", "statement", "section",
] as const;
export type McpQuestionType = (typeof MCP_QUESTION_TYPES)[number];

export const MCP_PRESENTATIONS = ["page", "one_at_a_time", "sections", "swipe"] as const;
export type McpPresentation = (typeof MCP_PRESENTATIONS)[number];

export const MCP_GAME_STATES = ["lobby", "question", "reveal", "leaderboard", "ended"] as const;
export const MCP_GAME_STEPS = ["lobby", "question", "reveal", "leaderboard"] as const;

/** A game draft uses the ordinary form definition and publication workflow. */
export function parseGameDraftInput(raw: unknown): { input: Partial<McpFormInput> } | { errors: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { errors: ["Input must be an object."] };
  const parsed = parseFormInput({ ...raw, quizMode: true });
  if ("errors" in parsed) return parsed;
  const errors: string[] = [];
  const questions = parsed.input.questions ?? [];
  if (!questions.length || questions.length > 100) errors.push("A game needs 1 to 100 questions.");
  for (const [i, q] of questions.entries()) {
    const at = `questions[${i}]`;
    if (!GRADABLE_TYPES.includes(q.type)) errors.push(`${at}: games need single_choice, multiple_choice or dropdown questions.`);
    if (!q.label.trim()) errors.push(`${at}.label is required.`);
    if (!q.options || q.options.length < 2 || q.options.length > 4) errors.push(`${at}: use 2 to 4 options.`);
    if (q.options && new Set(q.options.map((s) => s.trim())).size !== q.options.length) errors.push(`${at}: option labels must be distinct.`);
    if (q.options?.some((s) => !s.trim())) errors.push(`${at}: option labels cannot be blank.`);
    if (!q.correctAnswers?.length) errors.push(`${at}: choose at least one correct answer.`);
    if (q.type !== "multiple_choice" && q.correctAnswers?.length !== 1) errors.push(`${at}: choose exactly one correct answer.`);
  }
  return errors.length ? { errors } : parsed;
}

const toFieldType: Record<McpQuestionType, FieldType> = {
  short_text: "text", long_text: "textarea", single_choice: "choice", multiple_choice: "multi_choice",
  dropdown: "dropdown", number: "number", email: "email", phone: "phone", url: "url", date: "date",
  time: "time", rating: "rating", scale: "scale", ranking: "ranking", matrix: "matrix",
  statement: "statement", section: "section",
};
const fromFieldType = Object.fromEntries(Object.entries(toFieldType).map(([k, v]) => [v, k])) as Partial<Record<FieldType, McpQuestionType>>;
const toPresentation: Record<McpPresentation, Presentation> = { page: "page", one_at_a_time: "conversational", sections: "sections", swipe: "swipe" };
const fromPresentation: Record<Presentation, McpPresentation> = { page: "page", conversational: "one_at_a_time", sections: "sections", swipe: "swipe" };

/** Types that can carry a quiz answer key. */
export const GRADABLE_TYPES: McpQuestionType[] = ["single_choice", "multiple_choice", "dropdown"];
const OPTION_TYPES: McpQuestionType[] = ["single_choice", "multiple_choice", "dropdown", "ranking", "matrix"];

export interface McpQuestion {
  id?: string;
  type: McpQuestionType;
  label: string;
  description?: string;
  required?: boolean;
  options?: string[];
  rows?: string[];
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  /** Quiz mode: labels of the correct options. */
  correctAnswers?: string[];
  points?: number;
  explanation?: string;
}

export interface McpFormInput {
  title: string;
  description?: string;
  quizMode?: boolean;
  /** Quiz mode: whether respondents see the answer key and explanations after submitting (default true). */
  showAnswers?: boolean;
  presentation?: McpPresentation;
  questions: McpQuestion[];
  theme?: McpThemePatch;
  sound?: McpSound;
}

const isString = (x: unknown): x is string => typeof x === "string";
const isStringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every(isString);
const isNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

// ── Themes and sounds ───────────────────────────────────────────────────────
// Preset palettes live in components/forms/formThemes.ts, which Convex cannot
// import. The Next.js side (lib/mcp/themes.ts) resolves a preset name into its
// full look and sends that; this file validates whatever arrives and applies it.

export const MCP_FONTS = ["sans", "display", "serif", "editorial", "elegant", "rounded", "mono", "roboto", "segoe"] as const satisfies readonly ThemeFont[];
export const MCP_RADII = ["none", "small", "large"] as const;
export const MCP_BUTTONS = ["solid", "soft", "pill", "outline", "brutal"] as const satisfies readonly ThemeButtons[];
export const MCP_COVERS = ["none", "classic", "split", "poster", "minimal", "editorial", "scroll", "terminal", "arcade"] as const satisfies readonly ThemeCover[];
export const MCP_BACKDROPS = ["none", "dots", "grid", "gradient", "aurora", "noise", "stripes", "scanlines"] as const satisfies readonly ThemeBackdrop[];
export const MCP_CHROMES = ["google", "microsoft", "apple"] as const satisfies readonly ThemeChrome[];
export const MCP_LAYOUTS = ["flat", "card", "focus"] as const;
export const MCP_APPEARANCES = ["fixed", "auto"] as const;
export const MCP_SOUNDS = ["off", "soft", "pop", "wood", "arcade"] as const satisfies readonly ThemeSound[];
export type McpSound = (typeof MCP_SOUNDS)[number];

const SOUND_ALIASES: Record<string, McpSound> = { glass: "soft", silent: "off", none: "off", mute: "off", muted: "off" };
/** Accepts pack ids and the names people use ("Glass", "silent"), any case. */
export function normalizeSound(value: unknown): McpSound | undefined {
  if (!isString(value)) return undefined;
  const key = value.trim().toLowerCase();
  return (MCP_SOUNDS as readonly string[]).includes(key) ? (key as McpSound) : SOUND_ALIASES[key];
}

/** The parts of a theme this tool can change. Logo and sound are separate choices. */
export interface McpThemePatch {
  /** Preset the look came from. When present, every look key must be present too. */
  preset?: ThemePresetId;
  accent?: string;
  pageColor?: string;
  surfaceColor?: string;
  textColor?: string;
  font?: ThemeFont;
  radius?: (typeof MCP_RADII)[number];
  buttons?: ThemeButtons;
  cover?: ThemeCover;
  backdrop?: ThemeBackdrop;
  layout?: (typeof MCP_LAYOUTS)[number];
  appearance?: (typeof MCP_APPEARANCES)[number];
  /** Optional page chrome of the Google Forms / Microsoft Forms / Flow looks. Applying a preset without it clears it. */
  chrome?: ThemeChrome;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const THEME_ENUMS = {
  font: MCP_FONTS, radius: MCP_RADII, buttons: MCP_BUTTONS, cover: MCP_COVERS, backdrop: MCP_BACKDROPS, layout: MCP_LAYOUTS, appearance: MCP_APPEARANCES, chrome: MCP_CHROMES,
} as const;
const THEME_COLORS = ["accent", "pageColor", "surfaceColor", "textColor"] as const;
const LOOK_KEYS = [...THEME_COLORS, ...(Object.keys(THEME_ENUMS) as (keyof typeof THEME_ENUMS)[])];

export function parseThemePatch(raw: unknown): { theme: McpThemePatch } | { errors: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { errors: ["theme must be an object."] };
  const b = raw as Record<string, unknown>;
  const errors: string[] = [];
  const out: Record<string, string> = {};
  for (const key of Object.keys(b)) {
    if (b[key] === undefined) continue;
    if (key !== "preset" && !LOOK_KEYS.includes(key as never)) errors.push(`theme.${key} is not a theme setting.`);
  }
  if (b.preset !== undefined) {
    if (!isString(b.preset) || !(themePresetIds as readonly string[]).includes(b.preset)) errors.push(`theme.preset must be one of ${themePresetIds.join(", ")}.`);
    else out.preset = b.preset;
  }
  for (const key of THEME_COLORS) {
    if (b[key] === undefined) continue;
    if (!isString(b[key]) || !HEX.test(b[key] as string)) errors.push(`theme.${key} must be a six-digit hex colour like #1a73e8.`);
    else out[key] = (b[key] as string).toLowerCase();
  }
  for (const [key, allowed] of Object.entries(THEME_ENUMS)) {
    if (b[key] === undefined) continue;
    if (!isString(b[key]) || !(allowed as readonly string[]).includes(b[key] as string)) errors.push(`theme.${key} must be one of ${allowed.join(", ")}.`);
    else out[key] = b[key] as string;
  }
  if (out.preset && !errors.length) {
    const missing = LOOK_KEYS.filter((k) => k !== "chrome" && out[k] === undefined);
    if (missing.length) errors.push(`theme.preset needs the preset's full look (missing ${missing.join(", ")}); use the set_form_theme tool.`);
  }
  return errors.length ? { errors } : { theme: out as McpThemePatch };
}

const relativeLuminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const onAccentColor = (accent: string) => (contrast(accent, "#ffffff") >= contrast(accent, "#111111") ? "#ffffff" : "#111111");
const validHex = (v: string | undefined): v is string => !!v && HEX.test(v);

/**
 * Same WCAG checks as contrastIssues in components/forms/formThemes.ts (a unit
 * test keeps the two identical): text 4.5:1, accent on the page 3:1.
 */
export function themeContrastIssues(theme: FormTheme): { label: string; ratio: number }[] {
  if (theme.version !== 1) return [];
  const page = validHex(theme.pageColor) ? theme.pageColor : "#f5f4f0";
  const surface = validHex(theme.surfaceColor) ? theme.surfaceColor : "#ffffff";
  const text = validHex(theme.textColor) ? theme.textColor : "#202020";
  const accent = validHex(theme.accent) ? theme.accent : "#3595e3";
  const checks: [string, number, number][] = [
    ["Text on page", contrast(text, page), 4.5],
    ["Text on form surface", contrast(text, surface), 4.5],
    ["Accent on page", contrast(accent, page), 3],
    ["Button label on accent", contrast(onAccentColor(accent), accent), 4.5],
  ];
  return checks.filter(([, ratio, min]) => ratio < min).map(([label, ratio]) => ({ label, ratio: Math.round(ratio * 10) / 10 }));
}

export function themeWarnings(theme: FormTheme): string[] {
  return themeContrastIssues(theme).map((i) => `${i.label} is hard to read (contrast ${i.ratio}:1). Choose colours that differ more in lightness.`);
}

/**
 * Apply a patch to a form's theme. Logo and sound are kept unless `sound` is
 * given. A preset sets `preset`; overriding single properties keeps the preset
 * id, which is how the app shows "Paper · edited". With no preset at all the
 * theme is "custom".
 */
export function applyThemePatch(current: FormTheme, patch: McpThemePatch, sound?: McpSound): FormTheme {
  const dark = current.background === "dark";
  const base: FormTheme = current.version === 1 ? current : {
    ...current, version: 1, preset: "custom",
    pageColor: dark ? "#171717" : "#f5f4f0", surfaceColor: dark ? "#242424" : "#ffffff", textColor: dark ? "#f5f5f5" : "#202020", layout: "flat",
  };
  const { preset, ...look } = patch;
  const next: FormTheme = { ...base, ...look, version: 1, preset: preset ?? base.preset ?? "custom" };
  // A preset replaces the whole look, so chrome from the previous preset must not linger.
  if (preset && !look.chrome) delete next.chrome;
  // The page colour decides whether the form is dark; older code paths read this.
  if (look.pageColor) next.background = relativeLuminance(look.pageColor) < 0.2 ? "dark" : "plain";
  if (sound) next.sound = sound;
  return next;
}

/** The theme as the model sees it. */
export function themeView(theme: FormTheme) {
  return {
    preset: theme.preset ?? "custom",
    accent: theme.accent, pageColor: theme.pageColor, surfaceColor: theme.surfaceColor, textColor: theme.textColor,
    font: theme.font, radius: theme.radius, buttons: theme.buttons ?? "solid", cover: theme.cover ?? "none", backdrop: theme.backdrop ?? "none",
    layout: theme.layout ?? "flat", appearance: theme.appearance ?? "fixed", chrome: theme.chrome ?? null, hasLogo: !!theme.logoUrl,
    sound: theme.sound ?? "soft",
  };
}

/**
 * Validate tool input. The /mcp route validates with zod first; this runs again
 * on the Convex side so the backend never trusts its caller.
 * `partial` allows omitting title/questions (update_form).
 */
export function parseFormInput(raw: unknown, partial = false): { input: Partial<McpFormInput> } | { errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { errors: ["Input must be an object."] };
  const b = raw as Record<string, unknown>;
  const out: Partial<McpFormInput> = {};
  if (b.title !== undefined || !partial) {
    if (!isString(b.title) || !b.title.trim()) errors.push("title is required.");
    else if (b.title.trim().length > LIMITS.title) errors.push(`title can have at most ${LIMITS.title} characters.`);
    else out.title = b.title.trim();
  }
  if (b.description !== undefined) {
    if (!isString(b.description) || b.description.length > LIMITS.description) errors.push(`description must be text of at most ${LIMITS.description} characters.`);
    else out.description = b.description;
  }
  if (b.quizMode !== undefined) {
    if (typeof b.quizMode !== "boolean") errors.push("quizMode must be true or false.");
    else out.quizMode = b.quizMode;
  }
  if (b.showAnswers !== undefined) {
    if (typeof b.showAnswers !== "boolean") errors.push("showAnswers must be true or false.");
    else out.showAnswers = b.showAnswers;
  }
  if (b.presentation !== undefined) {
    if (!MCP_PRESENTATIONS.includes(b.presentation as McpPresentation)) errors.push(`presentation must be one of ${MCP_PRESENTATIONS.join(", ")}.`);
    else out.presentation = b.presentation as McpPresentation;
  }
  if (b.theme !== undefined) {
    const parsed = parseThemePatch(b.theme);
    if ("errors" in parsed) errors.push(...parsed.errors);
    else out.theme = parsed.theme;
  }
  if (b.sound !== undefined) {
    const sound = normalizeSound(b.sound);
    if (!sound) errors.push(`sound must be one of ${MCP_SOUNDS.join(", ")} (off = silent).`);
    else out.sound = sound;
  }
  if (b.questions !== undefined || !partial) {
    if (!Array.isArray(b.questions)) errors.push("questions must be a list.");
    else if (b.questions.length > LIMITS.fields) errors.push(`Use at most ${LIMITS.fields} questions.`);
    else {
      const ids = new Set<string>();
      out.questions = [];
      for (const [i, value] of b.questions.entries()) {
        const at = `questions[${i}]`;
        if (!value || typeof value !== "object") { errors.push(`${at} must be an object.`); continue; }
        const q = value as Record<string, unknown>;
        if (!MCP_QUESTION_TYPES.includes(q.type as McpQuestionType)) { errors.push(`${at}.type must be one of ${MCP_QUESTION_TYPES.join(", ")}.`); continue; }
        const type = q.type as McpQuestionType;
        if (!isString(q.label)) { errors.push(`${at}.label is required.`); continue; }
        if (q.label.length > LIMITS.label) errors.push(`${at}.label can have at most ${LIMITS.label} characters.`);
        if (q.id !== undefined) {
          if (!isString(q.id) || !isValidId(q.id)) errors.push(`${at}.id is not a valid question id; omit it for new questions.`);
          else if (ids.has(q.id)) errors.push(`${at}.id is used twice.`);
          else ids.add(q.id);
        }
        for (const key of ["options", "rows", "correctAnswers"] as const) {
          if (q[key] === undefined) continue;
          if (!isStringArray(q[key])) errors.push(`${at}.${key} must be a list of text.`);
          else if ((q[key] as string[]).length > LIMITS.options) errors.push(`${at}.${key} can have at most ${LIMITS.options} entries.`);
          else if ((q[key] as string[]).some((s) => s.length > LIMITS.label)) errors.push(`${at}.${key} entries can have at most ${LIMITS.label} characters.`);
        }
        for (const key of ["min", "max", "points"] as const) {
          if (q[key] !== undefined && !isNumber(q[key])) errors.push(`${at}.${key} must be a number.`);
        }
        for (const key of ["description", "minLabel", "maxLabel", "explanation"] as const) {
          if (q[key] !== undefined && (!isString(q[key]) || (q[key] as string).length > LIMITS.description)) errors.push(`${at}.${key} must be text.`);
        }
        if (q.required !== undefined && typeof q.required !== "boolean") errors.push(`${at}.required must be true or false.`);
        if (q.correctAnswers !== undefined && !GRADABLE_TYPES.includes(type)) errors.push(`${at}: only ${GRADABLE_TYPES.join(", ")} questions can have correctAnswers.`);
        if (isStringArray(q.correctAnswers) && isStringArray(q.options)) {
          const options = q.options;
          const missing = q.correctAnswers.filter((a) => !options.some((o) => o.trim() === a.trim()));
          if (missing.length) errors.push(`${at}.correctAnswers must match option labels exactly (not found: ${missing.join(", ")}).`);
        }
        out.questions.push({
          id: isString(q.id) ? q.id : undefined,
          type,
          label: q.label,
          description: isString(q.description) ? q.description : undefined,
          required: q.required === true,
          options: isStringArray(q.options) ? q.options : undefined,
          rows: isStringArray(q.rows) ? q.rows : undefined,
          min: isNumber(q.min) ? q.min : undefined,
          max: isNumber(q.max) ? q.max : undefined,
          minLabel: isString(q.minLabel) ? q.minLabel : undefined,
          maxLabel: isString(q.maxLabel) ? q.maxLabel : undefined,
          correctAnswers: isStringArray(q.correctAnswers) ? q.correctAnswers : undefined,
          points: isNumber(q.points) ? q.points : undefined,
          explanation: isString(q.explanation) ? q.explanation : undefined,
        });
      }
    }
  }
  return errors.length ? { errors } : { input: out };
}

/** Options keep their ids when the label is unchanged, so results stay comparable across edits. */
function toChoices(labels: string[], previous: Choice[] | undefined, prefix: string): Choice[] {
  const used = new Set<string>();
  return labels.map((raw) => {
    const label = raw.trim();
    const match = previous?.find((c) => c.label.trim() === label && !used.has(c.id));
    const id = match?.id ?? newId(prefix);
    used.add(id);
    return match ? { ...match, label } : { id, label };
  });
}

/**
 * Build a definition from tool input. With `previous` (update_form), settings
 * the tool does not carry (theme, logic, translations, endings, images) are kept
 * for questions whose id and type are unchanged.
 */
export function toDefinition(input: Partial<McpFormInput>, previous?: FormDefinition): FormDefinition {
  const base: FormDefinition = previous ?? emptyDefinition(input.title ?? "Untitled form");
  const quizEnabled = input.quizMode ?? base.quiz?.enabled ?? false;
  let fields = base.fields;
  if (input.questions) {
    const taken = new Set<string>();
    fields = input.questions.map((q) => {
      const type = toFieldType[q.type];
      const prior = q.id ? previous?.fields.find((f) => f.id === q.id && f.type === type) : undefined;
      let id = prior?.id ?? q.id ?? newId("q");
      if (taken.has(id) || !isValidId(id)) id = newId("q");
      taken.add(id);
      const field: FormField = {
        ...(prior ?? {}),
        id,
        type,
        label: q.label.trim(),
        description: q.description?.trim() || undefined,
        required: type === "statement" || type === "section" ? false : !!q.required,
      };
      if (!field.description) delete field.description;
      if (OPTION_TYPES.includes(q.type)) field.options = toChoices(q.options ?? [], prior?.options, "o");
      else delete field.options;
      if (q.type === "matrix") field.rows = toChoices(q.rows ?? [], prior?.rows, "r");
      else delete field.rows;
      if (q.type === "rating") { field.max = q.max ?? prior?.max ?? 5; delete field.min; }
      else if (q.type === "scale") { field.min = q.min ?? prior?.min ?? 1; field.max = q.max ?? prior?.max ?? 5; }
      else if (["number", "short_text", "long_text", "multiple_choice"].includes(q.type)) {
        if (q.min !== undefined) field.min = q.min; else delete field.min;
        if (q.max !== undefined) field.max = q.max; else delete field.max;
      } else { delete field.min; delete field.max; }
      if (q.type === "rating" || q.type === "scale") {
        if (q.minLabel !== undefined) field.minLabel = q.minLabel || undefined;
        if (q.maxLabel !== undefined) field.maxLabel = q.maxLabel || undefined;
      } else { delete field.minLabel; delete field.maxLabel; }
      delete field.quiz;
      if (quizEnabled && GRADABLE_TYPES.includes(q.type) && q.correctAnswers?.length) {
        const correct = q.correctAnswers.map((a) => field.options!.find((o) => o.label === a.trim())?.id).filter((x): x is string => !!x);
        if (correct.length) {
          field.quiz = { correctOptionIds: [...new Set(correct)], points: Math.min(1000, Math.max(0, q.points ?? 1)) };
          if (q.explanation?.trim()) field.quiz.explanation = q.explanation.trim().slice(0, 2000);
        }
      }
      if (quizEnabled && field.options) field.options = field.options.map(({ score: _score, ...o }) => o);
      return field;
    });
    // Logic that points at removed questions would block publishing; drop it.
    const kept = new Set(fields.map((f) => f.id));
    fields = fields.map((f) => {
      if (f.showIf?.conditions.some((c) => !c.fieldId.startsWith("calc:") && !kept.has(c.fieldId))) {
        const copy = { ...f };
        delete copy.showIf;
        return copy;
      }
      return f;
    });
  }
  const def: FormDefinition = {
    ...base,
    title: input.title ?? base.title,
    description: input.description ?? base.description,
    presentation: input.presentation ? toPresentation[input.presentation] : base.presentation,
    fields,
  };
  const showAnswers = input.showAnswers ?? base.quiz?.showAnswers;
  if (quizEnabled) def.quiz = showAnswers === false ? { enabled: true, showAnswers: false } : { enabled: true };
  else delete def.quiz;
  // Forms created from ChatGPT start with sound on (Glass); edits keep whatever the form has.
  const sound = input.sound ?? (previous ? undefined : "soft");
  if (input.theme || sound) def.theme = applyThemePatch(base.theme, input.theme ?? {}, sound);
  return def;
}

export interface McpQuestionView extends McpQuestion {
  id: string;
  /** Present when the question uses features this tool cannot edit (they are kept on update). */
  alsoHas?: string[];
}

/** The draft as the model sees it. Answer keys are included: only the owner can call this. */
export function fromDefinition(def: FormDefinition): { title: string; description: string; quizMode: boolean; showAnswers?: boolean; presentation: McpPresentation; questions: McpQuestionView[]; unsupported: string[]; theme: ReturnType<typeof themeView> } {
  const unsupported = new Set<string>();
  const questions: McpQuestionView[] = [];
  for (const f of def.fields) {
    const type = fromFieldType[f.type];
    if (!type) { unsupported.add(`${f.type} questions (kept, but not shown here)`); continue; }
    const q: McpQuestionView = { id: f.id, type, label: f.label, required: f.required };
    if (f.description) q.description = f.description;
    if (f.options) q.options = f.options.map((o) => o.label);
    if (f.rows) q.rows = f.rows.map((r) => r.label);
    if (f.min !== undefined) q.min = f.min;
    if (f.max !== undefined) q.max = f.max;
    if (f.minLabel) q.minLabel = f.minLabel;
    if (f.maxLabel) q.maxLabel = f.maxLabel;
    if (f.quiz) {
      q.correctAnswers = f.quiz.correctOptionIds.map((id) => f.options?.find((o) => o.id === id)?.label).filter((x): x is string => !!x);
      q.points = f.quiz.points;
      if (f.quiz.explanation) q.explanation = f.quiz.explanation;
    }
    const also: string[] = [];
    if (f.showIf) also.push("show-if logic");
    if (f.image) also.push("image");
    if (f.translations && Object.keys(f.translations).length) also.push("translations");
    if (f.options?.some((o) => o.score !== undefined)) also.push("option scores");
    if (also.length) q.alsoHas = also;
    questions.push(q);
  }
  if (def.endings.length) unsupported.add("custom endings");
  return {
    title: def.title,
    description: def.description,
    quizMode: !!def.quiz?.enabled,
    ...(def.quiz?.enabled ? { showAnswers: def.quiz.showAnswers !== false } : {}),
    presentation: fromPresentation[def.presentation] ?? "page",
    questions,
    unsupported: [...unsupported],
    theme: themeView(def.theme),
  };
}
