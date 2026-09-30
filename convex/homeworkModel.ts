import { defineTable } from "convex/server";
import { v } from "convex/values";
export const HOMEWORK_LIMITS = { enrollments: 1000, attempts: 10 } as const;
export const homeworkTables = {
  homeworkAssignments: defineTable({
    ownerId: v.string(),
    title: v.string(),
    formId: v.id("forms"),
    versionId: v.id("formVersions"),
    opensAt: v.number(),
    deadline: v.number(),
    maxAttempts: v.number(),
    closed: v.boolean(),
    enrollmentCount: v.number(),
    createdAt: v.number(),
  }).index("by_ownerId", ["ownerId"]),
  homeworkEnrollments: defineTable({
    assignmentId: v.id("homeworkAssignments"),
    studentId: v.string(),
    active: v.boolean(),
    enrolledAt: v.number(),
    attempts: v.number(),
  }).index("by_assignmentId_and_studentId", ["assignmentId", "studentId"]),
  homeworkAttempts: defineTable({
    assignmentId: v.id("homeworkAssignments"),
    studentId: v.string(),
    number: v.number(),
    startedAt: v.number(),
    responseId: v.optional(v.id("formResponses")),
    submittedAt: v.optional(v.number()),
    score: v.optional(v.number()),
    maxScore: v.optional(v.number()),
  })
    .index("by_assignmentId_and_studentId", ["assignmentId", "studentId"])
    .index("by_responseId", ["responseId"]),
};
