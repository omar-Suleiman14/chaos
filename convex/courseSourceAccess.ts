import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { canReadCourseAttachedLesson, courseProtectionVersion, hasApprovedCourseAccess } from "./courseMembership";

/** Index immutable course references; draft edits cannot release published files. */
export async function syncCourseSources(ctx: MutationCtx, courseId: Id<"learnCollections">) {
  const course = await ctx.db.get("learnCollections", courseId);
  const version = course ? await courseProtectionVersion(ctx, course) : null;
  const wanted = new Set<Id<"learnSources">>();
  const forms = new Set<Id<"forms">>();
  if (version?.collectionId === courseId) {
    for (const item of version.items) {
      if (item.kind === "source") wanted.add(item.id);
      else {
        const lesson = await ctx.db.get("lessonVersions", item.versionId);
        if (lesson?.lessonId !== item.id) continue;
        const attached = await ctx.db.query("lessonAssessments").withIndex("by_lessonId_and_order", q => q.eq("lessonId", item.id)).take(51);
        if (attached.length > 50) throw new Error("LIMIT_REACHED: Too many lesson assessments.");
        for (const assessment of attached) if (assessment.asset.kind === "form") forms.add(assessment.asset.id);
        for (const block of lesson.document.blocks) {
          if (block.type === "source" || block.type === "image") wanted.add(block.sourceId);
          if (block.type === "quiz" && block.asset.kind === "form") forms.add(block.asset.id);
          for (const citation of block.citations) wanted.add(citation.sourceId);
        }
      }
    }
  }
  // Referencing somebody else's public resource must not revoke its public access.
  for (const sourceId of wanted) {
    const source = await ctx.db.get("learnSources", sourceId);
    if (!source || source.ownerId !== course?.ownerId) wanted.delete(sourceId);
  }
  const existing = await ctx.db.query("courseSourceMemberships").withIndex("by_course", q => q.eq("courseId", courseId)).take(1001);
  if (wanted.size > 1000 || existing.length > 1000) throw new Error("LIMIT_REACHED: At most 1000 distinct course sources.");
  for (const edge of existing) {
    if (!wanted.delete(edge.sourceId)) await ctx.db.delete("courseSourceMemberships", edge._id);
  }
  for (const sourceId of wanted) await ctx.db.insert("courseSourceMemberships", { courseId, sourceId });
  if (version?.collectionId === courseId) for (const courseModule of version.modules ?? []) {
    for (const asset of courseModule.assessments) {
      const formId = ctx.db.normalizeId("forms", asset.id);
      if (formId) forms.add(formId);
    }
  }
  for (const formId of forms) {
    const form = await ctx.db.get("forms", formId);
    if (!form || form.ownerId !== course?.ownerId) forms.delete(formId);
    else if (form.courseAccessRequired !== true) await ctx.db.patch("forms", formId, { courseAccessRequired: true });
  }
  const priorForms = await ctx.db.query("courseFormMemberships").withIndex("by_course", q => q.eq("courseId", courseId)).take(1001);
  if (forms.size > 1000 || priorForms.length > 1000) throw new Error("LIMIT_REACHED: At most 1000 distinct course assessments.");
  for (const edge of priorForms) if (!forms.delete(edge.formId)) await ctx.db.delete("courseFormMemberships", edge._id);
  for (const formId of forms) await ctx.db.insert("courseFormMemberships", { courseId, formId });
  if (!await ctx.db.query("courseSourceAccessState").first()) {
    const courses = await ctx.db.query("learnCollections").take(2);
    if (courses.length === 1 && courses[0]._id === courseId)
      await ctx.db.insert("courseSourceAccessState", { complete: true, generation: 0, cursor: null });
  }
}

