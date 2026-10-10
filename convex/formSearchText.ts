import type { Doc } from "./_generated/dataModel";

const SEARCH_TEXT_CAP = 20_000;
/** Everything a person could type to find this form, as one plain-text blob. */
export function searchText(def: Doc<"forms">["draft"]): string {
  const parts: string[] = [def.description];
  for (const t of Object.values(def.translations ?? {})) parts.push(t.title ?? "", t.description ?? "");
  for (const f of def.fields) {
    parts.push(f.label, f.description ?? "", f.placeholder ?? "", f.minLabel ?? "", f.maxLabel ?? "");
    for (const o of f.options ?? []) parts.push(o.label);
    for (const r of f.rows ?? []) parts.push(r.label);
    if (f.quiz?.explanation) parts.push(f.quiz.explanation);
    for (const t of Object.values(f.translations ?? {})) {
      parts.push(t.label ?? "", t.description ?? "", t.placeholder ?? "", t.minLabel ?? "", t.maxLabel ?? "");
      parts.push(...Object.values(t.options ?? {}), ...Object.values(t.rows ?? {}));
    }
  }
  for (const e of def.endings) {
    parts.push(e.title, e.message);
    for (const t of Object.values(e.translations ?? {})) parts.push(t.title ?? "", t.message ?? "");
  }
  return parts.filter(Boolean).join(" \n").slice(0, SEARCH_TEXT_CAP);
}

