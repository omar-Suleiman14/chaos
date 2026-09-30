import { defineTable } from "convex/server";
import { v, type Infer } from "convex/values";
import { externalSourceValidator } from "./integrationModel";

export const LEARN_LIMITS = { blocks: 500, documentBytes: 300_000, text: 20_000, sources: 50, title: 200, tags: 20, folderDepth: 12, fileBytes: 25 * 1024 * 1024 } as const;
export const citation = v.object({ sourceId: v.id("learnSources"), locator: v.union(
  v.object({ kind: v.literal("page"), page: v.number() }),
  v.object({ kind: v.literal("slide"), slide: v.number() }),
  v.object({ kind: v.literal("time"), start: v.number(), end: v.optional(v.number()) }),
  v.object({ kind: v.literal("section"), label: v.string() })
) });
const common = { id: v.string(), parentId: v.optional(v.string()), citations: v.array(citation), conceptIds: v.array(v.string()) };
const text = { ...common, text: v.string() };
export const lessonBlock = v.union(
  v.object({ ...text, type: v.literal("paragraph") }),
  v.object({ ...text, type: v.literal("heading"), level: v.union(v.literal(1), v.literal(2), v.literal(3)) }),
  v.object({ ...text, type: v.literal("list"), style: v.union(v.literal("bullet"), v.literal("number"), v.literal("check")), checked: v.optional(v.boolean()) }),
  v.object({ ...common, type: v.literal("image"), sourceId: v.id("learnSources"), alt: v.string(), caption: v.string() }),
  v.object({ ...text, type: v.literal("diagram"), format: v.literal("mermaid") }),
  v.object({ ...common, type: v.literal("youtube"), videoId: v.string(), start: v.optional(v.number()), end: v.optional(v.number()), caption: v.string() }),
  v.object({ ...text, type: v.literal("equation"), display: v.boolean() }),
  v.object({ ...common, type: v.literal("table"), rows: v.array(v.array(v.string())), headerRows: v.number() }),
  v.object({ ...common, type: v.literal("source"), sourceId: v.id("learnSources"), label: v.string() }),
  v.object({ ...common, type: v.literal("quiz"), asset: v.union(v.object({ kind: v.literal("form"), id: v.id("forms") }), v.object({ kind: v.literal("quiz"), id: v.id("quizzes") })) })
);
export const lessonDocument = v.object({ schemaVersion: v.literal(1), blocks: v.array(lessonBlock) });
export type LessonDocument = Infer<typeof lessonDocument>;
export type LessonBlock = Infer<typeof lessonBlock>;
export const lessonMeta = v.object({ title: v.string(), description: v.string(), language: v.string(), tags: v.array(v.string()), license: v.optional(v.string()) });
export const visibility = v.union(v.literal("private"), v.literal("public"), v.literal("restricted"));
export const communityState = v.union(v.literal("ok"), v.literal("review"), v.literal("hidden"), v.literal("removed"));
export const sourceMetadata = v.object({ title: v.string(), kind: v.union(v.literal("pdf"), v.literal("slides"), v.literal("image"), v.literal("url"), v.literal("video"), v.literal("reference"), v.literal("file")), origin: v.string(), author: v.optional(v.string()), url: v.optional(v.string()), license: v.optional(v.string()) });
export const learnTables = {
  lessons: defineTable({ ownerId: v.string(), metadata: lessonMeta, draft: lessonDocument, revision: v.number(), status: v.union(v.literal("active"), v.literal("archived")), visibility, communityState, publishedVersionId: v.optional(v.id("lessonVersions")), parentLessonId: v.optional(v.id("lessons")), parentVersionId: v.optional(v.id("lessonVersions")), originLessonId: v.optional(v.id("lessons")), externalOrigin: v.optional(v.object({ connectionId: v.id("integrationTokens"), source: v.optional(externalSourceValidator), createdAt: v.number() })), createdAt: v.number(), updatedAt: v.number(), searchText: v.string() }).index("by_ownerId_and_updatedAt", ["ownerId", "updatedAt"]).index("by_visibility_and_communityState", ["visibility", "communityState"]).searchIndex("search_text", { searchField: "searchText", filterFields: ["visibility", "communityState", "status", "ownerId"] }),
  lessonVersions: defineTable({ lessonId: v.id("lessons"), number: v.number(), metadata: lessonMeta, document: lessonDocument, visibility: v.optional(visibility), authorId: v.string(), curriculumMappings: v.optional(v.array(v.object({ versionId: v.id("curriculumVersions"), nodeId: v.id("curriculumNodes"), conceptKeys: v.array(v.string()), blockIds: v.array(v.string()) }))), publishedAt: v.number() }).index("by_lessonId_and_number", ["lessonId", "number"]),
  lessonDraftRecovery: defineTable({ lessonId: v.id("lessons"), revision: v.number(), metadata: lessonMeta, document: lessonDocument, savedAt: v.number() }).index("by_lessonId_and_revision", ["lessonId", "revision"]),
  lessonPermissions: defineTable({ lessonId: v.id("lessons"), userId: v.string(), role: v.union(v.literal("reader"), v.literal("editor")) }).index("by_lessonId_and_userId", ["lessonId", "userId"]),
  learnSources: defineTable({ ownerId: v.string(), metadata: sourceMetadata, metadataVisibility: visibility, contentVisibility: visibility, storageId: v.optional(v.id("_storage")), sha256: v.optional(v.string()), size: v.optional(v.number()), contentType: v.optional(v.string()), uploadedBy: v.string(), createdAt: v.number(), status: v.union(v.literal("active"), v.literal("retained"), v.literal("removed")) }).index("by_sha256", ["sha256"]).index("by_ownerId_and_sha256_and_status", ["ownerId", "sha256", "status"]),
  learnSourceGrants: defineTable({ sourceId: v.id("learnSources"), userId: v.string(), metadata: v.boolean(), content: v.boolean() }).index("by_sourceId_and_userId", ["sourceId", "userId"]),
};
