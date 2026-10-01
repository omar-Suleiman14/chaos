import { defineTable } from "convex/server";
import { v, type Infer } from "convex/values";
import { sourceFingerprint } from "./sourceFingerprint";
import { externalSourceValidator } from "./integrationModel";

export const LEARN_LIMITS = { blocks: 500, documentBytes: 300_000, text: 20_000, sources: 50, title: 200, tags: 20, folderDepth: 8, fileBytes: 25 * 1024 * 1024 } as const;
export const LEARN_WRITE_LIMITS = { creationsPerHour: 60, draftWritesPerMinute: 120, publicationsPerHour: 30, signalsPerMinute: 60 } as const;
export const citation = v.object({ sourceId: v.id("learnSources"), locator: v.union(
  v.object({ kind: v.literal("page"), page: v.number() }),
  v.object({ kind: v.literal("slide"), slide: v.number() }),
  v.object({ kind: v.literal("time"), start: v.number(), end: v.optional(v.number()) }),
  v.object({ kind: v.literal("section"), label: v.string() })
) });
// Additive v1 extension. Existing text and source-ID semantics remain unchanged.
export const storedSourceExcerpt = v.object({ id: v.string(), locator: citation.fields.locator, text: v.string() });
export const lessonInline = v.object({ text: v.string(), marks: v.optional(v.object({ bold: v.optional(v.boolean()), italic: v.optional(v.boolean()), underline: v.optional(v.boolean()), strike: v.optional(v.boolean()), code: v.optional(v.boolean()), textColor: v.optional(v.string()), backgroundColor: v.optional(v.string()) })), href: v.optional(v.string()) });
export const imageAnnotations = v.object({ v: v.literal(1), items: v.array(v.object({ id: v.string(), x: v.number(), y: v.number(), w: v.optional(v.number()), h: v.optional(v.number()), label: v.string(), body: v.optional(v.string()) })) });
const common = { id: v.string(), parentId: v.optional(v.string()), citations: v.array(citation), conceptIds: v.array(v.string()), presentation: v.optional(v.object({ alignment: v.optional(v.union(v.literal("left"), v.literal("center"), v.literal("right"), v.literal("justify"))), textColor: v.optional(v.string()), backgroundColor: v.optional(v.string()) })) };
const text = { ...common, text: v.string(), inline: v.optional(v.array(lessonInline)) };
export const lessonBlock = v.union(
  v.object({ ...text, type: v.literal("callout"), tone: v.union(v.literal("info"), v.literal("tip"), v.literal("warning"), v.literal("clinical"), v.literal("key")) }),
  v.object({ ...text, type: v.literal("code"), language: v.string() }),
  v.object({ ...text, type: v.literal("quote") }),
  v.object({ ...text, type: v.literal("toggle") }),
  v.object({ ...common, type: v.literal("divider") }),
  v.object({ ...text, type: v.literal("paragraph") }),
  v.object({ ...text, type: v.literal("heading"), level: v.union(v.literal(1), v.literal(2), v.literal(3)) }),
  v.object({ ...text, type: v.literal("list"), style: v.union(v.literal("bullet"), v.literal("number"), v.literal("check")), checked: v.optional(v.boolean()) }),
  v.object({ ...common, type: v.literal("image"), sourceId: v.id("learnSources"), alt: v.string(), caption: v.string(), name: v.optional(v.string()), previewWidth: v.optional(v.number()), showPreview: v.optional(v.boolean()), credit: v.optional(v.string()), creditUrl: v.optional(v.string()), figureKind: v.optional(v.union(v.literal("photo"), v.literal("diagram"))), annotations: v.optional(imageAnnotations) }),
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
export const lessonMeta = v.object({ indexing: v.optional(v.union(v.literal("index"), v.literal("noindex"))), coverUrl: v.optional(v.string()), authorDisplay: v.optional(v.string()), title: v.string(), description: v.string(), language: v.string(), tags: v.array(v.string()), license: v.optional(v.string()) });
export const visibility = v.union(v.literal("private"), v.literal("public"), v.literal("restricted"));
export const communityState = v.union(v.literal("ok"), v.literal("review"), v.literal("hidden"), v.literal("removed"));
export const sourceMetadata = v.object({ title: v.string(), kind: v.union(v.literal("pdf"), v.literal("slides"), v.literal("image"), v.literal("url"), v.literal("video"), v.literal("reference"), v.literal("file")), origin: v.string(), author: v.optional(v.string()), url: v.optional(v.string()), license: v.optional(v.string()) });
export const learnTables = {
  lessons: defineTable({ ownerId: v.string(), metadata: lessonMeta, draft: lessonDocument, revision: v.number(), status: v.union(v.literal("active"), v.literal("archived")), visibility, communityState, publishedVersionId: v.optional(v.id("lessonVersions")), parentLessonId: v.optional(v.id("lessons")), parentVersionId: v.optional(v.id("lessonVersions")), originLessonId: v.optional(v.id("lessons")), externalOrigin: v.optional(v.object({ connectionId: v.id("integrationTokens"), source: v.optional(externalSourceValidator), createdAt: v.number() })), createdAt: v.number(), updatedAt: v.number(), searchText: v.string() }).index("by_ownerId_and_updatedAt", ["ownerId", "updatedAt"]).index("by_visibility_and_communityState", ["visibility", "communityState"]).index("by_ownerId_and_visibility_and_communityState_and_status", ["ownerId", "visibility", "communityState", "status"]).searchIndex("search_text", { searchField: "searchText", filterFields: ["visibility", "communityState", "status", "ownerId"] }),
  lessonVersions: defineTable({ note: v.optional(v.string()), lessonId: v.id("lessons"), number: v.number(), metadata: lessonMeta, document: lessonDocument, visibility: v.optional(visibility), authorId: v.string(), curriculumMappings: v.optional(v.array(v.object({ versionId: v.id("curriculumVersions"), nodeId: v.id("curriculumNodes"), conceptKeys: v.array(v.string()), blockIds: v.array(v.string()) }))), publishedAt: v.number() }).index("by_lessonId_and_number", ["lessonId", "number"]),
  lessonDraftRecovery: defineTable({ lessonId: v.id("lessons"), revision: v.number(), metadata: lessonMeta, document: lessonDocument, savedAt: v.number() }).index("by_lessonId_and_revision", ["lessonId", "revision"]),
  lessonPermissions: defineTable({ lessonId: v.id("lessons"), userId: v.string(), role: v.union(v.literal("reader"), v.literal("editor")) }).index("by_lessonId_and_userId", ["lessonId", "userId"]),
  learnSourceCleanup: defineTable({ phase: v.optional(v.union(v.literal("lessons"), v.literal("collections"))), sourceId: v.optional(v.id("learnSources")), storageId: v.id("_storage"), ownerId: v.string(), dueAt: v.number(), cursor: v.union(v.string(), v.null()) }).index("by_dueAt", ["dueAt"]).index("by_storageId", ["storageId"]),
  learnSources: defineTable({ fingerprint: v.optional(sourceFingerprint), nearDuplicateOf: v.optional(v.id("learnSources")), excerpts: v.optional(v.array(storedSourceExcerpt)), excerptRevision: v.optional(v.number()), ownerId: v.string(), metadata: sourceMetadata, metadataVisibility: visibility, contentVisibility: visibility, storageId: v.optional(v.id("_storage")), sha256: v.optional(v.string()), size: v.optional(v.number()), contentType: v.optional(v.string()), uploadedBy: v.string(), createdAt: v.number(), status: v.union(v.literal("active"), v.literal("retained"), v.literal("removed")) }).index("by_storageId", ["storageId"]).index("by_sha256", ["sha256"]).index("by_ownerId_and_sha256_and_status", ["ownerId", "sha256", "status"]).index("by_ownerId_and_contentType_and_status", ["ownerId", "contentType", "status"]),
  learnSourceGrants: defineTable({ sourceId: v.id("learnSources"), userId: v.string(), metadata: v.boolean(), content: v.boolean() }).index("by_sourceId_and_userId", ["sourceId", "userId"]),
};
