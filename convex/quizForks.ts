import { authorDb } from "./authorIndex";
import { docValidator } from "convex/server";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Infer } from "convex/values";
import { assessmentRef, quizForkTables } from "./quizForkModel";
import { createFormRecord } from "./forms";
import { consumeCreation } from "./plans";
import { creatorRestricted, requireActiveUser } from "./authz";
import { requireLearnActor } from "./mcpLearn";
import { publicationErrors } from "./quizModel";
import { publicQuizDefinition } from "./formQuiz";
import { randomCode } from "./serverUtils";

const argsValidator = v.object({ asset: assessmentRef, formVersionId: v.optional(v.id("formVersions")), expectedPublishedAt: v.optional(v.number()) });
const result = v.object({ asset: assessmentRef });
const lineage = docValidator("quizForkLineage", quizForkTables.quizForkLineage);
type Input = Infer<typeof argsValidator>;

export async function forkAssessmentForActor(ctx: MutationCtx, actor: string, input: Input): Promise<Infer<typeof result>> {
  await requireLearnActor(ctx, actor);
  const parent = input.asset;
  const previous = await ctx.db.query("quizForkLineage").withIndex("by_asset", q => q.eq("asset", parent)).unique();
  if ((previous?.depth ?? 0) >= 100) throw new Error("FORK_DEPTH_LIMIT: Maximum lineage depth is 100.");
  let asset: Infer<typeof assessmentRef>;
  let parentVersion: Infer<typeof import("./quizForkModel").assessmentVersionRef>;
  let parentCreatorId: string;
  if (parent.kind === "form") {
    if (input.expectedPublishedAt !== undefined || !input.formVersionId) throw new Error("VALIDATION: Select an immutable formVersionId.");
    const form = await ctx.db.get("forms", parent.id);
    const version = await ctx.db.get("formVersions", input.formVersionId);
    if (!form || !version || version.formId !== form._id || form.isBanned || await creatorRestricted(ctx, form.ownerId)) throw new Error("NOT_FOUND_OR_UNAUTHORIZED");
    if (form.ownerId !== actor && (form.status !== "live" || form.settings.access !== "public" || form.settings.allowedEmails?.length || form.settings.allowedDomains?.length || version.version !== form.publishedVersion)) throw new Error("NOT_FOUND_OR_UNAUTHORIZED");
    parentCreatorId = form.ownerId;
    // Someone else's quiz is forked without its answer key, as respondents see it; the owner keeps theirs.
    const definition = form.ownerId === actor ? version.definition : publicQuizDefinition(version.definition);
    asset = { kind: "form", id: await createFormRecord(ctx, actor, { ...definition, title: `${definition.title} (fork)`.slice(0, 200) }) };
    parentVersion = { kind: "form", id: version._id };
  } else {
    if (input.formVersionId || !Number.isFinite(input.expectedPublishedAt)) throw new Error("VALIDATION: Select expectedPublishedAt for a classic quiz.");
    const quiz = await ctx.db.get("quizzes", parent.id);
    if (!quiz || quiz.isBanned || await creatorRestricted(ctx, quiz.creatorId) || !quiz.isPublished || !quiz.publishedSnapshot) throw new Error("NOT_FOUND_OR_UNAUTHORIZED");
    if (quiz.publishedAt !== input.expectedPublishedAt) throw new Error("PUBLICATION_CONFLICT: Reload the current published quiz before forking.");
    const snapshot = quiz.publishedSnapshot;
    const errors = publicationErrors(snapshot.title, snapshot.questions);
    if (errors.length) throw new Error(`INVALID_PUBLICATION: ${errors.join(" ")}`);
    await consumeCreation(ctx, actor);
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", actor)).unique();
    if (!user) throw new Error("ACCOUNT_REQUIRED");
    const now = Date.now();
    let slug = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = `fork-${randomCode(16).toLowerCase()}`;
      if (!await ctx.db.query("quizzes").withIndex("by_creator_slug", q => q.eq("creatorUsername", user.username).eq("slug", candidate)).first()) { slug = candidate; break; }
    }
    if (!slug) throw new Error("SLUG_UNAVAILABLE");
    const id = await authorDb(ctx).insert("quizzes", { creatorId: actor, creatorUsername: user.username, title: `${snapshot.title} (fork)`.slice(0, 200), description: snapshot.description, slug, isPublished: false, createdAt: now, updatedAt: now });
    for (const question of snapshot.questions) {
      const { _id: _originalId, ...fields } = question;
      // Answers, accepted keywords, explanations and hints stay with the author: a fork of someone else's quiz starts without them.
      if (quiz.creatorId !== actor) { delete fields.correctAnswer; delete fields.correctAnswers; delete fields.keywords; delete fields.explanation; delete fields.hint; }
      await ctx.db.insert("questions", { ...fields, quizId: id });
    }
    const captured = await ctx.db.query("quizForkSnapshots").withIndex("by_quizId_and_publishedAt", q => q.eq("quizId", quiz._id).eq("publishedAt", quiz.publishedAt!)).unique();
    if (captured && JSON.stringify(captured.snapshot) !== JSON.stringify(snapshot)) throw new Error("PUBLICATION_CONFLICT: Published snapshot changed without a new publication identifier.");
    const snapshotId = captured?._id ?? await ctx.db.insert("quizForkSnapshots", { quizId: quiz._id, publishedAt: quiz.publishedAt!, snapshot, capturedAt: now });
    parentVersion = { kind: "quiz", id: snapshotId };
    asset = { kind: "quiz", id };
    parentCreatorId = quiz.creatorId;
  }
  await ctx.db.insert("quizForkLineage", { asset, parent, parentVersion, root: previous?.root ?? parent, rootVersion: previous?.rootVersion ?? parentVersion, parentCreatorId, rootCreatorId: previous?.rootCreatorId ?? parentCreatorId, ownerId: actor, depth: (previous?.depth ?? 0) + 1, createdAt: Date.now() });
  return { asset };
}
async function readLineage(ctx: QueryCtx, actor: string, asset: Infer<typeof assessmentRef>) {
  const owned = asset.kind === "form" ? (await ctx.db.get("forms", asset.id))?.ownerId === actor : (await ctx.db.get("quizzes", asset.id))?.creatorId === actor;
  if (!owned) throw new Error("NOT_FOUND_OR_UNAUTHORIZED");
  return await ctx.db.query("quizForkLineage").withIndex("by_asset", q => q.eq("asset", asset)).unique();
}
export const fork = mutation({ args: argsValidator.fields, returns: result, handler: async (ctx, args) => forkAssessmentForActor(ctx, (await requireActiveUser(ctx)).identity.subject, args) });
export const getLineage = query({ args: { asset: assessmentRef }, returns: v.union(lineage, v.null()), handler: async (ctx, args) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return readLineage(ctx, identity.subject, args.asset);
} });
export const mcpFork = internalMutation({ args: { userId: v.string(), ...argsValidator.fields }, returns: result, handler: async (ctx, args) => forkAssessmentForActor(ctx, await requireLearnActor(ctx, args.userId), args) });
export const mcpLineage = internalQuery({ args: { userId: v.string(), asset: assessmentRef }, returns: v.object({ lineage: v.union(lineage, v.null()) }), handler: async (ctx, args) => {
  const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.userId)).unique();
  if (!user || user.isBanned || user.suspendedUntil) throw new Error("ACCOUNT_RESTRICTED");
  return { lineage: await readLineage(ctx, args.userId, args.asset) };
} });
