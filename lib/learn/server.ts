import type { Lesson } from "./types";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { lessonDocumentToEditorBlocks, type LessonEditorBlock } from "@/lib/lessonBlockAdapter";

function client() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}

// The SEO helpers consume text runs, whereas the editor adapter accepts strings too.
function metadataBlocks(blocks: LessonEditorBlock[]): unknown[] {
  return blocks.map(block => ({ ...block, content: typeof block.content === "string" ? [{ type: "text", text: block.content }] : block.content, children: metadataBlocks(block.children) }));
}

/**
 * Published lessons and courses are shared across requests for a minute, so opening one doesn't wait
 * on the backend each time; the reader's live subscription shows newer edits as soon as it connects.
 *
 * Misses are cached as values, never thrown. When a revalidation throws, Next keeps serving the stale
 * entry, so throwing on "not found" would keep a lesson that was made private, removed or moderated
 * public indefinitely. A cached miss is confirmed with a live read, so something published a moment
 * ago is never stuck behind a cached "not found". Transport errors still throw and keep the last good
 * copy, which is the behaviour we want during a backend outage.
 */
const PUBLIC_TTL = 60;
function publicCache<A extends string[], T>(key: string, read: (...args: A) => Promise<T | null>) {
  const cached = unstable_cache(async (...args: A) => ({ value: await read(...args) }), [key], { revalidate: PUBLIC_TTL });
  return async (...args: A): Promise<T | null> => (await cached(...args)).value ?? read(...args);
}

export type PublicLessonResult = NonNullable<FunctionReturnType<typeof api.learnFrontend.publicLesson>>;
export type CourseLessonResult = NonNullable<FunctionReturnType<typeof api.courses.lesson>>;

const cachedLessonResult = publicCache("public-lesson-result-v2", (id: string) => client()!.query(api.learnFrontend.publicLesson, { id }));

/**
 * The published lesson exactly as the reader's own query returns it, so the page renders it in
 * the first HTML instead of a placeholder while the browser connects to Convex. Anonymous: the
 * same copy for everyone, never anything only the signed-in visitor may see.
 */
export const fetchPublicLessonResult = cache(async (id: string): Promise<PublicLessonResult | null> => {
  if (!client()) return null;
  return cachedLessonResult(id).catch(() => null);
});

/**
 * Server-side read of a published lesson for metadata, JSON-LD and the sitemap.
 *
 * Uses an anonymous backend read so private owner/editor access never affects crawlers.
 * `undefined` means no backend URL; `null` means unavailable/private/moderated content.
 * This projection supports metadata only; client hooks own reader/editor rendering.
 * Cached per request, so generateMetadata and the page share one backend read.
 */
export const fetchPublicLesson = cache(async (id: string): Promise<Lesson | null | undefined> => {
  if (!client()) return undefined;
  const result = await fetchPublicLessonResult(id);
  return result ? toPublicLesson(result) : null;
});

/**
 * The public course a plain lesson link belongs to. Misses are cached too (as null), so a lesson
 * outside any course doesn't ask the backend on every visit; one added to a course shows inside it
 * within a minute.
 */
const cachedHomeCourse = unstable_cache(async (lessonId: string) => ({ courseId: await client()!.query(api.courses.courseForLesson, { lessonId }) }), ["lesson-home-course"], { revalidate: PUBLIC_TTL });
export const fetchHomeCourse = cache(async (lessonId: string): Promise<string | null | undefined> => {
  if (!client()) return undefined;
  return cachedHomeCourse(lessonId).then((r) => r.courseId, () => undefined);
});

/** A lesson as a public course serves it, for the first render of /learn/<id>?course=<course>. */
const cachedCourseLesson = publicCache("public-course-lesson-v2", (courseId: string, lessonId: string) => client()!.query(api.courses.lesson, { courseId, lessonId }));
export const fetchCourseLesson = cache(async (courseId: string, lessonId: string): Promise<CourseLessonResult | null> => {
  if (!client()) return null;
  return cachedCourseLesson(courseId, lessonId).catch(() => null);
});

