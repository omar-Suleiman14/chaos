import type { Infer } from "convex/values";
import { FORM_SCHEMA_VERSION, LIMITS } from "./formLogic";
import { definitionValidator } from "./formModel";

type Definition = Infer<typeof definitionValidator>;

const MAX_DEFINITION_BYTES = 600_000;

/** Size limits apply to drafts too; semantic checks only block publication. */
export function assertDraftSize(def: Definition) {
  if (def.schemaVersion !== FORM_SCHEMA_VERSION) throw new Error("UNSUPPORTED_SCHEMA: This form was made with an unsupported format version.");
  if (def.fields.length > LIMITS.fields) throw new Error(`DRAFT_LIMIT: A form can contain at most ${LIMITS.fields} fields.`);
  if (def.endings.length > LIMITS.endings) throw new Error(`DRAFT_LIMIT: Use at most ${LIMITS.endings} endings.`);
  if (def.title.length > LIMITS.title * 2) throw new Error("DRAFT_LIMIT: The title is too long.");
  for (const f of def.fields) {
    if ((f.options?.length ?? 0) > LIMITS.options || (f.rows?.length ?? 0) > LIMITS.rows) throw new Error("DRAFT_LIMIT: Too many options.");
  }
  if (JSON.stringify(def).length > MAX_DEFINITION_BYTES) throw new Error("DRAFT_LIMIT: This form is too large to save.");
  if (!def.languages.length || new Set(def.languages).size !== def.languages.length) throw new Error("DRAFT_LIMIT: Choose each language once.");
}
