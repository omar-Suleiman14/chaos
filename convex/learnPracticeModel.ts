import { defineTable } from "convex/server";
import { v, type Infer } from "convex/values";

/** Parent schema must spread practiceTables. No questions or answer keys are copied. */
export const practiceTables = {
  learnPracticeMappings: defineTable({
    ownerId: v.string(),
    formId: v.id("forms"),
    version: v.number(),
    fieldId: v.string(),
    conceptId: v.id("learnConcepts"),
  })
    .index("by_formId_and_version_and_fieldId_and_conceptId", [
      "formId",
      "version",
      "fieldId",
      "conceptId",
    ])
    .index("by_ownerId_and_conceptId", ["ownerId", "conceptId"]),
  learnPracticeEvidence: defineTable({
    // Issuer-scoped private identity; form ownership/respondent checks use the existing subject contract.
    userId: v.string(),
    formResponseId: v.id("formResponses"),
    formId: v.id("forms"),
    version: v.number(),
    fieldId: v.string(),
    conceptId: v.id("learnConcepts"),
    earned: v.number(),
    possible: v.number(),
    answeredAt: v.number(),
    responseUpdatedAt: v.number(),
  })
    .index("by_userId_and_conceptId_and_answeredAt", [
      "userId",
      "conceptId",
      "answeredAt",
    ])
    .index("by_userId_and_formResponseId_and_fieldId_and_conceptId", [
      "userId",
      "formResponseId",
      "fieldId",
      "conceptId",
    ]),
};

export const PRACTICE_LIMITS = {
  mappingsPerVersion: 200,
  concepts: 10,
  recentEvidence: 40,
  candidatesPerConcept: 40,
  forms: 6,
  selection: 10,
} as const;
export const DAY = 86_400_000;
export const practiceState = v.object({
  conceptId: v.id("learnConcepts"),
  state: v.union(
    v.literal("weak"),
    v.literal("review"),
    v.literal("insufficient"),
  ),
  confidence: v.union(v.literal("low"), v.literal("moderate")),
  attempts: v.number(),
  accuracy: v.union(v.number(), v.null()),
  lastAnsweredAt: v.union(v.number(), v.null()),
  ageMs: v.union(v.number(), v.null()),
  reason: v.string(),
});
export type PracticeState = Infer<typeof practiceState>;
export const practiceReference = v.object({
  formId: v.id("forms"),
  version: v.number(),
  fieldId: v.string(),
  conceptIds: v.array(v.id("learnConcepts")),
  recentlyAnswered: v.boolean(),
});

export function assertNow(now: number) {
  if (!Number.isSafeInteger(now) || now < 0)
    throw new Error("Invalid now: use epoch milliseconds");
}

/** At most 40 rows in 30 days; one response counts as one independent attempt.
 * This is a review heuristic, never a diagnosis or a claim of mastery.
 */
export function summarizeEvidence(
  conceptId: PracticeState["conceptId"],
  rows: {
    formResponseId: string;
    earned: number;
    possible: number;
    answeredAt: number;
  }[],
  now: number,
): PracticeState {
  assertNow(now);
  const recent = rows
    .filter(
      (r) =>
        r.answeredAt <= now && r.answeredAt >= now - 30 * DAY && r.possible > 0,
    )
    .sort((a, b) => b.answeredAt - a.answeredAt)
    .slice(0, PRACTICE_LIMITS.recentEvidence);
  const attempts = new Map<string, { total: number; fields: number }>();
  for (const row of recent) {
    const attempt = attempts.get(row.formResponseId) ?? { total: 0, fields: 0 };
    attempt.total += Math.max(0, Math.min(1, row.earned / row.possible));
    attempt.fields++;
    attempts.set(row.formResponseId, attempt);
  }
  const count = attempts.size;
  const accuracy = count
    ? [...attempts.values()].reduce((sum, a) => sum + a.total / a.fields, 0) /
      count
    : null;
  const lastAnsweredAt = recent[0]?.answeredAt ?? null;
  const ageMs = lastAnsweredAt === null ? null : now - lastAnsweredAt;
  const state =
    count < 3
      ? "insufficient"
      : ageMs! > 7 * DAY
        ? "review"
        : accuracy! < 0.7
          ? "weak"
          : "review";
  return {
    conceptId,
    state,
    confidence: count >= 5 && ageMs! <= 7 * DAY ? "moderate" : "low",
    attempts: count,
    accuracy,
    lastAnsweredAt,
    ageMs,
    reason:
      count < 3
        ? "Fewer than three independent completed responses in the last 30 days."
        : ageMs! > 7 * DAY
          ? "Evidence is over seven days old; review before drawing conclusions."
          : state === "weak"
            ? "Average server-graded accuracy is below 70% across at least three responses."
            : "Recent accuracy suggests review; this does not establish mastery.",
  };
}
