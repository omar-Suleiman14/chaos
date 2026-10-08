// Pure translation between the v1 integration contract (docs/integration-api-v1.md)
// and Chaos records. No Convex imports, so it is unit-testable.

import {
  emptyDefinition, fieldTypes, isValidId, LIMITS, newId, suppressSmallBuckets,
} from "./formLogic";
import type { Choice, FieldType, FormDefinition, FormField } from "./formLogic";
import { toDefinition, type McpQuestion } from "./mcpContract";

export const API_VERSION = "1";
export const API_FORM_FIELD_TYPES = [
  "text", "textarea", "choice", "dropdown", "multi_choice", "number", "email", "phone", "url",
  "date", "time", "rating", "scale", "ranking", "matrix", "statement", "section",
] as const;
export const API_QUIZ_FIELD_TYPES = ["mcq", "true_false", "multi_select", "written"] as const;
export type QuizType = (typeof API_QUIZ_FIELD_TYPES)[number];
const API_OPTION_LIMIT = 50;

export interface ApiField {
  id: string;
  type: string;
  label: string;
  description?: string;
  required?: boolean;
  options?: string[];
  rows?: string[];
  min?: number;
  max?: number;
  correctAnswer?: string;
  correctAnswers?: string[];
  keywords?: string[];
  points?: number;
}

export interface DraftBody {
  kind: "form" | "quiz";
  title: string;
  description: string;
  fields: ApiField[];
  sourceLabel?: string;
  source?: ExternalSource;
  sourceWarnings?: string[];
}

export interface QuizQuestionInput {
  type: QuizType;
  questionText: string;
  options?: string[];
  correctAnswer?: string;
  correctAnswers?: string[];
  keywords?: string[];
  points: number;
}

const isString = (x: unknown): x is string => typeof x === "string";
const isStringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every(isString);
const isFiniteNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * Source labels are shown to the creator as provenance. An address or path (for example a
 * private page link with a token, or a file location) could leak what the source app keeps
 * private, so only plain names are accepted.
 */
