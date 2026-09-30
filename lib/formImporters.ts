// Importers that turn exported forms from other tools into Chaos drafts.
// Everything runs in the browser; nothing is sent anywhere until the creator
// confirms the preview. Unsupported features are listed as warnings, never
// silently dropped.

import {
  blankField, emptyDefinition, FORM_SCHEMA_VERSION, isValidId, LIMITS, newId,
} from "@/convex/formLogic";
import type { Choice, FieldType, FormDefinition, FormField } from "@/convex/formLogic";

export type ImportSource = "chaos" | "typeform" | "google" | "text";
export interface ImportResult { source: ImportSource; definition: FormDefinition; warnings: string[] }

const clip = (s: unknown, n: number = LIMITS.label) => (typeof s === "string" ? s.trim().slice(0, n) : "");
const choices = (labels: string[], prefix = "o"): Choice[] =>
  labels.map((l) => l.trim()).filter(Boolean).slice(0, LIMITS.options).map((label) => ({ id: newId(prefix), label: label.slice(0, LIMITS.label) }));

function field(type: FieldType, label: string, extra: Partial<FormField> = {}, sourceId?: string): FormField {
  const base = blankField(type);
  const id = sourceId && isValidId(sourceId) ? sourceId : base.id;
  return { ...base, id, label: clip(label) || (type === "statement" ? "" : "Untitled question"), ...extra };
}

function uniqueIds(fields: FormField[]): FormField[] {
  const seen = new Set<string>();
  return fields.map((f) => {
    if (!seen.has(f.id)) { seen.add(f.id); return f; }
    const id = newId("q");
    seen.add(id);
    return { ...f, id };
  });
}

function finish(source: ImportSource, title: string, description: string, fields: FormField[], warnings: string[]): ImportResult {
  const def = emptyDefinition(clip(title, LIMITS.title) || "Imported form");
  def.description = clip(description, LIMITS.description);
  if (fields.length > LIMITS.fields) {
    warnings.push(`Only the first ${LIMITS.fields} questions were imported.`);
    fields = fields.slice(0, LIMITS.fields);
  }
  def.fields = uniqueIds(fields);
  if (!def.fields.length) warnings.push("No questions were recognised.");
  return { source, definition: def, warnings: [...new Set(warnings)] };
}

// ── Chaos portable format ───────────────────────────────────────────────────

function fromChaos(data: Record<string, unknown>): ImportResult {
  if (data.formatVersion !== 1) throw new Error("This Chaos export uses an unsupported format version.");
  const def = data.definition as FormDefinition;
  if (!def || typeof def !== "object" || !Array.isArray(def.fields) || def.schemaVersion !== FORM_SCHEMA_VERSION) {
    throw new Error("This Chaos export is incomplete.");
  }
  return { source: "chaos", definition: def, warnings: [] };
}

// ── Typeform (Create API form definition) ──────────────────────────────────

type TypeformField = {
  id?: string; ref?: string; title?: string; type?: string;
  properties?: { description?: string; choices?: { label?: string }[]; allow_multiple_selection?: boolean; steps?: number; start_at_one?: boolean; fields?: TypeformField[]; labels?: { left?: string; right?: string } };
  validations?: { required?: boolean };
};

function typeformFields(list: TypeformField[], warnings: string[]): FormField[] {
  const out: FormField[] = [];
  for (const f of list) {
    const label = clip(f.title);
    const common = { required: !!f.validations?.required, description: clip(f.properties?.description, LIMITS.description) || undefined };
    const opts = (f.properties?.choices ?? []).map((c) => c.label ?? "");
    const ref = f.ref?.replace(/[^A-Za-z0-9_-]/g, "_");
    switch (f.type) {
      case "short_text": out.push(field("text", label, common, ref)); break;
      case "long_text": out.push(field("textarea", label, common, ref)); break;
      case "email": out.push(field("email", label, common, ref)); break;
      case "phone_number": out.push(field("phone", label, common, ref)); break;
      case "website": out.push(field("url", label, common, ref)); break;
      case "number": out.push(field("number", label, common, ref)); break;
      case "date": out.push(field("date", label, common, ref)); break;
      case "multiple_choice": case "picture_choice":
        if (f.type === "picture_choice") warnings.push("Picture choices were imported as text choices.");
        out.push(field(f.properties?.allow_multiple_selection ? "multi_choice" : "choice", label, { ...common, options: choices(opts) }, ref));
        break;
      case "dropdown": out.push(field("dropdown", label, { ...common, options: choices(opts) }, ref)); break;
      case "yes_no": case "legal":
        out.push(field("choice", label, { ...common, options: choices(f.type === "legal" ? ["I accept", "I don't accept"] : ["Yes", "No"]) }, ref));
        break;
      case "ranking": out.push(field("ranking", label, { ...common, options: choices(opts) }, ref)); break;
      case "rating": out.push(field("rating", label, { ...common, max: Math.min(10, Math.max(3, f.properties?.steps ?? 5)) }, ref)); break;
      case "opinion_scale": case "nps": {
        const steps = f.type === "nps" ? 11 : f.properties?.steps ?? 5;
        const min = f.type === "nps" ? 0 : f.properties?.start_at_one === false ? 0 : 1;
        const max = Math.min(10, min + steps - 1);
        if (f.type === "nps") warnings.push("Net Promoter questions were imported as a 0–10 scale.");
        out.push(field("scale", label, { ...common, min, max, minLabel: f.properties?.labels?.left, maxLabel: f.properties?.labels?.right }, ref));
        break;
      }
      case "matrix": {
        const rows = (f.properties?.fields ?? []).map((r) => r.title ?? "");
        const cols = f.properties?.fields?.[0]?.properties?.choices?.map((c) => c.label ?? "") ?? [];
        out.push(field("matrix", label, { ...common, rows: choices(rows, "r"), options: choices(cols) }, ref));
        break;
      }
      case "file_upload": out.push(field("file", label, common, ref)); break;
      case "statement": out.push(field("statement", label, { description: common.description }, ref)); break;
      case "group":
        out.push(field("section", label || "Section", { description: common.description }, ref));
        out.push(...typeformFields(f.properties?.fields ?? [], warnings));
        break;
      default:
        warnings.push(`Skipped an unsupported Typeform question type (${f.type ?? "unknown"}).`);
    }
  }
  return out;
}

