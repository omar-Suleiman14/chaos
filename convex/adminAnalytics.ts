import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { creatorRestricted, isPaidPlan } from "./authz";
import { requireAdminForActor } from "./adminAccess";
import { emptyMetrics, metricsValidator } from "./adminModel";
import { readFormCounts } from "./formCounts";

async function start(ctx: MutationCtx) {
  const prior = await ctx.db
    .query("adminMetrics")
    .withIndex("by_key", (q) => q.eq("key", "platform"))
    .unique();
  if (prior?.running && Date.now() - prior.startedAt < 15 * 60_000) return;
  const startedAt = Date.now();
  const patch = {
    running: true,
    startedAt,
    phase: "users" as const,
    cursor: null,
    pending: emptyMetrics,
  };
  if (prior) await ctx.db.patch("adminMetrics", prior._id, patch);
  else
    await ctx.db.insert("adminMetrics", {
      key: "platform",
      counts: emptyMetrics,
      ...patch,
    });
  await ctx.scheduler.runAfter(0, internal.adminAnalytics.scan, { startedAt });
}
export async function refreshForActor(ctx: MutationCtx, actorId?: string) {
  await requireAdminForActor(ctx, actorId);
  await start(ctx);
  return null;
}
export const refresh = mutation({
  args: {},
  returns: v.null(),
  handler: ctx => refreshForActor(ctx),
});
export const refreshScheduled = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await start(ctx);
    return null;
  },
});
export async function overviewForActor(ctx: QueryCtx, actorId?: string) {
  await requireAdminForActor(ctx, actorId);
  const stats = await ctx.db.query("adminMetrics").withIndex("by_key", q => q.eq("key", "platform")).unique();
  return stats ? { counts: stats.counts, running: stats.running, completedAt: stats.completedAt ?? null } : null;
}
export const overview = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      counts: metricsValidator,
      running: v.boolean(),
      completedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: ctx => overviewForActor(ctx),
});
/** One bounded page per transaction; does not load answers or drafts into the UI. */
export const scan = internalMutation({
  args: { startedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("adminMetrics")
      .withIndex("by_key", (q) => q.eq("key", "platform"))
      .unique();
    if (!job || !job.running || job.startedAt !== args.startedAt) return null;
    const pending = { ...job.pending };
    const options = {
      cursor: job.cursor,
      numItems: 25,
      maximumBytesRead: 2_000_000,
    };
    let phase = job.phase,
      done = false,
      cursor: string | null = null;
    if (phase === "users") {
      const page = await ctx.db.query("users").paginate(options);
      for (const user of page.page) {
        pending.users++;
        if (isPaidPlan(user, Date.now())) pending.pro++;
        if (user.isBanned || user.suspendedUntil) pending.restricted++;
      }
      cursor = page.isDone ? null : page.continueCursor;
      if (page.isDone) phase = "forms";
    } else if (phase === "forms") {
      const page = await ctx.db.query("forms").paginate(options);
      for (const form of page.page) {
        const counts = await readFormCounts(ctx, form);
        pending.forms++;
        pending.responses += counts.responseCount;
        pending.partials += counts.partialCount;
        if (
          form.status === "live" &&
          !form.isBanned &&
          !(await creatorRestricted(ctx, form.ownerId))
        )
          pending.liveForms++;
      }
      cursor = page.isDone ? null : page.continueCursor;
      if (page.isDone) phase = "quizzes";
    } else if (phase === "quizzes") {
      const page = await ctx.db.query("quizzes").paginate(options);
      for (const quiz of page.page) {
        pending.quizzes++;
        if (
          quiz.isPublished &&
          !quiz.isBanned &&
          !(await creatorRestricted(ctx, quiz.creatorId))
        )
          pending.liveQuizzes++;
      }
      cursor = page.isDone ? null : page.continueCursor;
      if (page.isDone) phase = "quizSessions";
    } else {
      const page = await ctx.db.query("quizSessions").paginate(options);
      for (const session of page.page) {
        pending.attempts++;
        if (
          session.status === "completed" ||
          (session.status === undefined && session.completedAt !== undefined)
        )
          pending.completedAttempts++;
      }
      cursor = page.isDone ? null : page.continueCursor;
      done = page.isDone;
    }
    await ctx.db.patch("adminMetrics", job._id, {
      pending,
      phase,
      cursor,
      running: !done,
      ...(done ? { counts: pending, completedAt: Date.now() } : {}),
    });
    if (!done)
      await ctx.scheduler.runAfter(0, internal.adminAnalytics.scan, args);
    return null;
  },
});
