import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser, creatorRestricted } from "./authz";
import { hasApprovedCourseAccess } from "./courseMembership";
import { audienceAllows } from "./examAudience";
import { resultStatus } from "./examResultModel";
import { assignmentKind, assignmentState, validateAssignment } from "./courseAssignmentsModel";
import { notifyCourseStudents } from "./courseNotifications";

type Ctx = QueryCtx | MutationCtx;
const LIMIT_ASSIGNMENTS = 80, LIMIT_STUDENTS = 80, LIMIT_ATTEMPTS = 20;

async function actor(ctx: Ctx) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
  return identity.subject;
}
async function ownedCourse(ctx: Ctx, courseId: Id<"learnCollections">) {
  const ownerId = await actor(ctx);
  const course = await ctx.db.get("learnCollections", courseId);
  if (!course || course.ownerId !== ownerId || course.archived ||
      course.communityState === "removed" || course.communityState === "hidden" ||
      await creatorRestricted(ctx, ownerId))
    throw new Error("NOT_FOUND: Course not found.");
  return { course, ownerId };
}
async function ownedAssignment(ctx: Ctx, assignmentId: Id<"courseAssignments">) {
  const row = await ctx.db.get("courseAssignments", assignmentId);
  if (!row) throw new Error("NOT_FOUND: Assignment not found.");
  const { course, ownerId } = await ownedCourse(ctx, row.courseId);
  if (row.ownerId !== ownerId) throw new Error("NOT_FOUND: Assignment not found.");
  return { row, course, ownerId };
}
async function ensureResource(ctx: Ctx, course: Doc<"learnCollections">,
  kind: "lesson" | "exam", lessonId?: Id<"lessons">, snapshotId?: Id<"examSnapshots">) {
  if (!course.publishedVersionId) throw new Error("COURSE_UNPUBLISHED: Publish the course first.");
  const version = await ctx.db.get("collectionVersions", course.publishedVersionId);
  if (!version || version.collectionId !== course._id)
    throw new Error("COURSE_UNPUBLISHED: Missing published version.");
  if (kind === "lesson") {
    if (!lessonId || snapshotId || !version.items.some(i => i.kind === "lesson" && i.id === lessonId))
      throw new Error("RESOURCE_MISMATCH: Select a published course lesson.");
    const lesson = await ctx.db.get("lessons", lessonId);
    if (!lesson || lesson.ownerId !== course.ownerId || !lesson.publishedVersionId)
      throw new Error("RESOURCE_MISMATCH: Lesson is not published.");
    return;
  }
  if (!snapshotId || lessonId) throw new Error("RESOURCE_MISMATCH: Select a sealed exam.");
  const snapshot = await ctx.db.get("examSnapshots", snapshotId);
  if (!snapshot || snapshot.ownerId !== course.ownerId || snapshot.courseId !== course._id)
    throw new Error("RESOURCE_MISMATCH: Exam belongs to another course.");
  const release = await ctx.db.query("examReleases")
    .withIndex("by_draft", q => q.eq("draftId", snapshot.draftId)).unique();
  if (!release || release.ownerId !== course.ownerId || release.courseId !== course._id ||
      release.activeSnapshotId !== snapshotId || !release.assignmentActive ||
      !release.preparedForAudience || !release.audience)
    throw new Error("EXAM_NOT_ASSIGNED: Configure and assign this exam first.");
}
async function audit(ctx: MutationCtx, row: Doc<"courseAssignments">, action: string) {
  await ctx.db.insert("courseAssignmentAudit", {
    assignmentId: row._id, courseId: row.courseId, ownerId: row.ownerId,
    actorId: row.ownerId, action, revision: row.revision, at: Date.now(),
  });
}
async function loadAssignments(ctx: Ctx, courseId: Id<"learnCollections">) {
  const rows = await ctx.db.query("courseAssignments")
    .withIndex("by_course", q => q.eq("courseId", courseId)).take(LIMIT_ASSIGNMENTS + 1);
  if (rows.length > LIMIT_ASSIGNMENTS)
    throw new Error("LIMIT_REACHED: Course assignments require pagination.");
  return rows.sort((a, b) => a.dueAt - b.dueAt || a.createdAt - b.createdAt);
}