function fromTypeform(data: Record<string, unknown>): ImportResult {
  const warnings: string[] = [];
  const fields = typeformFields((data.fields as TypeformField[]) ?? [], warnings);
  if (Array.isArray(data.logic) && data.logic.length) warnings.push("Typeform logic jumps were not imported. Recreate branching in the logic builder.");
  if (Array.isArray(data.variables) || (data.variables && typeof data.variables === "object")) warnings.push("Typeform variables and scores were not imported.");
  const welcome = (data.welcome_screens as { title?: string; properties?: { description?: string } }[] | undefined)?.[0];
  const result = finish("typeform", String(data.title ?? ""), welcome?.properties?.description ?? "", fields, warnings);
  const thanks = (data.thankyou_screens as { ref?: string; title?: string; properties?: { description?: string } }[] | undefined) ?? [];
  result.definition.endings = thanks
    .filter((t) => t.ref !== "default_tys" && t.title)
    .slice(0, LIMITS.endings)
    .map((t) => ({ id: newId("e"), title: clip(t.title), message: clip(t.properties?.description, LIMITS.description) }));
  return result;
}

// ── Google Forms (Forms API forms.get response) ─────────────────────────────

type GoogleQuestion = {
  required?: boolean;
  choiceQuestion?: { type?: string; options?: { value?: string; isOther?: boolean }[] };
  textQuestion?: { paragraph?: boolean };
  scaleQuestion?: { low?: number; high?: number; lowLabel?: string; highLabel?: string };
  ratingQuestion?: { ratingScaleLevel?: number };
  dateQuestion?: object; timeQuestion?: object; fileUploadQuestion?: object;
  rowQuestion?: { title?: string };
  grading?: object;
};
type GoogleItem = {
  itemId?: string; title?: string; description?: string;
  questionItem?: { question?: GoogleQuestion };
  questionGroupItem?: { questions?: GoogleQuestion[]; grid?: { columns?: { options?: { value?: string }[] } } };
  pageBreakItem?: object; textItem?: object; imageItem?: object; videoItem?: object;
};