export function looksLikeAddress(label: string): boolean {
  const text = label.trim();
  return /[a-z][a-z0-9+.-]*:\/\//i.test(text) // any scheme://
    || /^(?:\/|~\/|\.{1,2}\/|[a-z]:[\\/]|\\\\)/i.test(text) // /abs, ~/, ./, ../, C:\, \\share
    || /(?:^|\s)(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*/i.test(text) // example.com/path
    || /[?&](?:token|key|secret|sig|signature|auth|code|access_token)=/i.test(text);
}

/**
 * Validate a POST /drafts or PATCH /items/{id} body. `kind` is required for
 * creation and taken from the item for updates.
 */
export function parseDraftBody(raw: unknown, kind?: "form" | "quiz"): { body: DraftBody } | { errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { errors: ["The body must be a JSON object."] };
  const b = raw as Record<string, unknown>;
  const resolvedKind = kind ?? b.kind;
  if (resolvedKind !== "form" && resolvedKind !== "quiz") errors.push("kind must be \"form\" or \"quiz\".");
  if (!isString(b.title) || !b.title.trim()) errors.push("title is required.");
  else if (b.title.length > LIMITS.title) errors.push(`title can have at most ${LIMITS.title} characters.`);
  if (b.description !== undefined && (!isString(b.description) || b.description.length > LIMITS.description)) errors.push("description must be a string of at most 5000 characters.");
  if (!Array.isArray(b.fields)) errors.push("fields must be an array.");
  else if (b.fields.length > LIMITS.fields) errors.push(`Use at most ${LIMITS.fields} fields.`);
  let sourceLabel: string | undefined;
  let source: ExternalSource | undefined;
  const sourceWarnings: string[] = [];
  if (b.source !== undefined) {
    const parsed = parseSource(b.source);
    if ("errors" in parsed) errors.push(...parsed.errors);
    else if (parsed.label && looksLikeAddress(parsed.label)) errors.push("source.label must be a plain name, not a web address or file path.");
    else {
      sourceLabel = parsed.label;
      source = parsed.source;
      sourceWarnings.push(...parsed.warnings);
    }
  }
  const allowed: readonly string[] = resolvedKind === "quiz" ? API_QUIZ_FIELD_TYPES : API_FORM_FIELD_TYPES;
  const fields: ApiField[] = [];
  const ids = new Set<string>();
  for (const [i, value] of (Array.isArray(b.fields) ? b.fields : []).entries()) {
    const at = `fields[${i}]`;
    if (!value || typeof value !== "object") { errors.push(`${at} must be an object.`); continue; }
    const f = value as Record<string, unknown>;
    if (!isString(f.id) || !isValidId(f.id)) errors.push(`${at}.id must match ^[A-Za-z][A-Za-z0-9_-]{0,79}$.`);
    else if (ids.has(f.id)) errors.push(`${at}.id is duplicated.`);
    else ids.add(f.id);
    if (!isString(f.type) || !allowed.includes(f.type)) errors.push(`${at}.type must be one of ${allowed.join(", ")}.`);
    if (!isString(f.label)) errors.push(`${at}.label must be a string.`);
    else if (f.label.length > LIMITS.label) errors.push(`${at}.label can have at most ${LIMITS.label} characters.`);
    if (f.description !== undefined && (!isString(f.description) || f.description.length > LIMITS.description)) errors.push(`${at}.description is invalid.`);
    if (f.required !== undefined && typeof f.required !== "boolean") errors.push(`${at}.required must be a boolean.`);
    for (const key of ["options", "rows", "correctAnswers", "keywords"] as const) {
      if (f[key] === undefined) continue;
      if (!isStringArray(f[key])) errors.push(`${at}.${key} must be an array of strings.`);
      else if ((f[key] as string[]).length > API_OPTION_LIMIT) errors.push(`${at}.${key} can have at most ${API_OPTION_LIMIT} entries.`);
      else if ((f[key] as string[]).some((s) => s.length > LIMITS.label)) errors.push(`${at}.${key} entries can have at most ${LIMITS.label} characters.`);
    }
    for (const key of ["min", "max", "points"] as const) {
      if (f[key] !== undefined && !isFiniteNumber(f[key])) errors.push(`${at}.${key} must be a number.`);
    }
    if (f.correctAnswer !== undefined && !isString(f.correctAnswer)) errors.push(`${at}.correctAnswer must be a string.`);
    if (resolvedKind === "form" && (f.correctAnswer !== undefined || f.correctAnswers !== undefined || f.keywords !== undefined || f.points !== undefined)) {
      errors.push(`${at}: answer keys and points apply only to quizzes.`);
    }
    fields.push({
      id: String(f.id), type: String(f.type), label: isString(f.label) ? f.label : "",
      description: isString(f.description) ? f.description : undefined,
      required: f.required === true,
      options: isStringArray(f.options) ? f.options : undefined,
      rows: isStringArray(f.rows) ? f.rows : undefined,
      min: isFiniteNumber(f.min) ? f.min : undefined,
      max: isFiniteNumber(f.max) ? f.max : undefined,
      correctAnswer: isString(f.correctAnswer) ? f.correctAnswer : undefined,
      correctAnswers: isStringArray(f.correctAnswers) ? f.correctAnswers : undefined,
      keywords: isStringArray(f.keywords) ? f.keywords : undefined,
      points: isFiniteNumber(f.points) ? f.points : undefined,
    });
  }
  if (errors.length) return { errors };
  return {
    body: {
      kind: resolvedKind as "form" | "quiz",
      title: (b.title as string).trim(),
      description: isString(b.description) ? b.description : "",
      fields,
      sourceLabel,
      source,
      sourceWarnings,
    },
  };
}

// ── Source metadata ─────────────────────────────────────────────────────────

/** Validated external reference, stored with the draft and shown only to its creator. */
export interface ExternalSource {
  type: string;
  id?: string;
  url?: string;
  title?: string;
  fetchedAt?: number;
}

export const SOURCE_LIMITS = { label: 200, type: 40, id: 200, url: 2000, title: 200, totalBytes: 4096 } as const;
const SOURCE_KEYS = new Set(["label", "type", "id", "url", "title", "fetchedAt"]);
const SOURCE_TYPE = /^[a-z][a-z0-9_.-]{0,39}$/;
/** Local filesystem paths and file URLs: rejected so private layouts never reach Chaos. */
const PRIVATE_PATH = /(^|[\s"'(])(~[\\/]|\/(Users|home|root|var|tmp|private|Volumes|mnt|etc|opt|srv)\/|[A-Za-z]:[\\/]|\\\\[^\\\s]+\\)|file:\/\//i;
/** Hosts that only make sense inside a private network. */
const PRIVATE_HOST = /^(localhost|.*\.(local|localhost|internal|lan|home|corp|intranet)|127(\.\d+){3}|10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2}|169\.254(\.\d+){2}|0\.0\.0\.0|\[.*\])$/i;

export function looksLikePrivatePath(value: string): boolean {
  return PRIVATE_PATH.test(value);
}

/**
 * Validate the optional `source` object of a draft request. `label` alone keeps
 * the original free-text contract working; `type` is required once any
 * structured field is sent. Unknown keys, private paths and private hosts are
 * rejected; query strings and fragments are stripped from `url`.
 */
export function parseSource(raw: unknown): { label?: string; source?: ExternalSource; warnings: string[] } | { errors: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { errors: ["source must be an object."] };
  const s = raw as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const key of Object.keys(s)) if (!SOURCE_KEYS.has(key)) errors.push(`source.${key} is not accepted. Allowed: label, type, id, url, title, fetchedAt.`);
  if (new TextEncoder().encode(JSON.stringify(s)).length > SOURCE_LIMITS.totalBytes) errors.push(`source can be at most ${SOURCE_LIMITS.totalBytes} bytes.`);
  const text = (key: "label" | "id" | "title", max: number): string | undefined => {
    const value = s[key];
    if (value === undefined) return undefined;
    if (!isString(value)) { errors.push(`source.${key} must be a string.`); return undefined; }
    const trimmed = value.trim();
    if (trimmed.length > max) { errors.push(`source.${key} can have at most ${max} characters.`); return undefined; }
    if (/[\u0000-\u001f\u007f]/.test(trimmed)) { errors.push(`source.${key} contains control characters.`); return undefined; }
    if (looksLikePrivatePath(trimmed)) { errors.push(`source.${key} looks like a local file path. Send an opaque id instead.`); return undefined; }
    return trimmed || undefined;
  };
  const label = text("label", SOURCE_LIMITS.label);
  const id = text("id", SOURCE_LIMITS.id);
  const title = text("title", SOURCE_LIMITS.title);
  let type: string | undefined;
  if (s.type !== undefined) {
    if (!isString(s.type) || !SOURCE_TYPE.test(s.type)) errors.push("source.type must match ^[a-z][a-z0-9_.-]{0,39}$, for example \"document\" or \"page\".");
    else type = s.type;
  }
  let url: string | undefined;
  if (s.url !== undefined) {
    if (!isString(s.url) || s.url.length > SOURCE_LIMITS.url) errors.push(`source.url must be a string of at most ${SOURCE_LIMITS.url} characters.`);
    else {
      let parsed: URL | null = null;
      try { parsed = new URL(s.url); } catch { /* reported below */ }
      if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) errors.push("source.url must be an http or https address.");
      else if (parsed.username || parsed.password) errors.push("source.url must not contain a user name or password.");
      else if (PRIVATE_HOST.test(parsed.hostname)) errors.push("source.url points at a private network address.");
      else {
        if (parsed.search || parsed.hash) warnings.push("The query string and fragment were removed from source.url.");
        parsed.search = "";
        parsed.hash = "";
        url = parsed.toString();
      }
    }
  }
  let fetchedAt: number | undefined;
  if (s.fetchedAt !== undefined) {
    const value = isString(s.fetchedAt) && /^\d{4}-\d{2}-\d{2}T/.test(s.fetchedAt) ? Date.parse(s.fetchedAt) : isFiniteNumber(s.fetchedAt) ? s.fetchedAt : NaN;
    if (!Number.isFinite(value) || value < Date.UTC(2000, 0, 1) || value > Date.now() + 5 * 60_000) {
      errors.push("source.fetchedAt must be an ISO 8601 date-time or milliseconds since 1970, not in the future.");
    } else fetchedAt = Math.round(value);
  }
  const structured = id !== undefined || url !== undefined || title !== undefined || fetchedAt !== undefined;
  if (structured && type === undefined && s.type === undefined) errors.push("source.type is required when id, url, title or fetchedAt is sent.");
  if (errors.length) return { errors };
  const source: ExternalSource | undefined = type
    ? { type, ...(id !== undefined && { id }), ...(url !== undefined && { url }), ...(title !== undefined && { title }), ...(fetchedAt !== undefined && { fetchedAt }) }
    : undefined;
  return { label: label ?? title, source, warnings };
}

