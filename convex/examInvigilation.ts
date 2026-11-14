import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { creatorRestricted, requireActiveUser } from "./authz";
import { hasApprovedCourseAccess } from "./courseMembership";
import { audienceAllows } from "./examAudience";
import { requireExamAttemptTiming } from "./examSubmissionModel";
import {
  accommodationKind, boundedReviewText, caseDisposition,
  extendedDeadline, interventionKind,
} from "./examInvigilationModel";

type ReadCtx = MutationCtx | QueryCtx;
const RETENTION_MS = 30 * 24 * 60 * 60_000;
const MAX_ATTEMPTS = 50;
const MAX_AUDIT_ROWS = 120;

async function teacherRelease(ctx: ReadCtx, draftId: Id<"examBuilderDrafts">) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
  const draft = await ctx.db.get("examBuilderDrafts", draftId);
  if (!draft || draft.ownerId !== identity.subject)
    throw new Error("NOT_FOUND: Exam not found.");
  const course = await ctx.db.get("learnCollections", draft.courseId);
  if (!course || course.ownerId !== identity.subject || course.archived ||
      course.communityState === "removed" ||
      await creatorRestricted(ctx, identity.subject))
    throw new Error("NOT_FOUND: Exam not found.");
  const release = await ctx.db.query("examReleases")
    .withIndex("by_draft", q => q.eq("draftId", draftId)).unique();
  if (release && (release.ownerId !== identity.subject || release.courseId !== course._id))
    throw new Error("NOT_FOUND: Exam not found.");
  return { actorId: identity.subject, release };
}

async function teacherAttempt(ctx: ReadCtx, attemptId: Id<"examAttempts">) {
  const attempt = await ctx.db.get("examAttempts", attemptId);
  if (!attempt) throw new Error("NOT_FOUND: Attempt not found.");
  const snapshot = await ctx.db.get("examSnapshots", attempt.snapshotId);
  if (!snapshot || snapshot.ownerId !== attempt.ownerId ||
      snapshot.courseId !== attempt.courseId)
    throw new Error("NOT_FOUND: Attempt not found.");
  const { actorId, release } = await teacherRelease(ctx, snapshot.draftId);
  if (!release || release.activeSnapshotId !== snapshot._id ||
      release.ownerId !== attempt.ownerId || release.courseId !== attempt.courseId)
    throw new Error("NOT_FOUND: Attempt not found.");
  return { actorId, attempt, release };
}

async function studentAttempt(ctx: ReadCtx, attemptId: Id<"examAttempts">) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
  const attempt = await ctx.db.get("examAttempts", attemptId);
  if (!attempt || attempt.studentId !== identity.subject)
    throw new Error("NOT_FOUND: Attempt not found.");
  return attempt;
}

async function appendAudit(
  ctx: MutationCtx, attempt: Doc<"examAttempts">, actorId: string,
  action: "case_opened" | "student_explanation" | "reviewed" | "time_extension" |
    "connectivity_acknowledged" | "candidate_contacted",
  detail: string,
) {
  const at = Date.now();
  const expiresAt = at + RETENTION_MS;
  const rowId = await ctx.db.insert("examInvigilationAudit", {
    attemptId: attempt._id, ownerId: attempt.ownerId, studentId: attempt.studentId,
    actorId, action, detail, at, expiresAt,
  });
  await ctx.scheduler.runAt(expiresAt, internal.examInvigilation.purgeAudit, {
    rowId, expiresAt,
  });
}

async function getEvent(ctx: ReadCtx, attemptId: Id<"examAttempts">, eventId: string) {
  const event = await ctx.db.query("examIntegrityEvents")
    .withIndex("by_attempt_event", q => q.eq("attemptId", attemptId).eq("eventId", eventId))
    .unique();
  if (!event || event.expiresAt <= Date.now())
    throw new Error("EVENT_EXPIRED: This browser event is no longer available.");
  return event;
}