function fromGoogle(data: Record<string, unknown>): ImportResult {
  const warnings: string[] = [];
  const fields: FormField[] = [];
  for (const item of (data.items as GoogleItem[]) ?? []) {
    const label = clip(item.title);
    const description = clip(item.description, LIMITS.description) || undefined;
    const id = item.itemId ? `g${item.itemId}` : undefined;
    const q = item.questionItem?.question;
    if (q) {
      const common = { required: !!q.required, description };
      if (q.grading) warnings.push("Quiz grading from Google Forms was not imported; use a Chaos quiz for graded questions.");
      if (q.choiceQuestion) {
        const opts = (q.choiceQuestion.options ?? []).filter((o) => !o.isOther).map((o) => o.value ?? "");
        if (q.choiceQuestion.options?.some((o) => o.isOther)) warnings.push("“Other” free-text options were imported as a plain option.");
        const withOther = q.choiceQuestion.options?.some((o) => o.isOther) ? [...opts, "Other"] : opts;
        const type: FieldType = q.choiceQuestion.type === "CHECKBOX" ? "multi_choice" : q.choiceQuestion.type === "DROP_DOWN" ? "dropdown" : "choice";
        fields.push(field(type, label, { ...common, options: choices(withOther) }, id));
      } else if (q.textQuestion) fields.push(field(q.textQuestion.paragraph ? "textarea" : "text", label, common, id));
      else if (q.scaleQuestion) {
        const min = Math.max(0, Math.min(1, q.scaleQuestion.low ?? 1));
        const max = Math.max(2, Math.min(10, q.scaleQuestion.high ?? 5));
        fields.push(field("scale", label, { ...common, min, max, minLabel: q.scaleQuestion.lowLabel, maxLabel: q.scaleQuestion.highLabel }, id));
      } else if (q.ratingQuestion) fields.push(field("rating", label, { ...common, max: Math.max(3, Math.min(10, q.ratingQuestion.ratingScaleLevel ?? 5)) }, id));
      else if (q.dateQuestion) fields.push(field("date", label, common, id));
      else if (q.timeQuestion) fields.push(field("time", label, common, id));
      else if (q.fileUploadQuestion) fields.push(field("file", label, common, id));
      else warnings.push(`Skipped an unsupported Google Forms question (“${label}”).`);
    } else if (item.questionGroupItem) {
      const rows = (item.questionGroupItem.questions ?? []).map((r) => r.rowQuestion?.title ?? "");
      const cols = (item.questionGroupItem.grid?.columns?.options ?? []).map((o) => o.value ?? "");
      fields.push(field("matrix", label, { description, required: !!item.questionGroupItem.questions?.[0]?.required, rows: choices(rows, "r"), options: choices(cols) }, id));
    } else if (item.pageBreakItem) fields.push(field("section", label || "Section", { description }, id));
    else if (item.textItem) fields.push(field("statement", label, { description }, id));
    else if (item.imageItem || item.videoItem) warnings.push("Images and videos were not imported; add them again with alternative text.");
  }
  if ((data.items as GoogleItem[] | undefined)?.some((i) => JSON.stringify(i).includes("goToSectionId") || JSON.stringify(i).includes("goToAction"))) {
    warnings.push("Section branching (“go to section”) was not imported. Recreate it in the logic builder.");
  }
  const info = (data.info ?? {}) as { title?: string; documentTitle?: string; description?: string };
  return finish("google", info.title || info.documentTitle || "", info.description ?? "", fields, warnings);
}

// ── Pasted text (Microsoft Forms, documents) ───────────────────────────────

/**
 * One question per block, separated by blank lines. Option lines start with
 * "-", "*", "( )", "[ ]" or "a)"/"1." markers; "[ ]" makes checkboxes. A
 * trailing "*" on the question marks it required. "## Title" starts a section.
 */
export function parseQuestionText(text: string): ImportResult {
  const warnings: string[] = [];
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
  let title = "";
  const fields: FormField[] = [];
  const optionLine = /^(?:[-*•]|\(\s?\)|\[\s?\]|[a-zA-Z][).]|\d+[).])\s+/;
  for (const [index, block] of blocks.entries()) {
    const [first, ...rest] = block;
    if (index === 0 && first.startsWith("# ")) { title = first.slice(2); if (!rest.length) continue; }
    if (first.startsWith("## ")) { fields.push(field("section", first.slice(3))); continue; }
    const required = /\*\s*$/.test(first);
    const label = first.replace(/^\d+[).]\s*/, "").replace(/\*\s*$/, "").trim();
    const options = rest.filter((l) => optionLine.test(l));
    if (options.length) {
      const multiple = options.some((l) => /^\[\s?\]/.test(l));
      fields.push(field(multiple ? "multi_choice" : "choice", label, { required, options: choices(options.map((l) => l.replace(optionLine, ""))) }));
    } else {
      const long = /\b(describe|explain|comments?|feedback|why)\b/i.test(label);
      const email = /\be-?mail\b/i.test(label);
      fields.push(field(email ? "email" : long ? "textarea" : "text", label, { required, description: rest.join(" ").slice(0, LIMITS.description) || undefined }));
    }
  }
  if (fields.some((f) => f.type === "text")) warnings.push("Questions without options were imported as short text; change the type where needed.");
  return finish("text", title, "", fields, warnings);
}

/** Detect the format of an uploaded or pasted JSON export. */
export function importForm(input: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch {
    return parseQuestionText(input);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("This file is not a form export.");
  const d = data as Record<string, unknown>;
  if (d.format === "chaos-form") return fromChaos(d);
  if (d.info && typeof d.info === "object" && ("items" in d || "formId" in d)) return fromGoogle(d);
  if (Array.isArray(d.fields) && ("title" in d) && (d.type === "form" || d.type === "quiz" || "thankyou_screens" in d || "settings" in d || "_links" in d || "workspace" in d)) return fromTypeform(d);
  if (Array.isArray(d.fields)) return fromTypeform(d);
  throw new Error("Chaos recognises Chaos, Typeform and Google Forms exports. For Microsoft Forms, paste the questions as text.");
}
