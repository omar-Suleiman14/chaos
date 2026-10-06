import { v } from "convex/values";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { attachAssessmentForActor } from "./learnCollections";
import { requireLearnActor } from "./mcpLearn";
import { lessonAccessForActor } from "./lessons";
import { createGameForAccount } from "./live";
import schema from "./schema";
import { bareAssetRef } from "./mcpIds";
/** Assistants pass plain strings; create_form and create_game_draft return form IDs even for quizzes. */
const asset = v.object({ kind: v.union(v.literal("form"), v.literal("quiz")), id: v.string() });
function lessonIdFor(ctx: QueryCtx, id: string): Id<"lessons"> {
  const lessonId = ctx.db.normalizeId("lessons", id);
  if (!lessonId) throw new Error("NOT_FOUND: Lesson not found; use an ID returned by Chaos tools.");
  return lessonId;
}
/** Resolve by the ID's real table, so a quiz made with create_form attaches whether it is sent as "quiz" or "form". */
function assetFor(ctx: QueryCtx, ref: { kind: "form" | "quiz"; id: string }): Doc<"lessonAssessments">["asset"] {
  const input = bareAssetRef(ref);
  const formId = ctx.db.normalizeId("forms", input.id), quizId = ctx.db.normalizeId("quizzes", input.id);
  if (formId) return { kind: "form", id: formId };
  if (quizId) return { kind: "quiz", id: quizId };
  throw new Error(`NOT_FOUND: ${input.kind === "form" ? "Quiz form" : "Quiz"} not found; use the id returned by create_form or create_game_draft.`);
}
export const attach = internalMutation({ args: { userId: v.string(), lessonId: v.string(), asset, label: v.string(), order: v.number() }, returns: v.object({ relationshipId: v.id("lessonAssessments") }), handler: async (ctx, args) => ({ relationshipId: await attachAssessmentForActor(ctx, await requireLearnActor(ctx, args.userId), { lessonId: lessonIdFor(ctx, args.lessonId), asset: assetFor(ctx, args.asset), label: args.label, order: args.order }) }) });
export const list = internalQuery({ args: { userId: v.string(), lessonId: v.string() }, returns: v.object({ assessments: v.array(schema.doc("lessonAssessments")) }), handler: async (ctx, args) => {
  const lessonId = lessonIdFor(ctx, args.lessonId);
  await lessonAccessForActor(ctx, await requireLearnActor(ctx, args.userId), lessonId);
  return { assessments: await ctx.db.query("lessonAssessments").withIndex("by_lessonId_and_order", q => q.eq("lessonId", lessonId)).take(50) };
} });
/** Reuse existing Live lifecycle, scoring, plan limits and quiz eligibility. */
export const createLive = internalMutation({ args: { userId: v.string(), lessonId: v.string(), asset }, returns: v.object({ gameId: v.id("liveGames") }), handler: async (ctx, args) => {
  const actor = await requireLearnActor(ctx, args.userId), target = assetFor(ctx, args.asset);
  const lesson = await lessonAccessForActor(ctx, actor, lessonIdFor(ctx, args.lessonId), true);
  if (lesson.ownerId !== actor) throw new Error("FORBIDDEN: Only the lesson owner can host linked assessments.");
  // Match on kind and id, not the stored object, so key order never hides a link.
  const links = await ctx.db.query("lessonAssessments").withIndex("by_lessonId_and_order", q => q.eq("lessonId", lesson._id)).take(50);
  if (!links.some(link => link.asset.kind === target.kind && link.asset.id === target.id)) throw new Error("NOT_FOUND: Attach the assessment to this lesson with attach_lesson_quiz first.");
  return { gameId: await createGameForAccount(ctx, actor, target.kind === "form" ? { formId: target.id } : { quizId: target.id }) };
} });