async function getCase(ctx: ReadCtx, attemptId: Id<"examAttempts">, eventId: string) {
  return ctx.db.query("examIntegrityCases")
    .withIndex("by_attempt_event", q => q.eq("attemptId", attemptId).eq("eventId", eventId))
    .unique();
}

function publicCase(row: Doc<"examIntegrityCases">) {
  return {
    eventId: row.eventId, disposition: row.disposition, revision: row.revision,
    studentExplanation: row.studentExplanation ?? null, updatedAt: row.updatedAt,
  };
}

/** Owner-only live snapshot. Zero direct question/answer/marking-key access. */
export const listForDraft = query({
  args: { draftId: v.id("examBuilderDrafts") },
  handler: async (ctx, { draftId }) => {
    const { release } = await teacherRelease(ctx, draftId);
    if (!release) return { releaseId: null, attempts: [], hasMore: false };
    const attempts = await ctx.db.query("examAttempts")
      .withIndex("by_snapshot_student", q => q.eq("snapshotId", release.activeSnapshotId))
      .take(MAX_ATTEMPTS + 1);
    return {
      releaseId: release._id, hasMore: attempts.length > MAX_ATTEMPTS,
      attempts: attempts.slice(0, MAX_ATTEMPTS).map(a => ({
        attemptId: a._id, studentId: a.studentId, state: a.state,
        startedAt: a.startedAt, deadlineAt: a.deadlineAt ?? null,
        updatedAt: a.updatedAt,
      })),
    };
  },
});

/** Detailed teacher review, explicitly bounded and privacy minimized. */
export const report = query({
  args: { attemptId: v.id("examAttempts") },
  handler: async (ctx, { attemptId }) => {
    const { attempt } = await teacherAttempt(ctx, attemptId);
    const now = Date.now();
    const events = await ctx.db.query("examIntegrityEvents")
      .withIndex("by_attempt_time", q => q.eq("attemptId", attemptId))
      .order("desc").take(200);
    const cases = await ctx.db.query("examIntegrityCases")
      .withIndex("by_attempt_updated", q => q.eq("attemptId", attemptId))
      .order("desc").take(200);
    const audit = await ctx.db.query("examInvigilationAudit")
      .withIndex("by_attempt_at", q => q.eq("attemptId", attemptId))
      .order("desc").take(MAX_AUDIT_ROWS);
    return {
      studentId: attempt.studentId, state: attempt.state,
      attemptRevision: attempt.revision, deadlineAt: attempt.deadlineAt ?? null,
      integrityMode: attempt.integrityPolicy?.mode ?? "off",
      events: events.filter(e => e.expiresAt > now).map(e => ({
        eventId: e.eventId, kind: e.kind, observedAt: e.observedAt,
        decision: e.decision, gapMs: e.gapMs ?? null,
      })),
      cases: cases.filter(c => c.expiresAt > now).map(publicCase),
      audit: audit.filter(a => a.expiresAt > now).map(a => ({
        action: a.action, actorId: a.actorId, detail: a.detail, at: a.at,
      })),
    };
  },
});

/** Candidate sees what was recorded and how human review affected their own record. */
export const myReport = query({
  args: { attemptId: v.id("examAttempts") },
  handler: async (ctx, { attemptId }) => {
    await studentAttempt(ctx, attemptId);
    const now = Date.now();
    const cases = await ctx.db.query("examIntegrityCases")
      .withIndex("by_attempt_updated", q => q.eq("attemptId", attemptId))
      .order("desc").take(200);
    return cases.filter(c => c.expiresAt > now).map(publicCase);
  },
});