/** Choices keep their ids when the label is unchanged, so reporting stays stable across edits. */
function toChoices(labels: string[] | undefined, previous: Choice[] | undefined, prefix: string): Choice[] | undefined {
  if (!labels) return undefined;
  const used = new Set<string>();
  return labels.map((label) => {
    const match = previous?.find((c) => c.label.trim() === label.trim() && !used.has(c.id));
    const id = match?.id ?? newId(prefix);
    used.add(id);
    return match ? { ...match, label } : { id, label };
  });
}

/**
 * Build a form definition from the contract. When `previous` is given (PATCH),
 * form-only settings the contract does not carry — logic, translations,
 * endings, theme, presentation, languages — are preserved.
 */
export function toFormDefinition(body: DraftBody, previous?: FormDefinition): { definition: FormDefinition; warnings: string[] } {
  const base = previous ?? emptyDefinition(body.title);
  const warnings: string[] = [];
  const fields: FormField[] = body.fields.map((api) => {
    const type = api.type as FieldType;
    const prior = previous?.fields.find((f) => f.id === api.id && f.type === type);
    const field: FormField = {
      ...(prior ?? {}),
      id: api.id,
      type,
      label: api.label,
      description: api.description || undefined,
      required: type === "statement" || type === "section" ? false : !!api.required,
    };
    if (type === "choice" || type === "dropdown" || type === "multi_choice" || type === "ranking" || type === "matrix") {
      field.options = toChoices(api.options ?? [], prior?.options, "o");
    } else delete field.options;
    if (type === "matrix") field.rows = toChoices(api.rows ?? [], prior?.rows, "r");
    else delete field.rows;
    if (type === "rating") { field.max = api.max ?? prior?.max ?? 5; delete field.min; }
    else if (type === "scale") { field.min = api.min ?? prior?.min ?? 1; field.max = api.max ?? prior?.max ?? 5; }
    else if (type === "number" || type === "text" || type === "textarea" || type === "multi_choice") {
      field.min = api.min; field.max = api.max;
      if (field.min === undefined) delete field.min;
      if (field.max === undefined) delete field.max;
    } else { delete field.min; delete field.max; }
    return field;
  });
  const kept = new Set(fields.map((f) => f.id));
  if (previous) {
    const lost = previous.fields.filter((f) => !kept.has(f.id)).length;
    if (lost) warnings.push(`${lost} question${lost === 1 ? " was" : "s were"} removed from the draft. Published versions and responses are unchanged.`);
  }
  // Drop logic that points at removed questions; the builder reports the rest.
  for (const f of fields) {
    if (f.showIf && f.showIf.conditions.some((c) => c.fieldId !== "calc:score" && !kept.has(c.fieldId))) {
      delete f.showIf;
      warnings.push(`Branching on “${f.label || f.id}” referred to a removed question and was cleared.`);
    }
  }
  return {
    definition: { ...base, fields, title: body.title, description: body.description },
    warnings,
  };
}

