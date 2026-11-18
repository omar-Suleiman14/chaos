// Owner-scoped MCP adapter for the existing course Exam Mode operations.
// The actor comes only from the secret-protected /api/mcp/v1 transport.
// Reuse the same business operations as the course UI; never call student exam endpoints.
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireLearnActor } from "./mcpLearn";
import { examAllocation, examSelection } from "./examBuilderModel";
import { examSettings } from "./examSettingsModel";
import { examAudience } from "./examAudienceModel";
import * as builder from "./examBuilder";
import * as runtime from "./examRuntime";
import * as settings from "./examSettings";
import * as audience from "./examAudience";
import * as results from "./examResults";
import { preparePublishedQuizForExam } from "./examQuizImport";
import { validateBankDraft } from "./questionBank";

const actor = { userId: v.string() };
const draft = { ...actor, draftId: v.id("examBuilderDrafts") };
const edit = { ...draft, expectedRevision: v.number() };

export const list = internalQuery({
  args: { ...actor, courseId: v.id("learnCollections") },
  handler: async (ctx, { userId, courseId }) => {
    await requireLearnActor(ctx, userId);
    const rows = await builder.forMcpListDrafts(ctx, { courseId }, userId);
    return { exams: rows.map(row => ({
      draftId: row._id, courseId: row.courseId, title: row.title,
      targetCount: row.targetCount, selectedCount: row.selections.length,
      revision: row.revision, updatedAt: row.updatedAt,
    })) };
  },
});
export const get = internalQuery({
  args: draft,
  handler: async (ctx, { userId, draftId }) => {
    await requireLearnActor(ctx, userId);
    const row = await builder.forMcpGetDraft(ctx, { draftId }, userId);
    // Question IDs, not question text or keys; bank authoring remains separate.
    return { draftId: row._id, courseId: row.courseId, title: row.title,
      targetCount: row.targetCount, allocations: row.allocations,
      selections: row.selections, revision: row.revision,
      editUrl: `https://chaos.fail/dashboard/courses/${row.courseId}/exams?draft=${draftId}` };
  },
});
export const create = internalMutation({
  args: { ...actor, courseId: v.id("learnCollections"), title: v.optional(v.string()) },
  handler: async (ctx, { userId, courseId, title }) => {
    await requireLearnActor(ctx, userId);
    const draftId = await builder.forMcpCreateDraft(ctx, { courseId, title }, userId);
    return { draftId, revision: 0, editUrl: `https://chaos.fail/dashboard/courses/${courseId}/exams?draft=${draftId}` };
  },
});
export const plan = internalMutation({
  args: { ...edit, title: v.string(), targetCount: v.number(), allocations: v.array(examAllocation) },
  handler: async (ctx, { userId, ...input }) => {
    await requireLearnActor(ctx, userId);
    return { revision: await builder.forMcpSavePlan(ctx, input, userId) };
  },
});
export const preview = internalQuery({
  args: draft,
  handler: async (ctx, { userId, draftId }) => {
    await requireLearnActor(ctx, userId);
    return builder.forMcpPreview(ctx, { draftId }, userId);
  },
});
export const candidates = internalQuery({
  args: { ...draft, allocationId: v.string(), offset: v.optional(v.number()) },
  handler: async (ctx, { userId, ...input }) => {
    await requireLearnActor(ctx, userId);
    return builder.forMcpCandidates(ctx, input, userId);
  },
});
export const select = internalMutation({
  args: { ...edit, selections: v.array(examSelection) },
  handler: async (ctx, { userId, ...input }) => {
    await requireLearnActor(ctx, userId);
    return { revision: await builder.forMcpSetSelections(ctx, input, userId) };
  },
});
export const autoFill = internalMutation({
  args: edit,
  handler: async (ctx, { userId, ...input }) => {
    await requireLearnActor(ctx, userId);
    return { revision: await builder.forMcpAutoFill(ctx, input, userId) };
  },
});
/**
 * Import a published, owner-authored quiz into a specific Course Exam Mode draft.
 * The complete conversion, private bank insert and selection update are atomic.
 * No student-facing form or exam publication state changes.
 */
