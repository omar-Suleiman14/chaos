import { v } from "convex/values";
import { internal } from "./_generated/api";
import { notifyCourseAccount } from "./courseNotifications";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser, creatorRestricted } from "./authz";
import { resultStatus } from "./examResultModel";
import { hasApprovedCourseAccess } from "./courseMembership";

type ReadCtx = MutationCtx | QueryCtx;
const MAX_HISTORY = 100;
const MAX_TEACHER_ATTEMPTS = 100;

async function actor(ctx: ReadCtx) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
  return identity.subject;
}

async function ownedSnapshot(ctx: ReadCtx, snapshotId: Id<"examSnapshots">, trustedActorId?: string) {
  const ownerId = trustedActorId ?? await actor(ctx);
  const snapshot = await ctx.db.get("examSnapshots", snapshotId);
  if (!snapshot || snapshot.ownerId !== ownerId)
    throw new Error("NOT_FOUND: Exam not found.");
  const [draft, course, release] = await Promise.all([
    ctx.db.get("examBuilderDrafts", snapshot.draftId),
    ctx.db.get("learnCollections", snapshot.courseId),
    ctx.db.query("examReleases")
      .withIndex("by_draft", q => q.eq("draftId", snapshot.draftId)).unique(),
  ]);
  if (!draft || !course || !release || draft.ownerId !== ownerId ||
      draft.courseId !== course._id || course.ownerId !== ownerId ||
      release.ownerId !== ownerId || release.courseId !== course._id ||
      course.communityState === "removed" ||
      await creatorRestricted(ctx, ownerId))
    throw new Error("NOT_FOUND: Exam not found.");
  return { ownerId, snapshot, course, release };
}

async function publication(ctx: ReadCtx, snapshotId: Id<"examSnapshots">) {
  return ctx.db.query("examResultPublications")
    .withIndex("by_snapshot", q => q.eq("snapshotId", snapshotId)).unique();
}

async function myProjection(ctx: QueryCtx, attempt: Doc<"examAttempts">, now: number) {
  const snapshot = await ctx.db.get("examSnapshots", attempt.snapshotId);
  const course = await ctx.db.get("learnCollections", attempt.courseId);
  if (!snapshot || !course || snapshot.ownerId !== attempt.ownerId ||
      snapshot.courseId !== attempt.courseId || course.ownerId !== attempt.ownerId)
    return null;
  const grade = attempt.state === "submitted"
    ? await ctx.db.query("examGrades").withIndex("by_attempt",
      q => q.eq("attemptId", attempt._id)).unique() : null;
  if (grade && (grade.snapshotId !== attempt.snapshotId ||
      grade.ownerId !== attempt.ownerId || grade.studentId !== attempt.studentId))
    throw new Error("INTEGRITY_ERROR: Grade ownership mismatch.");
  const published = grade ? await publication(ctx, attempt.snapshotId) : null;
  if (published && (published.ownerId !== attempt.ownerId ||
      published.courseId !== attempt.courseId))
    throw new Error("INTEGRITY_ERROR: Result publication ownership mismatch.");
  const status = attempt.state === "submitted"
    ? resultStatus(grade, grade?.resultPolicy, (published?.released === true && (!grade?.finalizedAt ||
      (published.releasedAt ?? -1) >= grade.finalizedAt ||
      (grade.regradeReleasedAt ?? -1) >= grade.finalizedAt)), now)
    : attempt.state;
  const transcript = status === "released" && grade?.finalPercentBasisPoints !== undefined
    ? {
        earnedCents: grade.earnedCents, maximumCents: grade.maximumCents,
        percentBasisPoints: grade.finalPercentBasisPoints,
        passed: grade.finalPercentBasisPoints >=
          Math.round((grade.resultPolicy?.passingPercent ?? 50) * 100),
      } : null;
  // Never project grade entries, question content, correct selections,
  // candidate responses, rubrics or explanations to student queries.
  return {
    attemptId: attempt._id, courseId: attempt.courseId,
    courseTitle: course.metadata.title, examTitle: snapshot.title,
    snapshotVersion: snapshot.version,
    startedAt: attempt.startedAt, completedAt: attempt.closedAt ?? null,
    status, transcript,
  };
}