export function fromFormDefinition(def: FormDefinition): { fields: ApiField[]; dropped: string[] } {
  const dropped = new Set<string>();
  const fields: ApiField[] = [];
  for (const f of def.fields) {
    if (f.type === "file") { dropped.add("file upload questions"); continue; }
    if (f.showIf) dropped.add("branching logic");
    if (f.translations && Object.keys(f.translations).length) dropped.add("translations");
    if (f.image) dropped.add("images");
    if (f.options?.some((o) => o.score !== undefined)) dropped.add("option scores");
    const out: ApiField = { id: f.id, type: f.type, label: f.label, required: f.required };
    if (f.description) out.description = f.description;
    if (f.options) out.options = f.options.map((o) => o.label);
    if (f.rows) out.rows = f.rows.map((r) => r.label);
    if (f.min !== undefined) out.min = f.min;
    if (f.max !== undefined) out.max = f.max;
    fields.push(out);
  }
  if (def.endings.length) dropped.add("custom endings");
  if (def.languages.length > 1) dropped.add("translations");
  return { fields, dropped: [...dropped] };
}

export function toQuizQuestions(body: DraftBody, defaultPoints: number): { questions: QuizQuestionInput[]; warnings: string[] } {
  const warnings: string[] = [];
  const questions = body.fields.map((f, i) => {
    const type = f.type as QuizType;
    const q: QuizQuestionInput = { type, questionText: f.label, points: f.points !== undefined && f.points >= 1 ? f.points : defaultPoints };
    const name = `Question ${i + 1}`;
    if (type === "mcq" || type === "multi_select") {
      q.options = f.options ?? [];
      if (type === "mcq") {
        if (f.correctAnswer && q.options.includes(f.correctAnswer)) q.correctAnswer = f.correctAnswer;
        else warnings.push(`${name} has no valid answer key yet.`);
      } else {
        const keys = (f.correctAnswers ?? []).filter((a) => q.options!.includes(a));
        if (keys.length) q.correctAnswers = [...new Set(keys)];
        else warnings.push(`${name} has no valid answer key yet.`);
      }
    } else if (type === "true_false") {
      q.options = ["True", "False"];
      const answer = f.correctAnswer?.toLowerCase();
      if (answer === "true" || answer === "false") q.correctAnswer = answer === "true" ? "True" : "False";
      else warnings.push(`${name} has no answer key yet.`);
    } else {
      const keywords = (f.keywords ?? []).map((k) => k.trim()).filter(Boolean);
      if (keywords.length) q.keywords = keywords;
    }
    if (!f.label.trim()) warnings.push(`${name} has no text yet.`);
    return q;
  });
  if (!questions.length) warnings.push("Add at least one question before publishing.");
  return { questions, warnings };
}

