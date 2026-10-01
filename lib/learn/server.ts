import type { Lesson } from "./types";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
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
 */
export async function fetchPublicLesson(id: string): Promise<Lesson | null | undefined> {
  const backend = client();
  if (!backend) return undefined;
  const result = await backend.query(api.learnFrontend.publicLesson, { id });
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

/** Published, explicitly indexable lesson ids. Preview deployments return no entries. */
export async function listIndexableLessons(): Promise<{ id: string; publishedAt: number }[]> {
  const backend = client();
  if (!backend || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")) return [];
  const result: { id: string; publishedAt: number }[] = [];
  let cursor: string | null = null;
  // Bound each sitemap build to 1,000 scanned assets; expand through sitemap shards later.
  for (let page = 0; page < 20; page++) {
    const batch: { page: { lessonId: string; publishedAt: number }[]; isDone: boolean; continueCursor: string } = await backend.query(api.learnFrontend.listIndexableLessons, { paginationOpts: { numItems: 50, cursor } });
    result.push(...batch.page.map(entry => ({ id: entry.lessonId, publishedAt: entry.publishedAt })));
    if (batch.isDone) break;
    cursor = batch.continueCursor;
  }
  return result;
}