/** Only eligible course resources are offered in the teacher picker. No answer keys. */
export const resources = query({
  args: { courseId: v.id("learnCollections") },
  handler: async (ctx, { courseId }) => {
    const { course } = await ownedCourse(ctx, courseId);
    if (!course.publishedVersionId) return { lessons: [], exams: [] };
    const version = await ctx.db.get("collectionVersions", course.publishedVersionId);
    const lessons = [];
    for (const item of version?.items ?? []) {
      if (item.kind !== "lesson") continue;
      const lesson = await ctx.db.get("lessons", item.id);
      if (lesson?.ownerId === course.ownerId && lesson.publishedVersionId)
        lessons.push({ id: lesson._id, title: lesson.metadata.title });
    }
    const releases = await ctx.db.query("examReleases")
      .withIndex("by_course", q => q.eq("courseId", courseId)).take(81);
    if (releases.length > 80) throw new Error("LIMIT_REACHED: Too many exams.");
    const exams = [];
    for (const release of releases) {
      if (release.ownerId !== course.ownerId || !release.assignmentActive ||
          !release.preparedForAudience || !release.audience) continue;
      const snap = await ctx.db.get("examSnapshots", release.activeSnapshotId);
      if (snap?.courseId === courseId && snap.ownerId === course.ownerId)
        exams.push({ id: snap._id, title: snap.title });
    }
    return { lessons, exams };
  },
});
export const create = mutation({
  args: {
    courseId: v.id("learnCollections"), kind: assignmentKind,
    lessonId: v.optional(v.id("lessons")), snapshotId: v.optional(v.id("examSnapshots")),
    title: v.string(), instructions: v.string(), outcome: v.string(),
    opensAt: v.number(), dueAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { course, ownerId } = await ownedCourse(ctx, args.courseId);
    const fields = validateAssignment(args);
    await ensureResource(ctx, course, args.kind, args.lessonId, args.snapshotId);
    // Limit owner writes, so both the editor and student views remain bounded.
    if ((await loadAssignments(ctx, course._id)).length >= LIMIT_ASSIGNMENTS)
      throw new Error("LIMIT_REACHED: Too many course assignments.");
    const now = Date.now();
    const assignmentId = await ctx.db.insert("courseAssignments", {
      courseId: course._id, ownerId, kind: args.kind,
      ...(args.kind === "lesson" ? { lessonId: args.lessonId } : { snapshotId: args.snapshotId }),
      ...fields, published: false, archived: false, revision: 0, createdAt: now, updatedAt: now,
    });
    const row = await ctx.db.get("courseAssignments", assignmentId);
    if (row) await audit(ctx, row, "created");
    return assignmentId;
  },
});
export const revise = mutation({
  args: { assignmentId: v.id("courseAssignments"), expectedRevision: v.number(),
    title: v.string(), instructions: v.string(), outcome: v.string(),
    opensAt: v.number(), dueAt: v.number(), published: v.boolean(), archived: v.boolean() },
  handler: async (ctx, args) => {
    const { row, course } = await ownedAssignment(ctx, args.assignmentId);
    if (!Number.isSafeInteger(args.expectedRevision) || row.revision !== args.expectedRevision)
      throw new Error("REVISION_CONFLICT: Assignment changed. Reload.");
    const fields = validateAssignment(args);
    if (args.published && !args.archived)
      await ensureResource(ctx, course, row.kind, row.lessonId, row.snapshotId);
    const now = Date.now(), revision = row.revision + 1;
    await ctx.db.patch("courseAssignments", row._id, {
      ...fields, published: args.published, archived: args.archived, revision, updatedAt: now,
    });
    await audit(ctx, { ...row, revision }, args.archived ? "archived" : args.published ? "published_or_updated" : "saved_draft");
    if (args.published && !args.archived && !row.published)
      await notifyCourseStudents(ctx, course._id, "course_assignment",
        "assignment:" + row._id + ":" + revision, "A new course assignment is available.");
    return revision;
  },
});
export const teacherAssignments = query({
  args: { courseId: v.id("learnCollections") },
  handler: async (ctx, { courseId }) => {
    await ownedCourse(ctx, courseId);
    return loadAssignments(ctx, courseId);
  },
});
async function examRelease(ctx: Ctx, row: Doc<"courseAssignments">) {
  if (!row.snapshotId) return null;
  const snap = await ctx.db.get("examSnapshots", row.snapshotId);
  if (!snap || snap.courseId !== row.courseId || snap.ownerId !== row.ownerId) return null;
  const release = await ctx.db.query("examReleases")
    .withIndex("by_draft", q => q.eq("draftId", snap.draftId)).unique();
  return release?.courseId === row.courseId && release.ownerId === row.ownerId &&
    release.activeSnapshotId === snap._id && release.assignmentActive &&
    release.preparedForAudience && release.audience ? release : null;
}
async function latestAttempt(ctx: Ctx, snapshotId: Id<"examSnapshots">, studentId: string) {
  const attempts = await ctx.db.query("examAttempts")
    .withIndex("by_snapshot_student", q => q.eq("snapshotId", snapshotId).eq("studentId", studentId))
    .take(LIMIT_ATTEMPTS + 1);
  if (attempts.length > LIMIT_ATTEMPTS) throw new Error("LIMIT_REACHED: Too many exam attempts.");
  return attempts.filter(a => a.state === "submitted")
    .sort((a,b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))[0] ?? null;
}
async function outcomeFor(ctx: Ctx, row: Doc<"courseAssignments">, studentId: string,
  enrollment: Doc<"courseEnrollments"> | null, reveal: boolean) {
  if (row.kind === "lesson") {
    const completed = !!row.lessonId && !!enrollment?.completedLessonIds.includes(row.lessonId);
    const recordedAt = row.lessonId && enrollment?.lessonCompletedAt?.find(item => item.lessonId === row.lessonId)?.completedAt;
    return { completedAt: completed ? recordedAt ?? enrollment?.updatedAt ?? null : null,
      percentBasisPoints: null as number | null, grading: "not_applicable" as const,
      released: false };
  }
  if (!row.snapshotId) return { completedAt: null, percentBasisPoints: null, grading: "not_started" as const, released: false };
  const attempt = await latestAttempt(ctx, row.snapshotId, studentId);
  if (!attempt) return { completedAt: null, percentBasisPoints: null, grading: "not_started" as const, released: false };
  const grade = await ctx.db.query("examGrades")
    .withIndex("by_attempt", q => q.eq("attemptId", attempt._id)).unique();
  if (grade && (grade.snapshotId !== row.snapshotId || grade.ownerId !== row.ownerId ||
      grade.studentId !== studentId))
    throw new Error("INTEGRITY_ERROR: Grade ownership mismatch.");
  const pub = grade && await ctx.db.query("examResultPublications")
    .withIndex("by_snapshot", q => q.eq("snapshotId", row.snapshotId!)).unique();
  if (pub && (pub.courseId !== row.courseId || pub.ownerId !== row.ownerId))
    throw new Error("INTEGRITY_ERROR: Publication ownership mismatch.");
  const visible = grade ? resultStatus(grade, grade.resultPolicy,
    (pub?.released === true && (!grade.finalizedAt ||
      (pub.releasedAt ?? -1) >= grade.finalizedAt ||
      (grade.regradeReleasedAt ?? -1) >= grade.finalizedAt)), Date.now()) === "released" : false;
  const grading = !grade || grade.state !== "auto_final" ? "grading" as const
    : visible ? "released" as const : "withheld" as const;
  return { completedAt: attempt.submittedAt ?? attempt.closedAt ?? null,
    percentBasisPoints: grade?.state === "auto_final" && (!reveal || visible)
      ? grade.finalPercentBasisPoints ?? null : null,
    grading, released: visible };
}
/** Students see only their approved, currently published work. No marks before result release. */
export const myAssignments = query({
  args: { courseId: v.id("learnCollections") },
  handler: async (ctx, { courseId }) => {
    const studentId = await actor(ctx);
    const course = await ctx.db.get("learnCollections", courseId);
    if (!course || !course.publishedVersionId || course.archived ||
        course.communityState === "removed" || course.communityState === "hidden" ||
        course.ownerId === studentId ||
        !await hasApprovedCourseAccess(ctx, courseId, studentId))
      throw new Error("NOT_FOUND: Course unavailable.");
    const enrollment = await ctx.db.query("courseEnrollments")
      .withIndex("by_course_key", q => q.eq("courseId", courseId).eq("key", "user:" + studentId)).unique();
    const now = Date.now(), result = [];
    for (const row of await loadAssignments(ctx, courseId)) {
      if (!row.published || row.archived || row.ownerId !== course.ownerId) continue;
      if (row.kind === "lesson") {
        const version = await ctx.db.get("collectionVersions", course.publishedVersionId);
        if (!row.lessonId || !version?.items.some(i => i.kind === "lesson" && i.id === row.lessonId)) continue;
      } else {
        const release = await examRelease(ctx, row);
        if (!release?.audience || !await audienceAllows(ctx, courseId, release.audience, studentId)) continue;
      }
      const outcome = await outcomeFor(ctx, row, studentId, enrollment, true);
      result.push({ id: row._id, title: row.title, instructions: row.instructions,
        kind: row.kind, lessonId: row.lessonId ?? null, snapshotId: row.snapshotId ?? null,
        outcome: row.outcome, opensAt: row.opensAt, dueAt: row.dueAt,
        state: assignmentState(now, row.opensAt, row.dueAt, outcome.completedAt),
        grading: outcome.grading, percentBasisPoints: outcome.percentBasisPoints });
    }
    return result;
  },
});
/** One assignment at a time avoids a course-wide N×M unbounded gradebook scan. */
export const teacherGradebook = query({
  args: { assignmentId: v.id("courseAssignments") },
  handler: async (ctx, { assignmentId }) => {
    const { row, course } = await ownedAssignment(ctx, assignmentId);
    const requests = await ctx.db.query("courseJoinRequests")
      .withIndex("by_course_status_requestedAt", q =>
        q.eq("courseId", course._id).eq("status", "approved")).take(LIMIT_STUDENTS + 1);
    if (requests.length > LIMIT_STUDENTS)
      throw new Error("LIMIT_REACHED: Gradebook needs pagination for large classes.");
    const now = Date.now(), rows = [];
    const release = row.kind === "exam" ? await examRelease(ctx, row) : null;
    for (const request of requests) {
      const studentId = request.studentId;
      if (request.ownerId !== course.ownerId ||
          !await hasApprovedCourseAccess(ctx, course._id, studentId)) continue;
      const enrollment = await ctx.db.query("courseEnrollments")
        .withIndex("by_course_key", q => q.eq("courseId", course._id).eq("key", "user:" + studentId)).unique();
      const assigned = row.kind !== "exam" || !!(release?.audience &&
        await audienceAllows(ctx, course._id, release.audience, studentId));
      const outcome = assigned ? await outcomeFor(ctx, row, studentId, enrollment, false) : null;
      rows.push({ studentId, assigned,
        state: assigned ? assignmentState(now, row.opensAt, row.dueAt, outcome!.completedAt) : "not_assigned",
        grading: outcome?.grading ?? "not_applicable",
        percentBasisPoints: outcome?.percentBasisPoints ?? null,
        releasedToStudent: outcome?.released ?? false });
    }
    const assignedRows = rows.filter(r => r.assigned);
    return { assignmentId: row._id, title: row.title, outcome: row.outcome,
      count: assignedRows.length,
      completed: assignedRows.filter(r => r.state === "completed" || r.state === "completed_late").length,
      missed: assignedRows.filter(r => r.state === "missed").length,
      rows };
  },
});
