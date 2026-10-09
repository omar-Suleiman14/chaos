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
 * Server-side read of a published lesson for metadata, JSON-LD and the sitemap.
 *
 * Uses an anonymous backend read so private owner/editor access never affects crawlers.
 * `undefined` means no backend URL; `null` means unavailable/private/moderated content.
 * This projection supports metadata only; client hooks own reader/editor rendering.
 * Cached per request, so generateMetadata and the page share one backend read.
 */
export const fetchPublicLesson = cache(async (id: string): Promise<Lesson | null | undefined> => {
  if (!client()) return undefined;
  return cachedLesson(id).catch(() => null);
});

/**
 * Published lessons and courses are shared across requests for a minute, so opening one doesn't wait
 * on the backend each time; the reader's live subscription shows newer edits as soon as it connects.
 * Only found items are kept: a miss throws, which unstable_cache never stores, so something published
 * a moment ago is never stuck behind a cached "not found".
 */
const PUBLIC_TTL = 60;
class Missing extends Error {}
const cachedLesson = unstable_cache(async (id: string) => {
  const lesson = await readPublicLesson(id);
  if (!lesson) throw new Missing(id);
  return lesson;
}, ["public-lesson"], { revalidate: PUBLIC_TTL });

export type PublicLessonResult = NonNullable<FunctionReturnType<typeof api.learnFrontend.publicLesson>>;
export type CourseLessonResult = NonNullable<FunctionReturnType<typeof api.courses.lesson>>;

/** The anonymous published-lesson read, shared across requests like the projection above. */
const cachedLessonResult = unstable_cache(async (id: string) => {
  const result = await client()!.query(api.learnFrontend.publicLesson, { id });
  if (!result) throw new Missing(id);
  return result;
}, ["public-lesson-result"], { revalidate: PUBLIC_TTL });

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
const cachedCourseLesson = unstable_cache(async (courseId: string, lessonId: string) => {
  const result = await client()!.query(api.courses.lesson, { courseId, lessonId });
  if (!result) throw new Missing(lessonId);
  return result;
}, ["public-course-lesson"], { revalidate: PUBLIC_TTL });
export const fetchCourseLesson = cache(async (courseId: string, lessonId: string): Promise<CourseLessonResult | null> => {
  if (!client()) return null;
  return cachedCourseLesson(courseId, lessonId).catch(() => null);
});

async function readPublicLesson(id: string): Promise<Lesson | null> {
  if (!client()) return null;
  const result = await cachedLessonResult(id).catch(() => null);
  if (!result) return null;
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

/** A sitemap file holds at most 50,000 URLs; discovery stops there and later entries need sitemap shards. */
const SITEMAP_URL_LIMIT = 50_000;
const SITEMAP_PAGE_LIMIT = 1_000;

/** Published, explicitly indexable lesson ids. Preview deployments return no entries. */
export async function listIndexableLessons(): Promise<{ id: string; publishedAt: number }[]> {
  const backend = client();
  if (!backend || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")) return [];
  const result: { id: string; publishedAt: number }[] = [];
  let cursor: string | null = null;
  // Follows every page (filtered pages can be empty), bounded by the sitemap's URL limit.
  for (let page = 0; page < SITEMAP_PAGE_LIMIT && result.length < SITEMAP_URL_LIMIT; page++) {
    const batch: { page: { lessonId: string; publishedAt: number }[]; isDone: boolean; continueCursor: string } = await backend.query(api.learnFrontend.listIndexableLessons, { paginationOpts: { numItems: 50, cursor } });
    result.push(...batch.page.map(entry => ({ id: entry.lessonId, publishedAt: entry.publishedAt })));
    if (batch.isDone) break;
    cursor = batch.continueCursor;
  }
  return result.slice(0, SITEMAP_URL_LIMIT);
}

/** Server read of a published public course for the course page, metadata and sitemap. */
export const fetchPublicCourse = cache(async (id: string) => {
  if (!client()) return undefined;
  return cachedCourse(id).catch(() => null);
});
const cachedCourse = unstable_cache(async (id: string) => {
  const course = await client()!.query(api.courses.getPublic, { courseId: id });
  if (!course) throw new Missing(id);
  return course;
}, ["public-course"], { revalidate: PUBLIC_TTL });

/** Every public course for the sitemap; empty on preview deployments. Errors propagate so the caller can keep its last sitemap. */
export async function listPublicCourses(): Promise<{ id: string; updatedAt: number }[]> {
  const backend = client();
  if (!backend || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")) return [];
  const result: { id: string; updatedAt: number }[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < SITEMAP_PAGE_LIMIT && result.length < SITEMAP_URL_LIMIT; page++) {
    const batch: { page: { id: string; updatedAt: number }[]; isDone: boolean; continueCursor: string } = await backend.query(api.courses.listIndexable, { paginationOpts: { numItems: 100, cursor } });
    result.push(...batch.page);
    if (batch.isDone) break;
    cursor = batch.continueCursor;
  }
  return result.slice(0, SITEMAP_URL_LIMIT);
}

/** The newest public courses, first page of the directory, for the first HTML of /learn. */
export const fetchCourseDirectory = unstable_cache(async () => {
  const backend = client();
  if (!backend) return [];
  try { return (await backend.query(api.courseDirectory.browse, { sort: "recent", paginationOpts: { numItems: 24, cursor: null } })).page; } catch { return []; }
}, ["course-directory"], { revalidate: PUBLIC_TTL });
