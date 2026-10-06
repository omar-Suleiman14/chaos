import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Housekeeping that is pure policy: rows past a fixed age are removed in small
 * batches, and the sweep reschedules itself while any table had a full batch.
 * No judgement calls and no content a person could still need: the newest
 * recovery copy of every lesson is always kept (see docs/data-lifecycle.md).
 * Form uploads, resume drafts, grants and rate-limit windows are swept hourly
 * by crons.cleanup; this covers the rest.
 */

const DAY_MS = 86_400_000;
const BATCH = 50;

export const MAINTENANCE_POLICY = {
  /** Daily view de-duplication rows; only today's row is ever read. */
  communityViewsDays: 30,
  /** Team invitations, counted from their expiry so a late click still explains itself. */
  expiredInvitesDays: 30,
  /** Lesson draft recovery copies; the newest copy per lesson is never removed. */
  draftRecoveryDays: 90,
} as const;

export const sweep = internalMutation({
  args: {},
  returns: v.object({ views: v.number(), invites: v.number(), recovery: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();

    const views = await ctx.db.query("learnCommunityViews")
      .withIndex("by_recordedAt", (q) => q.lt("recordedAt", now - MAINTENANCE_POLICY.communityViewsDays * DAY_MS)).take(BATCH);
    for (const row of views) await ctx.db.delete("learnCommunityViews", row._id);

    const invites = await ctx.db.query("businessInvites")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now - MAINTENANCE_POLICY.expiredInvitesDays * DAY_MS)).take(BATCH);
    for (const row of invites) await ctx.db.delete("businessInvites", row._id);

    const copies = await ctx.db.query("lessonDraftRecovery")
      .withIndex("by_savedAt", (q) => q.lt("savedAt", now - MAINTENANCE_POLICY.draftRecoveryDays * DAY_MS)).take(BATCH);
    let recovery = 0;
    for (const row of copies) {
      const newest = await ctx.db.query("lessonDraftRecovery")
        .withIndex("by_lessonId_and_revision", (q) => q.eq("lessonId", row.lessonId)).order("desc").first();
      if (newest?._id === row._id) continue;
      await ctx.db.delete("lessonDraftRecovery", row._id);
      recovery++;
    }

    // A full batch of kept newest copies would loop forever, so only deletions reschedule.
    if (views.length === BATCH || invites.length === BATCH || recovery === BATCH) await ctx.scheduler.runAfter(1000, internal.maintenance.sweep, {});
    return { views: views.length, invites: invites.length, recovery };
  },
});
