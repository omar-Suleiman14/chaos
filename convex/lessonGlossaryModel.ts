import { defineTable } from "convex/server";
import { v, type Infer } from "convex/values";

export const GLOSSARY_LIMITS = { entries: 200, term: 100, aliases: 5, definition: 1000, translation: 200, explanation: 1500, pronunciation: 100, language: 35 } as const;
/** A word a reader can look up: what it means, its translation, and that meaning explained in the translation language. */
export const glossaryEntry = v.object({
  term: v.string(),
  /** Other forms in the text, such as plurals ("ventricles"). */
  aliases: v.optional(v.array(v.string())),
  definition: v.string(),
  translation: v.optional(v.string()),
  explanation: v.optional(v.string()),
  /** BCP 47 language of translation and explanation, for example "ar". */
  language: v.optional(v.string()),
  pronunciation: v.optional(v.string()),
});
export type GlossaryEntry = Infer<typeof glossaryEntry>;
/** Live reader aid kept beside the lesson, so editor saves and publishing never drop it. */
export const glossaryTables = {
  lessonGlossaries: defineTable({ lessonId: v.id("lessons"), entries: v.array(glossaryEntry), updatedAt: v.number() }).index("by_lessonId", ["lessonId"]),
};
