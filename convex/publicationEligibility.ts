import type { Doc, Id } from "./_generated/dataModel";

/** Live-publication facts only. Callers must still check audience, creator and immutable version. */
export function hasLiveLessonPublication(lesson: Doc<"lessons"> | null | undefined): lesson is Doc<"lessons"> & { publishedVersionId: Id<"lessonVersions"> } {
  return !!lesson && lesson.status === "active" && lesson.communityState === "ok" && !!lesson.publishedVersionId;
}

/** Public catalogue candidates; query visibility and creator/version checks remain at the caller. */
export function hasLiveCoursePublication(course: Doc<"learnCollections"> | null | undefined): course is Doc<"learnCollections"> & { publishedVersionId: Id<"collectionVersions"> } {
  return !!course && !course.archived && course.communityState === "ok" && !!course.publishedVersionId;
}
