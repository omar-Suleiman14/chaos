import { defineTable } from "convex/server";
import { v, type Infer } from "convex/values";

/**
 * Private, doctor-owned reusable questions. They are NOT classic quiz questions:
 * no published course or student API may read answer keys from these tables.
 * Future exams must take a versioned snapshot rather than referring to a mutable key.
 */
export const bankKind = v.union(
  v.literal("single_choice"), v.literal("multiple_choice"),
  v.literal("true_false"), v.literal("written"),
);
export const bankStatus = v.union(v.literal("draft"), v.literal("ready"), v.literal("archived"));
export const bankChoice = v.object({ id: v.string(), text: v.string() });
export const bankDraft = v.object({
  kind: bankKind,
  prompt: v.string(),
  choices: v.array(bankChoice),
  correctChoiceIds: v.array(v.string()),
  sampleAnswer: v.optional(v.string()),
  explanation: v.optional(v.string()),
  points: v.number(),
  topics: v.array(v.string()),
  terms: v.array(v.string()),
  outcomes: v.array(v.string()),
  status: v.union(v.literal("draft"), v.literal("ready")),
});
export type BankDraft = Infer<typeof bankDraft>;

export const questionBankTables = {
  questionBankItems: defineTable({
    ownerId: v.string(),
    ...bankDraft.fields,
    status: bankStatus,
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_updated", ["ownerId", "updatedAt"])
    .index("by_owner_status_updated", ["ownerId", "status", "updatedAt"]),
  /** Course/module/lecture associations. A question may be reused across many exams and courses. */
  questionBankLinks: defineTable({
    ownerId: v.string(),
    questionId: v.id("questionBankItems"),
    courseId: v.id("learnCollections"),
    moduleId: v.optional(v.string()),
    lessonId: v.optional(v.id("lessons")),
    scopeKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_question", ["questionId"])
    .index("by_question_scope", ["questionId", "scopeKey"])
    .index("by_course", ["courseId"])
    .index("by_course_module", ["courseId", "moduleId"])
    .index("by_course_lesson", ["courseId", "lessonId"]),
};