/** Direct respondent links and their hosted media obey the same course boundary. */
export async function canReadCourseForm(ctx: QueryCtx, form: Doc<"forms">, actor: string | null) {
  const formId = form._id;
  if (actor === form.ownerId) return true;
  const state = await ctx.db.query("courseSourceAccessState").first();
  if (state?.complete && form.courseAccessRequired !== true) return true;
  if (!state?.complete && await ctx.db.query("learnCollections").first()) return false;
  const edges = await ctx.db.query("courseFormMemberships").withIndex("by_form", q => q.eq("formId", formId)).take(101);
  if (edges.length > 100) return false;
  for (const edge of edges) {
    const course = await ctx.db.get("learnCollections", edge.courseId);
    if (!course) continue;
    if (course.ownerId !== form.ownerId) continue;
    if (!course.publishedVersionId || course.archived || course.communityState === "hidden" || course.communityState === "removed" ||
        !await hasApprovedCourseAccess(ctx, course._id, actor)) return false;
  }
  const attached = await ctx.db.query("lessonAssessments").withIndex("by_asset", q => q.eq("asset", { kind: "form", id: formId })).take(101);
  if (attached.length > 100) return false;
  for (const edge of attached) {
    const lesson = await ctx.db.get("lessons", edge.lessonId);
    if (lesson && !await canReadCourseAttachedLesson(ctx, lesson.ownerId, lesson._id, actor)) return false;
  }
  return true;
}

/** Empty installations have no historic attachments to migrate. */
export async function initializeCourseSourceIndex(ctx: MutationCtx) {
  if (!await ctx.db.query("courseSourceAccessState").first() && !await ctx.db.query("learnCollections").first())
    await ctx.db.insert("courseSourceAccessState", { complete: true, generation: 0, cursor: null });
}

/** Every transport uses current admission; a source grant alone cannot bypass a course. */
export async function canReadCourseSource(ctx: QueryCtx, sourceId: Id<"learnSources">, actor: string | null) {
  const state = await ctx.db.query("courseSourceAccessState").first();
  // Existing installations must finish the resumable backfill before external file reads.
  if (!state?.complete && await ctx.db.query("learnCollections").first()) return false;
  const edges = await ctx.db.query("courseSourceMemberships").withIndex("by_source", q => q.eq("sourceId", sourceId)).take(101);
  if (edges.length > 100) return false;
  let protectedSource = false;
  for (const edge of edges) {
    const course = await ctx.db.get("learnCollections", edge.courseId);
    if (!course) continue;
    protectedSource = true;
    if (!course.publishedVersionId || course.archived || course.communityState === "hidden" || course.communityState === "removed") continue;
    if (await hasApprovedCourseAccess(ctx, course._id, actor)) return true;
  }
  return !protectedSource;
}

const worker = makeFunctionReference<"mutation", { cursor: string | null; generation: number }, null>("courseSourceAccess:backfillPage");
export const backfill = internalMutation({
  args: { restart: v.optional(v.boolean()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const old = await ctx.db.query("courseSourceAccessState").first();
    if (old && !old.complete && !args.restart) return null;
    const generation = (old?.generation ?? 0) + 1;
    const value = { generation, complete: false, cursor: null };
    if (old) await ctx.db.patch("courseSourceAccessState", old._id, value);
    else await ctx.db.insert("courseSourceAccessState", value);
    await ctx.scheduler.runAfter(0, worker, { generation, cursor: null });
    return null;
  },
});
export const backfillPage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), generation: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.query("courseSourceAccessState").first();
    if (!state || state.complete || state.generation !== args.generation || state.cursor !== args.cursor) return null;
    const page = await ctx.db.query("learnCollections").paginate({ cursor: args.cursor, numItems: 1, maximumRowsRead: 1 });
    for (const course of page.page) await syncCourseSources(ctx, course._id);
    await ctx.db.patch("courseSourceAccessState", state._id, { complete: page.isDone, cursor: page.isDone ? null : page.continueCursor });
    if (!page.isDone) await ctx.scheduler.runAfter(0, worker, { generation: args.generation, cursor: page.continueCursor });
    return null;
  },
});