/** Student explanation is a contestable statement, not an admission of misconduct. */
export const explainEvent = mutation({
  args: {
    attemptId: v.id("examAttempts"), eventId: v.string(),
    expectedRevision: v.number(), explanation: v.string(),
  },
  handler: async (ctx, args) => {
    const attempt = await studentAttempt(ctx, args.attemptId);
    await getEvent(ctx, args.attemptId, args.eventId);
    const explanation = boundedReviewText(args.explanation);
    const prior = await getCase(ctx, args.attemptId, args.eventId);
    if (!Number.isSafeInteger(args.expectedRevision) ||
        args.expectedRevision !== (prior?.revision ?? 0))
      throw new Error("REVISION_CONFLICT: This review changed; reload.");
    const now = Date.now();
    const revision = args.expectedRevision + 1;
    if (prior) {
      await ctx.db.patch("examIntegrityCases", prior._id, {
        studentExplanation: explanation, disposition: "needs_review",
        revision, updatedAt: now,
      });
    } else {
      const expiresAt = now + RETENTION_MS;
      const rowId = await ctx.db.insert("examIntegrityCases", {
        attemptId: attempt._id, ownerId: attempt.ownerId,
        studentId: attempt.studentId, eventId: args.eventId,
        studentExplanation: explanation, disposition: "needs_review",
        revision, createdAt: now, updatedAt: now, expiresAt,
      });
      await ctx.scheduler.runAt(expiresAt, internal.examInvigilation.purgeCase,
        { rowId, expiresAt });
      await appendAudit(ctx, attempt, attempt.studentId, "case_opened", "Candidate requested review");
    }
    await appendAudit(ctx, attempt, attempt.studentId, "student_explanation",
      "Candidate explanation received");
    return { revision, disposition: "needs_review" as const };
  },
});

/** Only a human instructor can classify an event; no 'cheating confirmed' state. */
export const reviewEvent = mutation({
  args: {
    attemptId: v.id("examAttempts"), eventId: v.string(),
    expectedRevision: v.number(), disposition: caseDisposition, reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { actorId, attempt } = await teacherAttempt(ctx, args.attemptId);
    await getEvent(ctx, args.attemptId, args.eventId);
    const reason = boundedReviewText(args.reason);
    const prior = await getCase(ctx, args.attemptId, args.eventId);
    if (!Number.isSafeInteger(args.expectedRevision) ||
        args.expectedRevision !== (prior?.revision ?? 0))
      throw new Error("REVISION_CONFLICT: Reload this incident before deciding.");
    const now = Date.now();
    const revision = args.expectedRevision + 1;
    if (prior) {
      await ctx.db.patch("examIntegrityCases", prior._id, {
        disposition: args.disposition, revision, updatedAt: now,
      });
    } else {
      const expiresAt = now + RETENTION_MS;
      const rowId = await ctx.db.insert("examIntegrityCases", {
        attemptId: attempt._id, ownerId: attempt.ownerId, studentId: attempt.studentId,
        eventId: args.eventId, disposition: args.disposition,
        revision, createdAt: now, updatedAt: now, expiresAt,
      });
      await ctx.scheduler.runAt(expiresAt, internal.examInvigilation.purgeCase,
        { rowId, expiresAt });
    }
    await appendAudit(ctx, attempt, actorId, "reviewed",
      args.disposition + ": " + reason);
    return { revision, disposition: args.disposition };
  },
});