export const importQuiz = internalMutation({
  args: { ...edit, sourceFormId: v.id("forms") },
  handler: async (ctx, { userId, draftId, expectedRevision, sourceFormId }) => {
    await requireLearnActor(ctx, userId);
    const exam = await builder.forMcpGetDraft(ctx, { draftId }, userId);
    if (exam.revision !== expectedRevision)
      throw new Error("REVISION_CONFLICT: Reload the exam before importing questions.");
    if (exam.selections.length)
      throw new Error("EXAM_HAS_SELECTIONS: Clear existing exam selections before importing a quiz.");

    const course = await ctx.db.get("learnCollections", exam.courseId);
    if (!course || course.ownerId !== userId || course.archived || course.communityState === "removed")
      throw new Error("NOT_FOUND: Active owned course not found.");
    builder.validatePlan(course, exam.title, exam.targetCount, exam.allocations);
    if (exam.allocations.reduce((sum, a) => sum + a.count, 0) !== exam.targetCount)
      throw new Error("INCOMPLETE_EXAM: Allocate the full target count before importing.");

    const form = await ctx.db.get("forms", sourceFormId);
    if (!form || form.ownerId !== userId || form.isBanned ||
        !form.publishedVersion || !["live", "closed"].includes(form.status))
      throw new Error("NOT_FOUND: Owned published quiz not found.");
    const published = await ctx.db.query("formVersions")
      .withIndex("by_formId_and_version", q => q.eq("formId", form._id).eq("version", form.publishedVersion!))
      .unique();
    if (!published || published.publishedBy !== userId)
      throw new Error("NOT_FOUND: Published quiz version unavailable.");

    const entries = preparePublishedQuizForExam(published.definition, exam.allocations);
    for (const entry of entries)
      if (entry.moduleId && !course.modules?.some(m => m.id === entry.moduleId))
        throw new Error("NOT_FOUND: Syllabus module is no longer part of this course.");
    const existing = await ctx.db.query("questionBankLinks")
      .withIndex("by_course_module", q => q.eq("courseId", course._id)).take(1001);
    if (existing.length + entries.length > 1000)
      throw new Error("LIMIT_REACHED: Course question bank has reached its capacity.");

    const checked = entries.map(entry => ({ ...entry, item: validateBankDraft(entry.item) }));
    const now = Date.now();
    const selections = [];
    for (const entry of checked) {
      const questionId = await ctx.db.insert("questionBankItems", {
        ...entry.item, ownerId: userId, revision: 0, createdAt: now, updatedAt: now,
      });
      await ctx.db.insert("questionBankLinks", {
        ownerId: userId, questionId, courseId: course._id,
        ...(entry.moduleId ? { moduleId: entry.moduleId } : {}),
        scopeKey: JSON.stringify([course._id, entry.moduleId ?? null, null]),
        createdAt: now,
      });
      selections.push({ questionId, allocationId: entry.allocationId });
    }
    return {
      imported: entries.length,
      revision: await builder.forMcpSetSelections(ctx, { draftId, expectedRevision, selections }, userId),
    };
  },
});

export const seal = internalMutation({
  args: edit,
  handler: async (ctx, { userId, ...input }) => {
    await requireLearnActor(ctx, userId);
    return runtime.forMcpSealDraft(ctx, input, userId);
  },
});
export const getSettings = internalQuery({
  args: draft,
  handler: async (ctx, { userId, ...input }) => {
    await requireLearnActor(ctx, userId);
    return settings.forMcpGetForDraft(ctx, input, userId);
  },
});
export const saveSettings = internalMutation({
  args: { ...edit, settings: examSettings },
  handler: async (ctx, { userId, ...input }) => {
    await requireLearnActor(ctx, userId);
    return { revision: await settings.forMcpSaveForDraft(ctx, input, userId) };
  },
});
export const prepare = internalMutation({
  args: { ...edit, prepared: v.boolean() },
  handler: async (ctx, { userId, ...input }) => {
    await requireLearnActor(ctx, userId);
    return { revision: await settings.forMcpSetPrepared(ctx, input, userId) };
  },
});
export const getAudience = internalQuery({
  args: draft,
  handler: async (ctx, { userId, ...input }) => {
    await requireLearnActor(ctx, userId);
    return audience.forMcpGetForDraft(ctx, input, userId);
  },
});
export const assign = internalMutation({
  args: { ...edit, audience: examAudience, assigned: v.boolean() },
  handler: async (ctx, { userId, ...input }) => {
    await requireLearnActor(ctx, userId);
    return { revision: await audience.forMcpSetForDraft(ctx, input, userId) };
  },
});
export const setEntry = internalMutation({
  args: { ...edit, enabled: v.boolean() },
  handler: async (ctx, { userId, ...input }) => {
    await requireLearnActor(ctx, userId);
    return { revision: await audience.forMcpSetEntry(ctx, input, userId) };
  },
});
export const teacherResults = internalQuery({
  args: { ...draft, snapshotId: v.optional(v.id("examSnapshots")), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { userId, ...input }) => {
    await requireLearnActor(ctx, userId);
    return results.forMcpTeacherResults(ctx, input, userId);
  },
});