/** Candidate-owned history, including after removal from the course roster. */
export const myResults = query({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const studentId = await actor(ctx);
    const attempts = await ctx.db.query("examAttempts")
      .withIndex("by_student_updated", q => q.eq("studentId", studentId))
      .order("desc").paginate({ cursor: cursor ?? null, numItems: MAX_HISTORY });
    const completed = attempts.page.filter(a => a.state !== "in_progress");
    const entries = await Promise.all(completed.map(a => myProjection(ctx, a, Date.now())));
    return { entries: entries.filter(e => e !== null), hasMore: !attempts.isDone,
      nextCursor: attempts.isDone ? null : attempts.continueCursor };
  },
});

/** An attempt ID is not an access token; enforce signed-in student ownership. */
export const myResult = query({
  args: { attemptId: v.id("examAttempts") },
  handler: async (ctx, { attemptId }) => {
    const studentId = await actor(ctx);
    const attempt = await ctx.db.get("examAttempts", attemptId);
    if (!attempt || attempt.studentId !== studentId || attempt.state === "in_progress")
      throw new Error("NOT_FOUND: Result not found.");
    const result = await myProjection(ctx, attempt, Date.now());
    if (!result) throw new Error("NOT_FOUND: Result not found.");
    return result;
  },
});

/** Optional review is candidate-owned, only after the frozen policy releases the result. */
export const myReview = query({
  args: { attemptId: v.id("examAttempts") },
  handler: async (ctx, { attemptId }) => {
    const studentId = await actor(ctx);
    const attempt = await ctx.db.get("examAttempts", attemptId);
    if (!attempt || attempt.studentId !== studentId || attempt.state !== "submitted")
      throw new Error("NOT_FOUND: Result not found.");
    const projection = await myProjection(ctx, attempt, Date.now());
    if (!projection || projection.status !== "released" ||
        !await hasApprovedCourseAccess(ctx, attempt.courseId, studentId)) return null;
    const [snapshot, grade, course] = await Promise.all([
      ctx.db.get("examSnapshots", attempt.snapshotId),
      ctx.db.query("examGrades").withIndex("by_attempt", q => q.eq("attemptId", attemptId)).unique(),
      ctx.db.get("learnCollections", attempt.courseId),
    ]);
    if (!snapshot || !grade || !course || course.archived || course.communityState === "hidden" ||
        course.communityState === "removed" || await creatorRestricted(ctx, attempt.ownerId) || grade.snapshotId !== snapshot._id ||
        grade.studentId !== studentId || grade.ownerId !== attempt.ownerId) return null;
    const showAnswers = grade.resultPolicy?.showCorrectAnswers === true;
    const showExplanations = grade.resultPolicy?.showExplanations === true;
    if (!showAnswers && !showExplanations) return null;
    return snapshot.questions.map((q, index) => ({
      index, prompt: q.prompt, kind: q.kind, choices: q.choices,
      ...(showAnswers ? { correctChoiceIds: q.correctChoiceIds, sampleAnswer: q.sampleAnswer ?? null } : {}),
      ...(showExplanations ? { explanation: q.explanation ?? null } : {}),
    }));
  },
});

/** Doctor-only result overview, never an answer key or an unscoped course roster. */
export const teacherResults = query({
  args: { draftId: v.id("examBuilderDrafts"), snapshotId: v.optional(v.id("examSnapshots")),
    cursor: v.optional(v.union(v.string(), v.null())) },
  handler: (ctx, args) => forMcpTeacherResults(ctx, args),
});

