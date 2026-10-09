import { defineTable } from "convex/server";
import { v } from "convex/values";
import { quizSnapshot } from "./quizModel";

export const assessmentRef = v.union(v.object({ kind: v.literal("form"), id: v.id("forms") }), v.object({ kind: v.literal("quiz"), id: v.id("quizzes") }));
export const assessmentVersionRef = v.union(v.object({ kind: v.literal("form"), id: v.id("formVersions") }), v.object({ kind: v.literal("quiz"), id: v.id("quizForkSnapshots") }));
/** Additive provenance only: content remains in the existing forms/quizzes tables. */
export const quizForkTables = {
  /** Classic quiz → the quiz form it became (convex/classicQuizMigration.ts). Kept after the purge so old links can be redirected. */
  classicQuizConversions: defineTable({ quizId: v.string(), formId: v.id("forms"), username: v.optional(v.string()), slug: v.optional(v.string()), convertedAt: v.number() }).index("by_quizId", ["quizId"]).index("by_username_and_slug", ["username", "slug"]),
  quizForkSnapshots: defineTable({ quizId: v.id("quizzes"), publishedAt: v.number(), snapshot: quizSnapshot, capturedAt: v.number() }).index("by_quizId_and_publishedAt", ["quizId", "publishedAt"]),
  quizForkLineage: defineTable({ asset: assessmentRef, parent: assessmentRef, parentVersion: assessmentVersionRef, root: assessmentRef, rootVersion: assessmentVersionRef, parentCreatorId: v.string(), rootCreatorId: v.string(), ownerId: v.string(), depth: v.number(), createdAt: v.number() }).index("by_asset", ["asset"]),
};
