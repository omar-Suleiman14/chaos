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
