import type { AnswerValue, FormField } from "./formLogic";

/** Pure answer presentation and emptiness rules, shared by creator and respondent flows. */
export function isEmptyAnswer(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return !value.trim();
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.length === 0;
  return Object.keys(value).length === 0;
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

