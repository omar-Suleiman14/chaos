import { defineTable } from "convex/server";
import { v } from "convex/values";
import { visibility, communityState, lessonMeta } from "./learnModel";
export const collectionItem = v.union(v.object({ kind: v.literal("lesson"), id: v.id("lessons"), versionId: v.id("lessonVersions") }), v.object({ kind: v.literal("source"), id: v.id("learnSources") }));
export const cards = v.array(v.object({ id: v.string(), front: v.string(), back: v.string(), conceptIds: v.array(v.string()) }));
export const assetTables = {
  learnCollections: defineTable({ ownerId: v.string(), metadata: lessonMeta, items: v.array(collectionItem), revision: v.number(), visibility, communityState, publishedVersionId: v.optional(v.id("collectionVersions")), createdAt: v.number(), updatedAt: v.number() }).index("by_ownerId_and_updatedAt", ["ownerId", "updatedAt"]),
  collectionVersions: defineTable({ collectionId: v.id("learnCollections"), number: v.number(), metadata: lessonMeta, items: v.array(collectionItem), publishedAt: v.number() }).index("by_collectionId_and_number", ["collectionId", "number"]),
  lessonAssessments: defineTable({ lessonId: v.id("lessons"), asset: v.union(v.object({ kind: v.literal("form"), id: v.id("forms") }), v.object({ kind: v.literal("quiz"), id: v.id("quizzes") })), label: v.string(), order: v.number() }).index("by_lessonId_and_asset", ["lessonId", "asset"]).index("by_lessonId_and_order", ["lessonId", "order"]),
  flashcardSets: defineTable({ ownerId: v.string(), title: v.string(), cards, revision: v.number(), visibility, publishedVersionId: v.optional(v.id("flashcardVersions")), parentSetId: v.optional(v.id("flashcardSets")), parentVersionId: v.optional(v.id("flashcardVersions")), originSetId: v.optional(v.id("flashcardSets")), updatedAt: v.number() }).index("by_ownerId_and_updatedAt", ["ownerId", "updatedAt"]),
  flashcardVersions: defineTable({ setId: v.id("flashcardSets"), number: v.number(), title: v.string(), cards, publishedAt: v.number() }).index("by_setId_and_number", ["setId", "number"]),
};
