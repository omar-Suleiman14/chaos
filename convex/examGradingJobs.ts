import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser, creatorRestricted, requireIdentity } from "./authz";
import { requireAdminForActor } from "./adminAccess";

type Ctx = QueryCtx | MutationCtx;
export const JOB_LEASE_MS = 15 * 60_000;
const MAX_RETRIES = 3;

async function teacher(ctx: Ctx) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user || await creatorRestricted(ctx, identity.subject))
    throw new Error("NOT_FOUND: Exam not found.");
  return identity.subject;
}

async function admin(ctx: Ctx, actorId?: string) {
  await requireAdminForActor(ctx, actorId);
  return actorId ?? (await requireIdentity(ctx)).subject;
}

/** Compare every bound record, not merely the caller-provided attempt identifier. */
async function attemptForOwner(ctx: Ctx, attemptId: Id<"examAttempts">, ownerId: string) {
  const attempt = await ctx.db.get("examAttempts", attemptId);
  if (!attempt || attempt.ownerId !== ownerId || attempt.state !== "submitted")
    throw new Error("NOT_FOUND: Submitted attempt not found.");
  const [snapshot, course, grade] = await Promise.all([
    ctx.db.get("examSnapshots", attempt.snapshotId),
    ctx.db.get("learnCollections", attempt.courseId),
    ctx.db.query("examGrades").withIndex("by_attempt", q => q.eq("attemptId", attemptId)).unique(),
  ]);
  if (!snapshot || !course || !grade ||
      snapshot.ownerId !== ownerId || snapshot.courseId !== course._id ||
      course.ownerId !== ownerId || course.communityState === "removed" ||
      grade.ownerId !== ownerId || grade.studentId !== attempt.studentId ||
      grade.snapshotId !== snapshot._id || grade.attemptId !== attemptId)
    throw new Error("NOT_FOUND: Submitted attempt not found.");
  const release = await ctx.db.query("examReleases")
    .withIndex("by_draft", q => q.eq("draftId", snapshot.draftId)).unique();
  if (!release || release.ownerId !== ownerId || release.courseId !== course._id ||
      release.activeSnapshotId !== snapshot._id)
    throw new Error("NOT_FOUND: Submitted attempt not found.");
  return { attempt, snapshot, grade, course, release };
}

export async function validJob(ctx: Ctx, jobId: Id<"examGradingJobs">) {
  const job = await ctx.db.get("examGradingJobs", jobId);
  if (!job) throw new Error("NOT_FOUND: Grading job not found.");
  const related = await attemptForOwner(ctx, job.attemptId, job.ownerId);
  if (job.snapshotId !== related.snapshot._id || job.courseId !== related.course._id ||
      job.studentId !== related.attempt.studentId || related.grade.state !== "needs_manual")
    throw new Error("GRADING_CONFLICT: Job no longer matches a pending essay.");
  return { job, ...related };
}

export async function auditJob(ctx: MutationCtx, job: Doc<"examGradingJobs">,
  actorId: string, action: "requested" | "claimed" | "requeued" | "bundle_read" | "proposal_saved" | "sent_to_doctor",
  detail: string) {
  await ctx.db.insert("examGradingJobAudit", {
    jobId: job._id, attemptId: job.attemptId, actorId, action,
    revision: job.revision, at: Date.now(), detail,
  });
}

/** Explicit doctor opt-in; no grading happens on insertion. */
export const request = mutation({
  args: { attemptId: v.id("examAttempts"), requestKey: v.string(), confirmAdminAccess: v.boolean() },
  handler: async (ctx, { attemptId, requestKey, confirmAdminAccess }) => {
    const ownerId = await teacher(ctx);
    const { attempt, snapshot, grade } = await attemptForOwner(ctx, attemptId, ownerId);
    if (!confirmAdminAccess || !/^[A-Za-z0-9_-]{8,96}$/.test(requestKey))
      throw new Error("INVALID_REQUEST: Explicit permission and a request key are required.");
    if (grade.state !== "needs_manual" || grade.pendingWrittenCount < 1)
      throw new Error("GRADING_CONFLICT: No pending essay to request.");
    const existing = await ctx.db.query("examGradingJobs")
      .withIndex("by_attempt", q => q.eq("attemptId", attemptId)).unique();
    if (existing) {
      if (existing.requestKey !== requestKey || existing.ownerId !== ownerId ||
          existing.snapshotId !== snapshot._id)
        throw new Error("GRADING_CONFLICT: An assisted grading request already exists.");
      return { jobId: existing._id, status: existing.status, revision: existing.revision, reused: true };
    }
    const now = Date.now();
    const jobId = await ctx.db.insert("examGradingJobs", {
      attemptId, snapshotId: snapshot._id, courseId: attempt.courseId,
      studentId: attempt.studentId, ownerId, requestKey,
      status: "queued", revision: 0, retryCount: 0, requestedAt: now, updatedAt: now,
    });
    const row = await ctx.db.get("examGradingJobs", jobId);
    if (!row) throw new Error("INTEGRITY_ERROR: Job creation failed.");
    await auditJob(ctx, row, ownerId, "requested", "Doctor opted in to limited administrator-assisted grading.");
    return { jobId, status: "queued" as const, revision: 0, reused: false };
  },
});