/** Accommodations are set before start and visible only to the learner and owner. */
export const setAccommodation = mutation({
  args: {
    draftId: v.id("examBuilderDrafts"), studentId: v.string(),
    kind: accommodationKind, additionalMinutes: v.number(),
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const { actorId, release } = await teacherRelease(ctx, args.draftId);
    if (!release || !release.assignmentActive || !release.audience)
      throw new Error("ASSIGNMENT_REQUIRED: Assign the examination first.");
    if (args.studentId === actorId ||
        !await hasApprovedCourseAccess(ctx, release.courseId, args.studentId) ||
        !await audienceAllows(ctx, release.courseId, release.audience, args.studentId))
      throw new Error("NOT_FOUND: Assigned candidate not found.");
    if (!Number.isSafeInteger(args.additionalMinutes) ||
        args.additionalMinutes < 0 || args.additionalMinutes > 120 ||
        (args.kind === "extra_time") !== (args.additionalMinutes > 0))
      throw new Error("INVALID_ACCOMMODATION: Select a valid kind and time allowance.");
    const attempts = await ctx.db.query("examAttempts")
      .withIndex("by_snapshot_student", q => q.eq("snapshotId", release.activeSnapshotId)
        .eq("studentId", args.studentId)).take(4);
    if (attempts.some(a => a.state === "in_progress"))
      throw new Error("EXAM_ACTIVE: Use an audited manual intervention for active attempts.");
    const prior = await ctx.db.query("examAccommodations")
      .withIndex("by_release_student", q =>
        q.eq("releaseId", release._id).eq("studentId", args.studentId)).unique();
    if (!Number.isSafeInteger(args.expectedRevision) ||
        args.expectedRevision !== (prior?.revision ?? 0))
      throw new Error("REVISION_CONFLICT: Accommodation changed; reload.");
    const revision = args.expectedRevision + 1;
    const data = {
      ownerId: actorId, kind: args.kind,
      additionalMinutes: args.additionalMinutes, revision, updatedAt: Date.now(),
    };
    if (prior) await ctx.db.patch("examAccommodations", prior._id, data);
    else await ctx.db.insert("examAccommodations", {
      ...data, releaseId: release._id, studentId: args.studentId,
    });
    const at = Date.now(), expiresAt = at + RETENTION_MS;
    const rowId = await ctx.db.insert("examAccommodationAudit", {
      releaseId: release._id, ownerId: actorId, studentId: args.studentId,
      actorId, kind: args.kind, additionalMinutes: args.additionalMinutes,
      revision, at, expiresAt,
    });
    await ctx.scheduler.runAt(expiresAt, internal.examInvigilation.purgeAccommodationAudit,
      { rowId, expiresAt });
    return { revision, appliedToActiveAttempt: false };
  },
});

/** Scoped teacher read for the accommodation editor; does not expose medical history. */
export const teacherAccommodation = query({
  args: { draftId: v.id("examBuilderDrafts"), studentId: v.string() },
  handler: async (ctx, { draftId, studentId }) => {
    const { release } = await teacherRelease(ctx, draftId);
    if (!release || !release.assignmentActive || !release.audience ||
        !await hasApprovedCourseAccess(ctx, release.courseId, studentId) ||
        !await audienceAllows(ctx, release.courseId, release.audience, studentId))
      throw new Error("NOT_FOUND: Assigned candidate not found.");
    const row = await ctx.db.query("examAccommodations")
      .withIndex("by_release_student", q =>
        q.eq("releaseId", release._id).eq("studentId", studentId)).unique();
    return row ? {
      kind: row.kind, additionalMinutes: row.additionalMinutes,
      revision: row.revision, updatedAt: row.updatedAt,
    } : null;
  },
});

export const myAccommodation = query({
  args: { releaseId: v.id("examReleases") },
  handler: async (ctx, { releaseId }) => {
    const { identity, user } = await requireActiveUser(ctx);
    if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
    const release = await ctx.db.get("examReleases", releaseId);
    if (!release || !release.assignmentActive || !release.audience ||
        !await hasApprovedCourseAccess(ctx, release.courseId, identity.subject) ||
        !await audienceAllows(ctx, release.courseId, release.audience, identity.subject))
      throw new Error("NOT_FOUND: Assigned examination not found.");
    const row = await ctx.db.query("examAccommodations")
      .withIndex("by_release_student", q =>
        q.eq("releaseId", releaseId).eq("studentId", identity.subject)).unique();
    return row ? {
      kind: row.kind, additionalMinutes: row.additionalMinutes,
      updatedAt: row.updatedAt,
    } : null;
  },
});

