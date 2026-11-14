import { defineTable } from "convex/server";
import { v } from "convex/values";

/** PR27 is course-scoped. It does not create a new quiz/grade ledger. */
export const assignmentKind = v.union(v.literal("lesson"), v.literal("exam"));
export const courseAssignmentTables = {
  courseAssignments: defineTable({
    courseId: v.id("learnCollections"), ownerId: v.string(),
    kind: assignmentKind, lessonId: v.optional(v.id("lessons")),
    snapshotId: v.optional(v.id("examSnapshots")),
    title: v.string(), instructions: v.string(), outcome: v.string(),
    opensAt: v.number(), dueAt: v.number(), published: v.boolean(),
    archived: v.boolean(), revision: v.number(), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_course", ["courseId"]),
  courseAssignmentAudit: defineTable({
    assignmentId: v.id("courseAssignments"), courseId: v.id("learnCollections"),
    ownerId: v.string(), actorId: v.string(), action: v.string(),
    revision: v.number(), at: v.number(),
  }).index("by_assignment", ["assignmentId"]),
};

export function validateAssignment(input: {
  title: string; instructions: string; outcome: string; opensAt: number; dueAt: number;
}) {
  const title = input.title.trim(), instructions = input.instructions.trim();
  const outcome = input.outcome.trim();
  if (!title || title.length > 180 || instructions.length > 2000 ||
      outcome.length > 80 || (outcome && !/^[\\p{L}\\p{N} _.-]+$/u.test(outcome)))
    throw new Error("INVALID_ASSIGNMENT: Invalid title, instructions, or learning outcome.");
  if (!Number.isSafeInteger(input.opensAt) || !Number.isSafeInteger(input.dueAt) ||
      input.opensAt < 0 || input.dueAt <= input.opensAt)
    throw new Error("INVALID_DEADLINE: Deadline must follow the opening time.");
  return { title, instructions, outcome, opensAt: input.opensAt, dueAt: input.dueAt };
}
export function assignmentState(now: number, opensAt: number, dueAt: number,
  completedAt: number | null): "upcoming" | "due" | "missed" | "completed" | "completed_late" {
  if (completedAt !== null) return completedAt > dueAt ? "completed_late" : "completed";
  return now < opensAt ? "upcoming" : now > dueAt ? "missed" : "due";
}