/** Teacher may only see their own jobs and metadata. No answers or proposals here. */
export const myJobs = query({
  args: { draftId: v.id("examBuilderDrafts") },
  handler: async (ctx, { draftId }) => {
    const ownerId = await teacher(ctx);
    const draft = await ctx.db.get("examBuilderDrafts", draftId);
    if (!draft || draft.ownerId !== ownerId) throw new Error("NOT_FOUND: Exam not found.");
    const course = await ctx.db.get("learnCollections", draft.courseId);
    const release = await ctx.db.query("examReleases")
      .withIndex("by_draft", q => q.eq("draftId", draftId)).unique();
    if (!course || course.ownerId !== ownerId || course.communityState === "removed" ||
        !release || release.ownerId !== ownerId || release.courseId !== course._id)
      throw new Error("NOT_FOUND: Exam not found.");
    const rows = await ctx.db.query("examGradingJobs")
      .withIndex("by_owner_course", q => q.eq("ownerId", ownerId).eq("courseId", course._id)).take(101);
    return { jobs: rows.filter(row => row.snapshotId === release.activeSnapshotId).slice(0, 100)
      .map(row => ({ jobId: row._id, attemptId: row.attemptId, status: row.status,
        revision: row.revision, retryCount: row.retryCount })),
      hasMore: rows.length > 100 };
  },
});

export async function queueForAdmin(ctx: QueryCtx, status?: Doc<"examGradingJobs">["status"],
  actorId?: string) {
  await admin(ctx, actorId);
  const rows = status
    ? await ctx.db.query("examGradingJobs").withIndex("by_status_updated",
      q => q.eq("status", status)).take(51)
    : await ctx.db.query("examGradingJobs").take(51);
  return { jobs: rows.slice(0, 50).map(row => ({
    jobId: row._id, attemptId: row.attemptId, ownerId: row.ownerId,
    courseId: row.courseId, status: row.status, retryCount: row.retryCount,
    revision: row.revision, updatedAt: row.updatedAt,
    claimExpiresAt: row.claimExpiresAt ?? null,
  })), hasMore: rows.length > 50 };
}

export const adminQueue = query({
  args: { status: v.optional(v.union(v.literal("queued"), v.literal("claimed"), v.literal("doctor_review"))) },
  handler: (ctx, { status }) => queueForAdmin(ctx, status),
});

export async function claimForAdmin(ctx: MutationCtx,
  args: { jobId: Id<"examGradingJobs">; expectedRevision: number }, actorId?: string) {
  const adminId = await admin(ctx, actorId);
  const { job } = await validJob(ctx, args.jobId);
  if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision !== job.revision)
    throw new Error("REVISION_CONFLICT: Reload grading queue.");
  if (job.status !== "queued")
    throw new Error("GRADING_CONFLICT: Job is not available; expired claims must be retried.");
  const now = Date.now();
  await ctx.db.patch("examGradingJobs", job._id, {
    status: "claimed", claimAdminId: adminId, claimedAt: now,
    claimExpiresAt: now + JOB_LEASE_MS, revision: job.revision + 1, updatedAt: now,
  });
  await auditJob(ctx, { ...job, revision: job.revision + 1 }, adminId, "claimed", "Admin claimed the job.");
  return { jobId: job._id, revision: job.revision + 1, claimExpiresAt: now + JOB_LEASE_MS };
}

export const adminClaim = mutation({
  args: { jobId: v.id("examGradingJobs"), expectedRevision: v.number() },
  handler: (ctx, args) => claimForAdmin(ctx, args),
});

/** Leases must expire before retries; a retry never duplicates a job. */
export async function retryForAdmin(ctx: MutationCtx,
  args: { jobId: Id<"examGradingJobs">; expectedRevision: number }, actorId?: string) {
  const adminId = await admin(ctx, actorId);
  const { job } = await validJob(ctx, args.jobId);
  if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision !== job.revision)
    throw new Error("REVISION_CONFLICT: Reload grading queue.");
  if (job.status !== "claimed" || !job.claimExpiresAt ||
      job.claimExpiresAt > Date.now() || job.retryCount >= MAX_RETRIES)
    throw new Error("GRADING_CONFLICT: Claim cannot be retried.");
  const now = Date.now();
  await ctx.db.patch("examGradingJobs", job._id, {
    status: "queued", claimAdminId: undefined, claimedAt: undefined,
    claimExpiresAt: undefined, retryCount: job.retryCount + 1,
    revision: job.revision + 1, updatedAt: now,
  });
  await auditJob(ctx, { ...job, revision: job.revision + 1 }, adminId, "requeued", "Expired claim requeued.");
  return { jobId: job._id, revision: job.revision + 1, retryCount: job.retryCount + 1 };
}

export const adminRetry = mutation({
  args: { jobId: v.id("examGradingJobs"), expectedRevision: v.number() },
  handler: (ctx, args) => retryForAdmin(ctx, args),
});
