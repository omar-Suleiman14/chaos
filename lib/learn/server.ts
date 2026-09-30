import type { Lesson } from "./types";

/**
 * Server-side read of a published lesson for metadata, JSON-LD and the sitemap.
 *
 * Returns `undefined` while Learn has no backend to ask (lessons live in the browser's local
 * store, so the server cannot see them); pages then fall back to neutral, noindex metadata.
 * Once the Learn backend exists, fetch the published version here (e.g. ConvexHttpClient
 * `lessons.getPublished`) and return `null` for missing, private or removed lessons.
 */
export async function fetchPublicLesson(id: string): Promise<Lesson | null | undefined> {
  void id;
  return undefined;
}

/** Published, indexable lesson ids for the sitemap. Empty until the backend exists. */
export async function listIndexableLessons(): Promise<{ id: string; publishedAt: number }[]> {
  return [];
}