function toPublicLesson(result: PublicLessonResult): Lesson | null {
  const converted = lessonDocumentToEditorBlocks(result.version.document);
  if (!converted.ok) return null;
  const meta = { ...result.version.metadata, indexing: result.version.metadata.indexing ?? "noindex" as const, curricula: [] };
  const content = metadataBlocks(converted.value);
  const published = { version: result.version.number, meta, content, publishedAt: result.version.publishedAt };
  // Metadata projection only: no private draft, notes, source bytes or grading data.
  return { id: result.lessonId, ownerId: result.ownerId, ownerName: result.ownerName,
    draft: { meta, content, updatedAt: published.publishedAt }, published, publishedDraftAt: published.publishedAt,
    visibility: "public", sources: [], quizzes: [], stats: { views: 0, saves: 0, helpful: 0, notHelpful: 0, forks: 0 },
    moderation: "ok", quality: "none", createdAt: result.createdAt, updatedAt: published.publishedAt };
}

/**
 * Discovery reads every page; the sitemap splits the result into 50,000-URL shards (lib/sitemap.ts).
 * The page bound only stops a runaway loop (a million scanned rows), and hitting it is logged, never silent.
 */
const DISCOVERY_PAGE_LIMIT = 20_000;
function warnIfTruncated(what: string, pages: number, done: boolean) {
  if (!done && pages >= DISCOVERY_PAGE_LIMIT) console.error(`sitemap: ${what} discovery stopped after ${pages} pages; later entries are missing`);
}

/** Published, explicitly indexable lesson ids. Preview deployments return no entries. */
export async function listIndexableLessons(): Promise<{ id: string; publishedAt: number }[]> {
  const backend = client();
  if (!backend || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")) return [];
  const result: { id: string; publishedAt: number }[] = [];
  let cursor: string | null = null;
  // Follows every page (filtered pages can be empty), bounded by the sitemap's URL limit.
  let page = 0, done = false;
  for (; page < DISCOVERY_PAGE_LIMIT && !done; page++) {
    const batch: { page: { lessonId: string; publishedAt: number }[]; isDone: boolean; continueCursor: string } = await backend.query(api.learnFrontend.listIndexableLessons, { paginationOpts: { numItems: 50, cursor } });
    result.push(...batch.page.map(entry => ({ id: entry.lessonId, publishedAt: entry.publishedAt })));
    done = batch.isDone;
    cursor = batch.continueCursor;
  }
  warnIfTruncated("lesson", page, done);
  return result;
}

/**
 * Server read of a published public course for the course page and metadata. `null` means the course
 * is not public; a backend error is thrown rather than read as "not found", so an outage renders the
 * error page (a temporary 5xx crawlers retry) instead of a 404 that tells them the course is gone.
 */
export const fetchPublicCourse = cache(async (id: string) => {
  if (!client()) return undefined;
  return cachedCourse(id);
});
const cachedCourse = publicCache("public-course-v2", (id: string) => client()!.query(api.courses.getPublic, { courseId: id }));

/** Every public course for the sitemap; empty on preview deployments. Errors propagate so the caller can keep its last sitemap. */
export async function listPublicCourses(): Promise<{ id: string; updatedAt: number }[]> {
  const backend = client();
  if (!backend || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")) return [];
  const result: { id: string; updatedAt: number }[] = [];
  let cursor: string | null = null;
  let page = 0, done = false;
  for (; page < DISCOVERY_PAGE_LIMIT && !done; page++) {
    const batch: { page: { id: string; updatedAt: number }[]; isDone: boolean; continueCursor: string } = await backend.query(api.courses.listIndexable, { paginationOpts: { numItems: 100, cursor } });
    result.push(...batch.page);
    done = batch.isDone;
    cursor = batch.continueCursor;
  }
  warnIfTruncated("course", page, done);
  return result;
}

/** The newest public courses, first page of the directory, for the first HTML of /learn. */
export const fetchCourseDirectory = unstable_cache(async () => {
  const backend = client();
  if (!backend) return [];
  try { return (await backend.query(api.courseDirectory.browse, { sort: "recent", paginationOpts: { numItems: 24, cursor: null } })).page; } catch { return []; }
}, ["course-directory"], { revalidate: PUBLIC_TTL });
