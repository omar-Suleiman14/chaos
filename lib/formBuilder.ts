import { newId } from "@/convex/formLogic";
import type { Choice, FormDefinition, FormField, Rule, Translation } from "@/convex/formLogic";

function remapRule(rule: Rule | undefined, ids: Map<string, string>, options: Map<string, string>): Rule | undefined {
  if (!rule) return rule;
  return {
    ...rule,
    conditions: rule.conditions.map((c) => ({
      ...c,
      fieldId: ids.get(c.fieldId) ?? c.fieldId,
      value: typeof c.value === "string" ? options.get(c.value) ?? c.value : c.value,
    })),
  };
}

function copyChoices(list: Choice[] | undefined, prefix: string, map: Map<string, string>): Choice[] | undefined {
  return list?.map((c) => {
    const id = newId(prefix);
    map.set(c.id, id);
    return { ...c, id };
  });
}

function copyTranslations(t: Record<string, Translation> | undefined, options: Map<string, string>): Record<string, Translation> | undefined {
  if (!t) return t;
  const remapKeys = (r?: Record<string, string>) => r && Object.fromEntries(Object.entries(r).map(([k, v]) => [options.get(k) ?? k, v]));
  return Object.fromEntries(Object.entries(t).map(([lang, tr]) => [lang, { ...tr, options: remapKeys(tr.options), rows: remapKeys(tr.rows) }]));
}

/**
 * Copy fields with fresh ids. Conditions between copied fields point at the
 * copies; conditions on other fields are kept as they are.
 */
export function copyFields(fields: FormField[]): FormField[] {
  const ids = new Map<string, string>();
  const options = new Map<string, string>();
  const copies = fields.map((f) => {
    const id = newId(f.type === "section" ? "s" : "q");
    ids.set(f.id, id);
    const copy: FormField = { ...f, id, options: copyChoices(f.options, "o", options), rows: copyChoices(f.rows, "r", options) };
    if (!copy.options) delete copy.options;
    if (!copy.rows) delete copy.rows;
    return copy;
  });
  return copies.map((f) => {
    const out: FormField = { ...f, translations: copyTranslations(f.translations, options) };
    if (f.quiz) out.quiz = { ...f.quiz, correctOptionIds: f.quiz.correctOptionIds.map((id) => options.get(id) ?? id) };
    const rule = remapRule(f.showIf, ids, options);
    if (rule) out.showIf = rule;
    if (!out.translations) delete out.translations;
    return out;
  });
}

/** Index range [start, end) of a section and the fields that belong to it. */
export function sectionRange(def: FormDefinition, sectionId: string): [number, number] {
  const start = def.fields.findIndex((f) => f.id === sectionId);
  if (start < 0) return [0, 0];
  let end = start + 1;
  while (end < def.fields.length && def.fields[end].type !== "section") end++;
  return [start, end];
}

export function duplicateSection(def: FormDefinition, sectionId: string): FormDefinition {
  const [start, end] = sectionRange(def, sectionId);
  const copies = copyFields(def.fields.slice(start, end));
  copies[0] = { ...copies[0], label: `${copies[0].label} (copy)` };
  return { ...def, fields: [...def.fields.slice(0, end), ...copies, ...def.fields.slice(end)] };
}

export function insertAfter(def: FormDefinition, index: number, fields: FormField[]): FormDefinition {
  const at = index < 0 ? def.fields.length : index + 1;
  return { ...def, fields: [...def.fields.slice(0, at), ...fields, ...def.fields.slice(at)] };
}

export function moveField(def: FormDefinition, from: number, to: number): FormDefinition {
  if (to < 0 || to >= def.fields.length || from === to) return def;
  const fields = [...def.fields];
  const [moved] = fields.splice(from, 1);
  fields.splice(to, 0, moved);
  return { ...def, fields };
}

/** Remove fields and any conditions that referred to them. Returns how many rules were cleared. */
export function removeFields(def: FormDefinition, ids: Set<string>): { def: FormDefinition; clearedConditions: number } {
  let cleared = 0;
  const clean = (rule: Rule | undefined): Rule | undefined => {
    if (!rule) return rule;
    const conditions = rule.conditions.filter((c) => !ids.has(c.fieldId));
    cleared += rule.conditions.length - conditions.length;
    return conditions.length ? { ...rule, conditions } : undefined;
  };
  const fields = def.fields.filter((f) => !ids.has(f.id)).map((f) => {
    const showIf = clean(f.showIf);
    const { showIf: _old, ...rest } = f;
    return showIf ? { ...rest, showIf } : rest;
  });
  const endings = def.endings.map((e) => {
    const showIf = clean(e.showIf);
    const { showIf: _old, ...rest } = e;
    return showIf ? { ...rest, showIf } : rest;
  });
  return { def: { ...def, fields, endings }, clearedConditions: cleared };
}

export function updateField(def: FormDefinition, id: string, patch: Partial<FormField>): FormDefinition {
  return { ...def, fields: def.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) };
}

/** Parse "one option per line" text, keeping ids of options whose text is unchanged. */
export function optionsFromText(text: string, previous: Choice[] | undefined, prefix = "o"): Choice[] {
  const used = new Set<string>();
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((label) => {
    const match = previous?.find((c) => c.label === label && !used.has(c.id));
    const id = match?.id ?? newId(prefix);
    used.add(id);
    return match ? { ...match } : { id, label };
  });
}
