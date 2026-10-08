import { getAuthIdentity } from "./authIdentity";
import { docValidator } from "convex/server";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Infer } from "convex/values";
import { quizForkTables } from "./quizForkModel";
import { createFormRecord } from "./forms";
import { creatorRestricted, requireActiveUser } from "./authz";
import { requireLearnActor } from "./mcpLearn";
import { publicQuizDefinition } from "./formQuiz";

/** Forks are of quiz forms; lineage rows keep the wider reference type for history. */
const formRef = v.object({ kind: v.literal("form"), id: v.id("forms") });
const argsValidator = v.object({ asset: formRef, formVersionId: v.id("formVersions") });
const result = v.object({ asset: formRef });
const lineage = docValidator("quizForkLineage", quizForkTables.quizForkLineage);
type Input = Infer<typeof argsValidator>;

export async function forkAssessmentForActor(ctx: MutationCtx, actor: string, input: Input): Promise<Infer<typeof result>> {
  await requireLearnActor(ctx, actor);
  const parent = input.asset;
  const previous = await ctx.db.query("quizForkLineage").withIndex("by_asset", q => q.eq("asset", parent)).unique();
  if ((previous?.depth ?? 0) >= 100) throw new Error("FORK_DEPTH_LIMIT: Maximum lineage depth is 100.");
  const form = await ctx.db.get("forms", parent.id);
  const version = await ctx.db.get("formVersions", input.formVersionId);
  if (!form || !version || version.formId !== form._id || form.isBanned || await creatorRestricted(ctx, form.ownerId)) throw new Error("NOT_FOUND_OR_UNAUTHORIZED");
  if (form.ownerId !== actor && (form.status !== "live" || form.settings.access !== "public" || form.settings.allowedEmails?.length || form.settings.allowedDomains?.length || version.version !== form.publishedVersion)) throw new Error("NOT_FOUND_OR_UNAUTHORIZED");
  const parentCreatorId = form.ownerId;
  // Someone else's quiz is forked without its answer key, as respondents see it; the owner keeps theirs.
  const definition = form.ownerId === actor ? version.definition : publicQuizDefinition(version.definition);
  const asset = { kind: "form" as const, id: await createFormRecord(ctx, actor, { ...definition, title: `${definition.title} (fork)`.slice(0, 200) }) };
  const parentVersion = { kind: "form" as const, id: version._id };
  await ctx.db.insert("quizForkLineage", { asset, parent, parentVersion, root: previous?.root ?? parent, rootVersion: previous?.rootVersion ?? parentVersion, parentCreatorId, rootCreatorId: previous?.rootCreatorId ?? parentCreatorId, ownerId: actor, depth: (previous?.depth ?? 0) + 1, createdAt: Date.now() });
  return { asset };
}
async function readLineage(ctx: QueryCtx, actor: string, asset: Infer<typeof formRef>) {
  if ((await ctx.db.get("forms", asset.id))?.ownerId !== actor) throw new Error("NOT_FOUND_OR_UNAUTHORIZED");
  return await ctx.db.query("quizForkLineage").withIndex("by_asset", q => q.eq("asset", asset)).unique();
}
export const fork = mutation({ args: argsValidator.fields, returns: result, handler: async (ctx, args) => forkAssessmentForActor(ctx, (await requireActiveUser(ctx)).identity.subject, args) });
export const getLineage = query({ args: { asset: formRef }, returns: v.union(lineage, v.null()), handler: async (ctx, args) => {
  const identity = await getAuthIdentity(ctx);
  if (!identity) throw new Error("Not authenticated");
  return readLineage(ctx, identity.subject, args.asset);
} });
export const mcpFork = internalMutation({ args: { userId: v.string(), ...argsValidator.fields }, returns: result, handler: async (ctx, args) => forkAssessmentForActor(ctx, await requireLearnActor(ctx, args.userId), args) });
export const mcpLineage = internalQuery({ args: { userId: v.string(), asset: formRef }, returns: v.object({ lineage: v.union(lineage, v.null()) }), handler: async (ctx, args) => {
  const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.userId)).unique();
  if (!user || user.isBanned || user.suspendedUntil) throw new Error("ACCOUNT_RESTRICTED");
  return { lineage: await readLineage(ctx, args.userId, args.asset) };
} });