/**
 * A quiz-style question (the API's quiz field types, and the retired classic quizzes) as a quiz-form
 * question. Written answers have no automatic grading in forms: they become long-text questions without a key.
 */
export function quizFormQuestion(q: { type: string; questionText: string; options?: string[]; correctAnswer?: string; correctAnswers?: string[]; explanation?: string; points: number }): McpQuestion {
  const base = { label: q.questionText.trim() || "Question", required: true, points: Math.max(1, q.points || 1), ...(q.explanation?.trim() ? { explanation: q.explanation.trim().slice(0, 2000) } : {}) };
  if (q.type === "true_false") return { ...base, type: "single_choice", options: ["True", "False"], correctAnswers: [q.correctAnswer?.toLowerCase() === "false" ? "False" : "True"] };
  if (q.type === "mcq") return { ...base, type: "single_choice", options: q.options ?? [], correctAnswers: q.correctAnswer ? [q.correctAnswer] : [] };
  if (q.type === "multi_select") return { ...base, type: "multiple_choice", options: q.options ?? [], correctAnswers: q.correctAnswers ?? [] };
  return { type: "long_text", label: base.label, required: true };
}

/** A `kind: "quiz"` draft as a quiz form. */
export function toQuizFormDefinition(body: DraftBody): { definition: FormDefinition; warnings: string[] } {
  const { questions, warnings } = toQuizQuestions(body, 1);
  const definition = toDefinition({ title: body.title, description: body.description, quizMode: true, questions: questions.map(quizFormQuestion) });
  if (questions.some((q) => q.type === "written")) warnings.push("Written questions are not graded automatically; they become long-text questions.");
  return { definition, warnings };
}

/** Merge buckets smaller than the minimum group size into one suppressed bucket. */
export function suppressBuckets(buckets: { option: string; count: number }[], minimum: number) {
  return suppressSmallBuckets(buckets, minimum);
}

export const formFieldTypesSupported: readonly string[] = fieldTypes;
