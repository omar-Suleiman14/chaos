import type { Lesson } from "./types";

/** Existing frontend gate for publicly listed, moderated and non-archived lessons. */
export function isListed(lesson: Lesson): boolean {
  return !!lesson.published && lesson.visibility === "public" && !lesson.archived && lesson.moderation === "ok";
}
