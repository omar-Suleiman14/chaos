import { cronJobs } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { deleteResponseRecord, deleteUploadRecord } from "./formResults";

const BATCH = 100;
const DAY_MS = 86_400_000;

/**
 * Deletes responses older than each form's retention period. Walks the forms
 * table one page at a time and reschedules itself until every form is done.
 */
export const applyRetention = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    // One potentially large form/response per transaction; artifact cleanup has its own budget.
    const page = await ctx.db.query("forms").paginate({ numItems: 1, cursor: args.cursor, maximumBytesRead: 1024 * 1024 });
    let unfinished = false;
    for (const form of page.page) {
      const days = form.settings.retentionDays;
      if (days === undefined) continue;
      const cutoff = Date.now() - days * DAY_MS;
      const old = await ctx.db
        .query("formResponses")
        .withIndex("by_formId_and_submittedAt", (q) => q.eq("formId", form._id).lt("submittedAt", cutoff))
        .take(1);
      for (const r of old) await deleteResponseRecord(ctx, r);
      if (old.length) unfinished = true;
    }
    if (unfinished) await ctx.scheduler.runAfter(0, internal.crons.applyRetention, { cursor: args.cursor });
    else if (!page.isDone) await ctx.scheduler.runAfter(0, internal.crons.applyRetention, { cursor: page.continueCursor });
    return null;
  },
});

/** Removes abandoned uploads, expired resume copies and stale bookkeeping rows. */
export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    let more = false;

    const orphans = await ctx.db
      .query("formUploads")
      .withIndex("by_responseId_and_createdAt", (q) => q.eq("responseId", undefined).lt("createdAt", now - DAY_MS))
      .take(20);
    for (const u of orphans) await deleteUploadRecord(ctx, u);
    more ||= orphans.length === 20;

    const tickets = await ctx.db.query("formUploadTickets").withIndex("by_expiresAt", (q) => q.lt("expiresAt", now)).take(BATCH);
    for (const t of tickets) await ctx.db.delete("formUploadTickets", t._id);
    more ||= tickets.length === BATCH;

    const expired = await ctx.db.query("formResumeDrafts").withIndex("by_expiresAt", (q) => q.lt("expiresAt", now)).take(4);
    for (const d of expired) await ctx.db.delete("formResumeDrafts", d._id);
    more ||= expired.length === 4;

    const replays = await ctx.db.query("integrationIdempotency").withIndex("by_createdAt", (q) => q.lt("createdAt", now - DAY_MS)).take(4);
    for (const r of replays) await ctx.db.delete("integrationIdempotency", r._id);
    more ||= replays.length === 4;

    const grants = await ctx.db.query("formAccessGrants").withIndex("by_expiresAt", (q) => q.lt("expiresAt", now)).take(BATCH);
    for (const g of grants) await ctx.db.delete("formAccessGrants", g._id);
    more ||= grants.length === BATCH;

    const windows = await ctx.db.query("rateWindows").withIndex("by_windowStart", (q) => q.lt("windowStart", now - 3_600_000)).take(BATCH);
    for (const w of windows) await ctx.db.delete("rateWindows", w._id);
    more ||= windows.length === BATCH;

    if (more) await ctx.scheduler.runAfter(1000, internal.crons.cleanup, {});
    return null;
  },
});

const crons = cronJobs();
crons.interval("apply response retention", { hours: 6 }, internal.crons.applyRetention, { cursor: null });
crons.interval("clean up expired form data", { hours: 1 }, internal.crons.cleanup, {});
crons.interval("expire admin grants and suspensions", { minutes: 5 }, internal.admin.sweepExpiries, {});
crons.interval("refresh platform analytics", { hours: 1 }, internal.adminAnalytics.refreshScheduled, {});
crons.interval("prune webhook history", { hours: 1 }, internal.webhooks.pruneHistory, {});
crons.interval("end idle live games", { minutes: 15 }, internal.live.expireIdle, {});
export default crons;
