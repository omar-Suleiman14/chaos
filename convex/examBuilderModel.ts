import { defineTable } from "convex/server";
import { v } from "convex/values";
import { examMarkingPolicy } from "./examGradingModel";

/** Draft-only planning data. Never used to serve a student or to grade an exam. */
export const allocationKind = v.union(
  v.literal("course"), v.literal("module"), v.literal("lecture"), v.literal("topic"),
);
export const examAllocation = v.object({
  id: v.string(),
  kind: allocationKind,
  /** "" for whole-course, course module ID, lecture ID, or exact topic label. */
  key: v.string(),
  count: v.number(),
  /** Points per selected question in this allocation; no changes to reusable bank defaults. */
  points: v.number(),
  /** Optional allocation-level marking rules, frozen at seal time. */
  marking: v.optional(examMarkingPolicy),
});
export const examSelection = v.object({
  questionId: v.id("questionBankItems"),
  allocationId: v.string(),
});

export const examBuilderTables = {
  examBuilderDrafts: defineTable({
    ownerId: v.string(),
    courseId: v.id("learnCollections"),
    title: v.string(),
    targetCount: v.number(),
    allocations: v.array(examAllocation),
    selections: v.array(examSelection),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_course_updated", ["ownerId", "courseId", "updatedAt"]),
};