/** Instructor time extension requires active, authorized exam and a written reason. */
export const extendTime = mutation({
  args: {
    attemptId: v.id("examAttempts"), expectedRevision: v.number(),
    minutes: v.number(), reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { actorId, attempt, release } = await teacherAttempt(ctx, args.attemptId);
    if (!release.studentEntryEnabled || attempt.state !== "in_progress")
      throw new Error("EXAM_NOT_ACTIVE: No live attempt may be extended.");
    if (!Number.isSafeInteger(args.expectedRevision) ||
        attempt.revision !== args.expectedRevision)
      throw new Error("REVISION_CONFLICT: Attempt changed; reload.");
    const reason = boundedReviewText(args.reason);
    requireExamAttemptTiming(attempt);
    const deadlineAt = extendedDeadline(attempt, Date.now(), args.minutes,
      release.settings?.mode === "scheduled" ? release.settings.closesAt : undefined);
    const revision = attempt.revision + 1;
    await ctx.db.patch("examAttempts", attempt._id, {
      deadlineAt, revision, submitConfirmation: undefined, updatedAt: Date.now(),
    });
    await ctx.scheduler.runAt(deadlineAt, internal.examSubmissions.finalizeAtDeadline,
      { attemptId: attempt._id, deadlineAt });
    await appendAudit(ctx, attempt, actorId, "time_extension",
      args.minutes + " minutes: " + reason);
    return { deadlineAt, revision };
  },
});

/** Non-punitive manual interventions are append-only; cannot change an exam result. */
export const noteIntervention = mutation({
  args: { attemptId: v.id("examAttempts"), kind: interventionKind, reason: v.string() },
  handler: async (ctx, args) => {
    const { actorId, attempt } = await teacherAttempt(ctx, args.attemptId);
    if (attempt.state !== "in_progress")
      throw new Error("ATTEMPT_FINALIZED: Intervention requires a live attempt.");
    const reason = boundedReviewText(args.reason);
    const prior = await ctx.db.query("examInvigilationAudit")
      .withIndex("by_attempt_at", q => q.eq("attemptId", args.attemptId))
      .order("desc").take(MAX_AUDIT_ROWS);
    if (prior.length >= MAX_AUDIT_ROWS)
      throw new Error("AUDIT_LIMIT: Maximum interventions reached.");
    await appendAudit(ctx, attempt, actorId, args.kind, reason);
    return { recordedAt: Date.now() };
  },
});

/** Server cleanup is idempotent; queries also enforce expiry immediately. */
export const purgeCase = internalMutation({
  args: { rowId: v.id("examIntegrityCases"), expiresAt: v.number() },
  handler: async (ctx, { rowId, expiresAt }) => {
    const row = await ctx.db.get("examIntegrityCases", rowId);
    if (!row || row.expiresAt !== expiresAt || Date.now() < expiresAt) return false;
    await ctx.db.delete("examIntegrityCases", rowId);
    return true;
  },
});
export const purgeAudit = internalMutation({
  args: { rowId: v.id("examInvigilationAudit"), expiresAt: v.number() },
  handler: async (ctx, { rowId, expiresAt }) => {
    const row = await ctx.db.get("examInvigilationAudit", rowId);
    if (!row || row.expiresAt !== expiresAt || Date.now() < expiresAt) return false;
    await ctx.db.delete("examInvigilationAudit", rowId);
    return true;
  },
});

export const purgeAccommodationAudit = internalMutation({
  args: { rowId: v.id("examAccommodationAudit"), expiresAt: v.number() },
  handler: async (ctx, { rowId, expiresAt }) => {
    const row = await ctx.db.get("examAccommodationAudit", rowId);
    if (!row || row.expiresAt !== expiresAt || Date.now() < expiresAt) return false;
    await ctx.db.delete("examAccommodationAudit", rowId);
    return true;
  },
});
