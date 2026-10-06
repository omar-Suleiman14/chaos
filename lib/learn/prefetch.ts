"use client";

import { api } from "@/convex/_generated/api";
import { prefetchQuery } from "@/lib/queryCache";

/**
 * Starts loading a lesson someone is about to open (hover, focus, or the next lesson in a course),
 * with the same query the page will read: a lesson opened from a course reads the course's copy.
 */
export function prefetchLesson(id: string, courseId?: string | null) {
  if (courseId) prefetchQuery(api.courses.lesson, { courseId, lessonId: id });
  else prefetchQuery(api.learnFrontend.publicLesson, { id });
}