export async function forMcpTeacherResults(ctx: QueryCtx, args: { draftId: Id<"examBuilderDrafts">; snapshotId?: Id<"examSnapshots">; cursor?: string | null }, trustedActorId?: string) {
  const { draftId, snapshotId, cursor } = args;
    const ownerId = trustedActorId ?? await actor(ctx);
    const draft = await ctx.db.get("examBuilderDrafts", draftId);
    if (!draft || draft.ownerId !== ownerId)
      throw new Error("NOT_FOUND: Exam not found.");
    const release = await ctx.db.query("examReleases")
      .withIndex("by_draft", q => q.eq("draftId", draftId)).unique();
    if (!release || release.ownerId !== ownerId || release.courseId !== draft.courseId)
      throw new Error("NOT_FOUND: Exam not found.");
    const { snapshot } = await ownedSnapshot(ctx, snapshotId ?? release.activeSnapshotId, trustedActorId);
    if (snapshot.draftId !== draftId) throw new Error("NOT_FOUND: Exam not found.");
    const pub = await publication(ctx, snapshot._id);
    if (pub && (pub.ownerId !== ownerId || pub.courseId !== draft.courseId))
      throw new Error("INTEGRITY_ERROR: Publication ownership mismatch.");
    const attempts = await ctx.db.query("examAttempts")
      .withIndex("by_snapshot_student", q => q.eq("snapshotId", snapshot._id))
      .paginate({ cursor: cursor ?? null, numItems: MAX_TEACHER_ATTEMPTS });
    const entries = await Promise.all(attempts.page.map(async a => {
      if (a.ownerId !== ownerId || a.courseId !== draft.courseId)
        throw new Error("INTEGRITY_ERROR: Attempt ownership mismatch.");
      const grade = a.state === "submitted"
        ? await ctx.db.query("examGrades").withIndex("by_attempt",
          q => q.eq("attemptId", a._id)).unique() : null;
      if (grade && (grade.studentId !== a.studentId || grade.snapshotId !== snapshot._id ||
          grade.ownerId !== ownerId)) throw new Error("INTEGRITY_ERROR: Grade ownership mismatch.");
      return {
        attemptId: a._id, studentId: a.studentId,
        state: a.state, completedAt: a.closedAt ?? null,
        gradingState: grade?.state ?? null,
        resultVisibility: grade?.resultPolicy?.visibility ?? "manual",
        earnedCents: grade?.earnedCents ?? null,
        maximumCents: grade?.maximumCents ?? null,
        percentBasisPoints: grade?.finalPercentBasisPoints ?? null,
        studentStatus: a.state === "submitted"
          ? resultStatus(grade, grade?.resultPolicy, (pub?.released === true && (!grade?.finalizedAt ||
            (pub.releasedAt ?? -1) >= grade.finalizedAt ||
            (grade.regradeReleasedAt ?? -1) >= grade.finalizedAt)), Date.now())
          : a.state,
      };
    }));
    const [manualGrade, legacyGrade] = await Promise.all([
      ctx.db.query("examGrades").withIndex("by_snapshot_visibility",
        q => q.eq("snapshotId", snapshot._id).eq("resultPolicy.visibility", "manual")).first(),
      ctx.db.query("examGrades").withIndex("by_snapshot_visibility",
        q => q.eq("snapshotId", snapshot._id).eq("resultPolicy.visibility", undefined)).first(),
    ]);
    return {
      snapshotId: snapshot._id, title: snapshot.title,
      visibility: manualGrade || legacyGrade ? "manual" as const :
        (snapshot._id === release.activeSnapshotId ? release.settings?.resultVisibility ?? "manual" : "manual"),
      publication: { released: pub?.released ?? false, revision: pub?.revision ?? 0,
        releasedAt: pub?.releasedAt ?? null },
      entries, hasMore: !attempts.isDone, nextCursor: attempts.isDone ? null : attempts.continueCursor,
    };
}


