import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { attachAssessmentForActor } from "./learnCollections";
import { requireLearnActor } from "./mcpLearn";
import { lessonAccessForActor } from "./lessons";
import { createGameForAccount } from "./live";
import schema from "./schema";
const asset = schema.tables.lessonAssessments.validator.fields.asset;
export const attach = internalMutation({ args: { userId: v.string(), lessonId: v.id("lessons"), asset, label: v.string(), order: v.number() }, returns: v.object({ relationshipId: v.id("lessonAssessments") }), handler: async (ctx, args) => ({ relationshipId: await attachAssessmentForActor(ctx, await requireLearnActor(ctx, args.userId), { lessonId: args.lessonId, asset: args.asset, label: args.label, order: args.order }) }) });
export const list = internalQuery({ args: { userId: v.string(), lessonId: v.id("lessons") }, returns: v.object({ assessments: v.array(schema.doc("lessonAssessments")) }), handler: async (ctx, args) => {
  await lessonAccessForActor(ctx, await requireLearnActor(ctx, args.userId), args.lessonId);
  return { assessments: await ctx.db.query("lessonAssessments").withIndex("by_lessonId_and_order", q => q.eq("lessonId", args.lessonId)).take(50) };
} });
/** Reuse existing Live lifecycle, scoring, plan limits and quiz eligibility. */
export const createLive = internalMutation({ args: { userId: v.string(), lessonId: v.id("lessons"), asset }, returns: v.object({ gameId: v.id("liveGames") }), handler: async (ctx, args) => {
  const actor = await requireLearnActor(ctx, args.userId);
  const lesson = await lessonAccessForActor(ctx, actor, args.lessonId, true);
  if (lesson.ownerId !== actor) throw new Error("Only the lesson owner can host linked assessments");
  const link = await ctx.db.query("lessonAssessments").withIndex("by_lessonId_and_asset", q => q.eq("lessonId", lesson._id).eq("asset", args.asset)).unique();
  if (!link) throw new Error("Linked assessment not found");
  return { gameId: await createGameForAccount(ctx, actor, args.asset.kind === "form" ? { formId: args.asset.id } : { quizId: args.asset.id }) };
} });
