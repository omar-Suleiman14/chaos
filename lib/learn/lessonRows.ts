import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { Lesson, LessonMeta } from "./types";
import { fromDurableDocument } from "./chaosDocument";

/** Pure durable-to-UI adapters. Do not couple these to hooks or local storage. */
export function uiMeta(metadata: Doc<"lessons">["metadata"]): LessonMeta { return { ...metadata, curricula: [], indexing: metadata.indexing ?? "noindex" }; }
export function uiLesson(row: Doc<"lessons">, version?: Doc<"lessonVersions"> | null): Lesson {
  const draft = { meta: uiMeta(row.metadata), content: fromDurableDocument(row.draft), updatedAt: row.updatedAt };
  return { id: row._id, ownerId: row.ownerId, ownerName: row.metadata.authorDisplay ?? "Chaos creator", draft,
    ...(version ? { published: { version: version.number, meta: { ...uiMeta(version.metadata), curricula: (version.curriculumMappings ?? []).map(m => ({ moduleId: m.nodeId, versionId: m.versionId, path: [], versionLabel: "" })) }, content: fromDurableDocument(version.document), publishedAt: version.publishedAt }, publishedDraftAt: JSON.stringify(row.draft) === JSON.stringify(version.document) && JSON.stringify(row.metadata) === JSON.stringify(version.metadata) ? row.updatedAt : version.publishedAt } : {}),
    visibility: row.visibility === "public" ? "public" : "private", ...(row.visibility === "restricted" && row.audienceTeamId ? { teamId: row.audienceTeamId } : {}), sources: [], quizzes: [],
    moderation: row.communityState === "review" ? "under_review" : row.communityState === "hidden" ? "restricted" : row.communityState === "removed" ? "removed" : "ok",
    quality: "none", stats: { views: 0, saves: 0, helpful: 0, notHelpful: 0, forks: 0 }, archived: row.status === "archived", createdAt: row.createdAt, updatedAt: row.updatedAt,
    ...(row.createdWith ? { createdWith: row.createdWith } : {}),
    ...(row.parentLessonId ? { forkedFrom: { kind: "lesson" as const, sourceId: row.parentLessonId, sourceTitle: "Original lesson", authorId: "", authorName: "Chaos creator", forkedAt: row.createdAt, originId: row.originLessonId } } : {}),
  };
}
export function publicUiLesson(result: { lessonId: Id<"lessons">; ownerId: string; ownerName: string; createdWith?: Doc<"lessons">["createdWith"]; createdAt: number; version: Doc<"lessonVersions"> }): Lesson {
  return { ...uiLesson({ _id: result.lessonId, _creationTime: result.createdAt, ownerId: result.ownerId, createdWith: result.createdWith, metadata: result.version.metadata, draft: result.version.document, revision: 0, status: "active", visibility: "public", communityState: "ok", createdAt: result.createdAt, updatedAt: result.version.publishedAt, searchText: "", publishedVersionId: result.version._id }, result.version), ownerName: result.ownerName };
}
