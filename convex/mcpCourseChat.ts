/**
 * MCP student course retrieval. Every read independently verifies an active
 * caller, teacher approval + matching enrollment, and a live publication.
 */
import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { readPublicCourse, readCourseLesson } from "./courses";
import { hasApprovedCourseAccess } from "./courseMembership";
import { requireLearnActor } from "./mcpLearn";
import type { LessonBlock } from "./learnModel";

const excerpt = v.object({ blockId: v.string(), type: v.string(), text: v.string() });
const courseCard = v.object({ courseId: v.id("learnCollections"), title: v.string(),
  description: v.string(), language: v.string(), lessonCount: v.number() });
const hit = v.object({ lessonId: v.id("lessons"), versionId: v.id("lessonVersions"),
  title: v.string(), snippets: v.array(excerpt) });
const INVALID = "VALIDATION_FAILED: Invalid course chat search or pagination.";
const UNAVAILABLE = "NOT_FOUND: Course or published lecture unavailable.";

async function approvedCourse(ctx: QueryCtx, userId: string, courseId: string) {
  const actor = await requireLearnActor(ctx, userId);
  const course = await readPublicCourse(ctx, { courseId }, actor);
  if (!course || !await hasApprovedCourseAccess(ctx, course.id, actor)) throw new Error(UNAVAILABLE);
  return course;
}

/** No source asset identifiers or bytes, answer keys, private grading, or rubrics. */
export function publishedBlockText(block: LessonBlock): string {
  if ("text" in block) return block.text;
  if (block.type === "table") return block.rows.map(row => row.join(" | ")).join("\n").slice(0, 10000);
  if (block.type === "image") return [block.alt, block.caption].filter(Boolean).join(" — ");
  if (block.type === "youtube") return block.caption;
  return "";
}

export const list = internalQuery({
  args: { userId: v.string(), limit: v.optional(v.number()), cursor: v.optional(v.string()) },
  returns: v.object({ courses: v.array(courseCard), nextCursor: v.union(v.string(), v.null()) }),
  handler: async (ctx, { userId, limit = 5, cursor }) => {
    const actor = await requireLearnActor(ctx, userId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10 || (cursor?.length ?? 0) > 2000) throw new Error(INVALID);
    const page = await ctx.db.query("courseJoinRequests")
      .withIndex("by_student_updated", q => q.eq("studentId", actor))
      .order("desc")
      .paginate({ numItems: limit, cursor: cursor ?? null, maximumRowsRead: 10, maximumBytesRead: 1000000 });
    const courses = [];
    for (const request of page.page) {
      if (request.status !== "approved" || !await hasApprovedCourseAccess(ctx, request.courseId, actor)) continue;
      const course = await readPublicCourse(ctx, { courseId: request.courseId }, actor);
      if (course) courses.push({ courseId: course.id, title: course.title, description: course.description,
        language: course.language, lessonCount: course.lessons.length });
    }
    return { courses, nextCursor: page.isDone ? null : page.continueCursor };
  },
});

export const search = internalQuery({
  args: { userId: v.string(), courseId: v.string(), query: v.string(),
    offset: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.object({ courseId: v.id("learnCollections"), results: v.array(hit),
    nextOffset: v.union(v.number(), v.null()) }),
  handler: async (ctx, { userId, courseId, query, offset = 0, limit = 10 }) => {
    const text = query.trim().toLocaleLowerCase();
    if (!text || query.length > 200 || !Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 15) throw new Error(INVALID);
    const course = await approvedCourse(ctx, userId, courseId);
    const words = text.split(/\s+/u).filter(Boolean);
    // A page scans bounded *lectures*, not matches. Empty pages may have continuations.
    const scanned = course.lessons.slice(offset, offset + limit);
    const results = [];
    for (const lesson of scanned) {
      const version = await ctx.db.get("lessonVersions", lesson.versionId);
      if (!version || version.lessonId !== lesson.id) continue;
      const snippets = version.document.blocks.flatMap(block => {
        const content = publishedBlockText(block);
        return content && words.every(word => content.toLocaleLowerCase().includes(word))
          ? [{ blockId: block.id, type: block.type, text: content.slice(0, 350) }] : [];
      }).slice(0, 4);
      if (snippets.length || [lesson.title, lesson.description].some(value => words.every(word => value.toLocaleLowerCase().includes(word)))) {
        results.push({ lessonId: lesson.id, versionId: lesson.versionId, title: lesson.title, snippets });
      }
    }
    const next = offset + scanned.length;
    return { courseId: course.id, results, nextOffset: next < course.lessons.length ? next : null };
  },
});

export const lecture = internalQuery({
  args: { userId: v.string(), courseId: v.string(), lessonId: v.string(),
    offset: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.object({ courseId: v.id("learnCollections"), lessonId: v.id("lessons"),
    versionId: v.id("lessonVersions"), title: v.string(), blocks: v.array(excerpt),
    totalBlocks: v.number(), nextOffset: v.union(v.number(), v.null()) }),
  handler: async (ctx, { userId, courseId, lessonId, offset = 0, limit = 10 }) => {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 500 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new Error(INVALID);
    const course = await approvedCourse(ctx, userId, courseId);
    const selected = course.lessons.find(item => item.id === lessonId);
    if (!selected) throw new Error(UNAVAILABLE);
    const loaded = await readCourseLesson(ctx, { courseId, lessonId }, userId);
    if (!loaded || loaded.version._id !== selected.versionId || loaded.version.lessonId !== selected.id) throw new Error(UNAVAILABLE);
    const blocks = loaded.version.document.blocks;
    const page = blocks.slice(offset, offset + limit).map(block => ({
      blockId: block.id, type: block.type, text: publishedBlockText(block),
    }));
    const next = offset + page.length;
    return { courseId: course.id, lessonId: selected.id, versionId: selected.versionId,
      title: selected.title, blocks: page, totalBlocks: blocks.length,
      nextOffset: next < blocks.length ? next : null };
  },
});