/** Doctor-controlled manual publication, optimistic revision + durable audit. */
export const setPublication = mutation({
  args: {
    snapshotId: v.id("examSnapshots"), expectedRevision: v.number(),
    released: v.boolean(),
  },
  handler: async (ctx, { snapshotId, expectedRevision, released }) => {
    const { ownerId, course, release } = await ownedSnapshot(ctx, snapshotId);
    if (release.activeSnapshotId !== snapshotId || release.settings?.resultVisibility !== "manual") {
      const manual = await ctx.db.query("examGrades").withIndex("by_snapshot_visibility",
        q => q.eq("snapshotId", snapshotId).eq("resultPolicy.visibility", "manual")).first();
      const legacy = await ctx.db.query("examGrades").withIndex("by_snapshot_visibility",
        q => q.eq("snapshotId", snapshotId).eq("resultPolicy.visibility", undefined)).first();
      if (!manual && !legacy) throw new Error("POLICY_CONFLICT: No manually released grades for this snapshot.");
    }
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new Error("REVISION_CONFLICT: Invalid publication revision.");
    const existing = await publication(ctx, snapshotId);
    if (existing && (existing.ownerId !== ownerId || existing.courseId !== course._id))
      throw new Error("INTEGRITY_ERROR: Publication ownership mismatch.");
    const revision = existing?.revision ?? 0;
    if (revision !== expectedRevision)
      throw new Error("REVISION_CONFLICT: Result release changed; reload before publishing.");
    if (existing?.released === released) return { revision, released };
    const now = Date.now();
    if (existing) await ctx.db.patch("examResultPublications", existing._id, {
      released, revision: revision + 1, updatedAt: now,
      releasedAt: released ? now : undefined,
    });
    else await ctx.db.insert("examResultPublications", {
      snapshotId, courseId: course._id, ownerId,
      released, revision: 1, updatedAt: now,
      releasedAt: released ? now : undefined,
    });
    await ctx.db.insert("examResultPublicationAudit", {
      snapshotId, courseId: course._id, ownerId,
      actorId: ownerId, action: released ? "publish" : "withhold",
      revision: revision + 1, at: now,
    });
    if (released) {
      await ctx.scheduler.runAfter(0, internal.examResults.notifyPublicationBatch, {
        snapshotId, revision: revision + 1, cursor: null,
      });
    }
    return { revision: revision + 1, released };
  },
});


/** Deliver notifications in bounded transactions; publication is independent of class size. */
export const notifyPublicationBatch = internalMutation({
  args: { snapshotId: v.id("examSnapshots"), revision: v.number(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { snapshotId, revision, cursor }) => {
    const pub = await publication(ctx, snapshotId);
    if (!pub || !pub.released || pub.revision !== revision) return;
    const page = await ctx.db.query("examAttempts")
      .withIndex("by_snapshot_student", q => q.eq("snapshotId", snapshotId))
      .paginate({ cursor, numItems: 50 });
    for (const attempt of page.page) {
      if (attempt.state !== "submitted" || attempt.ownerId !== pub.ownerId ||
          attempt.courseId !== pub.courseId) continue;
      const grade = await ctx.db.query("examGrades")
        .withIndex("by_attempt", q => q.eq("attemptId", attempt._id)).unique();
      if (!grade || grade.ownerId !== pub.ownerId || grade.snapshotId !== snapshotId ||
          grade.studentId !== attempt.studentId || grade.reviewHold === true ||
          grade.finalPercentBasisPoints === undefined ||
          (grade.resultPolicy?.visibility ?? "manual") !== "manual" ||
          resultStatus(grade, grade.resultPolicy, (pub.releasedAt ?? -1) >= (grade.finalizedAt ?? 0) ||
            (grade.regradeReleasedAt ?? -1) >= (grade.finalizedAt ?? 0), Date.now()) !== "released") continue;
      await notifyCourseAccount(ctx, {
        recipientId: attempt.studentId, courseId: pub.courseId, kind: "course_result",
        key: "result_release:" + snapshotId + ":" + revision + ":" + attempt.studentId,
        message: "Your exam result has been released. Check My Results.",
      });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.examResults.notifyPublicationBatch,
      { snapshotId, revision, cursor: page.continueCursor });
  },
});
