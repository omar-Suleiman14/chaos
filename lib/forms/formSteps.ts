import { sectionsOf } from "../../convex/formLogic";
import type { FormDefinition, FormField } from "../../convex/formLogic";

export type Step = { key: string; title?: string; description?: string; fields: FormField[] };

export function buildSteps(def: FormDefinition, visible: Set<string>): Step[] {
  if (def.presentation === "page") {
    return [{ key: "all", fields: def.fields.filter((f) => visible.has(f.id)) }];
  }
  if (def.presentation === "sections") {
    return sectionsOf(def)
      .filter((g) => !g.section || visible.has(g.section.id))
      .map((g, i) => ({ key: g.section?.id ?? `s${i}`, title: g.section?.label, description: g.section?.description, fields: g.fields.filter((f) => visible.has(f.id)) }))
      .filter((s) => s.fields.length || s.title);
  }
  return def.fields.filter((f) => visible.has(f.id) && f.type !== "section").map((f) => ({ key: f.id, fields: [f] }));
}

