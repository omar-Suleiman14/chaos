import { ConvexError, type Infer } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { progressKey } from "./learnCommunityModel";
import { v } from "convex/values";
import { lessonAccessForActor } from "./lessons";
import { LEARN_LIMITS } from "./learnModel";

export const studyTarget = v.object(progressKey);
export type StudyActor = { subject: string; tokenIdentifier: string };
type Target = Infer<typeof studyTarget>;
function integer(value: number, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error("Invalid sequence or revision");
}
/** Internal helper: callers authenticate actor before invoking. */
export async function resolveStudyTarget(ctx: QueryCtx | MutationCtx, actor: { subject: string | null }, args: Target) {
  const lesson = await lessonAccessForActor(ctx, actor.subject, args.lessonId);
  if ((args.versionId !== undefined) === (args.revision !== undefined)) throw new Error("Choose exactly one version or draft revision");
  if (args.versionId) {
    if (lesson.publishedVersionId !== args.versionId) await lessonAccessForActor(ctx, actor.subject, args.lessonId, true);
    const version = await ctx.db.get("lessonVersions", args.versionId);
    if (!version || version.lessonId !== args.lessonId) throw new Error("Version not accessible");
    return { key: `v:${args.versionId}`, document: version.document };
  }
  integer(args.revision!);
  await lessonAccessForActor(ctx, actor.subject, args.lessonId, true);
  if (lesson.revision !== args.revision) throw new ConvexError({ code: "REVISION_CONFLICT", message: "Stale draft revision", currentRevision: lesson.revision });
  return { key: `r:${args.revision}`, document: lesson.draft };
}
export async function readStudyProgress(ctx: QueryCtx | MutationCtx, actor: StudyActor, args: Target) {
  const target = await resolveStudyTarget(ctx, actor, args);
  return ctx.db.query("learnProgress").withIndex("by_userKey_and_lessonId_and_key", q => q.eq("userKey", actor.tokenIdentifier).eq("lessonId", args.lessonId).eq("key", target.key)).unique();
}
export async function startStudySession(ctx: MutationCtx, actor: StudyActor, args: Target) {
  const target = await resolveStudyTarget(ctx, actor, args);
  const old = await readStudyProgress(ctx, actor, args);
  const sessionSeq = (old?.sessionSeq ?? 0) + 1; integer(sessionSeq, 1);
  if (old) await ctx.db.patch("learnProgress", old._id, { sessionSeq, writeSeq: 0, updatedAt: Date.now() });
  else await ctx.db.insert("learnProgress", { ...args, userKey: actor.tokenIdentifier, key: target.key, sessionSeq, writeSeq: 0, completedBlocks: [], updatedAt: Date.now() });
  return sessionSeq;
}
export async function completeStudyBlocks(ctx: MutationCtx, actor: StudyActor, args: Target & { sessionSeq: number; writeSeq: number; blockIds: string[] }, staleBehavior: "conflict" | "false" = "conflict") {
  const target = await resolveStudyTarget(ctx, actor, args);
  integer(args.sessionSeq, 1); integer(args.writeSeq, 1);
  if (args.blockIds.length > LEARN_LIMITS.blocks || args.blockIds.some(id => !target.document.blocks.some(block => block.id === id))) throw new Error("Invalid or excessive block completion");
  const old = await readStudyProgress(ctx, actor, args);
  if (!old || old.sessionSeq !== args.sessionSeq || old.writeSeq >= args.writeSeq) {
    if (staleBehavior === "false") return false;
    throw new ConvexError({ code: "PROGRESS_CONFLICT", sessionSeq: old?.sessionSeq ?? 0, writeSeq: old?.writeSeq ?? 0 });
  }
  const completedBlocks = [...new Set([...old.completedBlocks, ...args.blockIds])];
  if (completedBlocks.length > LEARN_LIMITS.blocks) throw new Error("Completion bound exceeded");
  await ctx.db.patch("learnProgress", old._id, { completedBlocks, writeSeq: args.writeSeq, updatedAt: Date.now() });
  return { sessionSeq: args.sessionSeq, writeSeq: args.writeSeq, completedBlocks };
}
