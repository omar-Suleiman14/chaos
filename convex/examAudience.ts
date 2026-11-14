import { v } from "convex/values";
import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireActiveUser, creatorRestricted } from "./authz";
import { hasApprovedCourseAccess } from "./courseMembership";
import { examAudience, validateExamAudience, type ExamAudience } from "./examAudienceModel";

type Ctx = QueryCtx | MutationCtx;
const MAX_COURSES = 200;
const MAX_RELEASES_PER_COURSE = 100;

async function owned(ctx: Ctx, draftId: Id<"examBuilderDrafts">) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
  const draft = await ctx.db.get("examBuilderDrafts", draftId);
  if (!draft || draft.ownerId !== identity.subject) throw new Error("NOT_FOUND: Exam draft not found.");
  const course = await ctx.db.get("learnCollections", draft.courseId);
  if (!course || course.ownerId !== identity.subject || course.archived ||
      course.communityState === "removed" || course.communityState === "hidden")
    throw new Error("NOT_FOUND: Active course not found.");
  if (await creatorRestricted(ctx, identity.subject)) throw new Error("FORBIDDEN: Account restricted.");
  const release = await ctx.db.query("examReleases")
    .withIndex("by_draft", q => q.eq("draftId", draftId)).unique();
  if (release && (release.ownerId !== identity.subject || release.courseId !== draft.courseId))
    throw new Error("NOT_FOUND: Exam release not found.");
  return { draft, course, release };
}

/** Recheck the *live* course and group association; cached roster labels cannot grant permission. */
export async function audienceAllows(ctx: Ctx, courseId: Id<"learnCollections">,
  audience: ExamAudience, studentId: string): Promise<boolean> {
  const course = await ctx.db.get("learnCollections", courseId);
  if (!course || course.ownerId === studentId ||
      !(await hasApprovedCourseAccess(ctx, courseId, studentId))) return false;
  if (audience.mode === "all") return true;
  if (audience.mode === "students") return audience.studentIds.includes(studentId);
  if (audience.mode !== "groups") return false;
  const memberships = await ctx.db.query("courseGroupMembers")
    .withIndex("by_course_student", q => q.eq("courseId", courseId).eq("studentId", studentId))
    .take(101);
  // A truncated group-membership read cannot be treated as an authorization grant.
  if (memberships.length > 100) return false;
  for (const membership of memberships) {
    if (!audience.groupIds.includes(membership.groupId)) continue;
    const group = await ctx.db.get("courseGroups", membership.groupId);
    if (group?.courseId === courseId && group.ownerId === course.ownerId) return true;
  }
  return false;
}

export const getForDraft = query({
  args: { draftId: v.id("examBuilderDrafts") },
  handler: async (ctx, { draftId }) => {
    const { release } = await owned(ctx, draftId);
    return {
      audience: release?.audience ?? { mode: "all" as const, studentIds: [], groupIds: [] },
      revision: release?.audienceRevision ?? 0,
      assigned: release?.assignmentActive ?? false,
      assignedAt: release?.assignedAt ?? null,
      prepared: release?.preparedForAudience ?? false,
      entryEnabled: false, // A later runtime PR must explicitly enable secure entry.
    };
  },
});

/** Assignment is transactional, revision-checked and *never* starts an attempt. */
export const setForDraft = mutation({
  args: {
    draftId: v.id("examBuilderDrafts"), expectedRevision: v.number(),
    audience: examAudience, assigned: v.boolean(),
  },
  handler: async (ctx, { draftId, expectedRevision, audience, assigned }) => {
    const { draft, course, release } = await owned(ctx, draftId);
    if (!release) throw new Error("SNAPSHOT_REQUIRED: Seal this exam first.");
    if (release.studentEntryEnabled) throw new Error("EXAM_ACTIVE: Close the exam before changing assignments.");
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== (release.audienceRevision ?? 0))
      throw new Error("REVISION_CONFLICT: Exam assignments changed; reload.");
    const clean = validateExamAudience(audience);
    if (assigned) {
      if (!release.preparedForAudience || !release.settings)
        throw new Error("SETTINGS_REQUIRED: Prepare and save exam settings first.");
      if (!course.publishedVersionId)
        throw new Error("COURSE_UNPUBLISHED: Publish the course before assigning its exam.");
      const snapshot = await ctx.db.get("examSnapshots", release.activeSnapshotId);
      if (!snapshot || snapshot.ownerId !== course.ownerId || snapshot.courseId !== course._id ||
          snapshot.draftId !== draftId || snapshot.draftRevision !== draft.revision)
        throw new Error("STALE_SNAPSHOT: Seal the current exam before assigning.");
      if (release.settings.mode === "scheduled" &&
          (!release.settings.closesAt || release.settings.closesAt <= Date.now()))
        throw new Error("SCHEDULE_CLOSED: Assign a future exam window.");
      if (clean.mode === "students") for (const studentId of clean.studentIds) {
        if (!await hasApprovedCourseAccess(ctx, course._id, studentId) ||
            studentId === course.ownerId)
          throw new Error("APPROVAL_REQUIRED: Select approved members of this course only.");
        const student = await ctx.db.query("users")
          .withIndex("by_clerkId", q => q.eq("clerkId", studentId)).unique();
        if (!student || student.isBanned || student.suspendedUntil && student.suspendedUntil > Date.now())
          throw new Error("APPROVAL_REQUIRED: A selected student account is inactive.");
      }
      if (clean.mode === "groups") for (const groupId of clean.groupIds) {
        const group = await ctx.db.get("courseGroups", groupId);
        if (!group || group.courseId !== course._id || group.ownerId !== course.ownerId)
          throw new Error("NOT_FOUND: Selected group does not belong to this course.");
      }
    }
    const now = Date.now();
    await ctx.db.patch("examReleases", release._id, {
      audience: clean, audienceRevision: expectedRevision + 1,
      assignmentActive: assigned, assignedAt: assigned ? now : undefined,
      studentEntryEnabled: false, updatedAt: now,
    });
    return expectedRevision + 1;
  },
});

/**
 * Metadata-only student dashboard. It never returns frozen questions, keys,
 * hidden selections, unreleased results, private group rosters or start tokens.
 */
export const myDue = query({
  args: {},
  handler: async (ctx) => {
    const { identity, user } = await requireActiveUser(ctx);
    if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
    const requests = await ctx.db.query("courseJoinRequests")
      .withIndex("by_student_updated", q => q.eq("studentId", identity.subject))
      .order("desc").take(MAX_COURSES + 1);
    // Never treat a partial course listing as proof of completeness.
    if (requests.length > MAX_COURSES)
      throw new Error("LIMIT_REACHED: Too many course memberships for this dashboard.");
    const now = Date.now();
    const due: Array<{
      releaseId: Id<"examReleases">; courseId: Id<"learnCollections">;
      courseTitle: string; title: string; questionCount: number;
      durationMinutes: number; opensAt: number | null; closesAt: number | null;
      status: "upcoming" | "due"; assignedAt: number;
    }> = [];
    for (const request of requests) {
      if (request.status !== "approved") continue;
      const course = await ctx.db.get("learnCollections", request.courseId);
      if (!course || course.ownerId !== request.ownerId || course.archived ||
          !course.publishedVersionId || course.communityState === "hidden" ||
          course.communityState === "removed" ||
          !await hasApprovedCourseAccess(ctx, course._id, identity.subject)) continue;
      const releases = await ctx.db.query("examReleases")
        .withIndex("by_course", q => q.eq("courseId", course._id))
        .take(MAX_RELEASES_PER_COURSE + 1);
      if (releases.length > MAX_RELEASES_PER_COURSE)
        throw new Error("LIMIT_REACHED: Course exam listing requires pagination.");
      for (const release of releases) {
        if (release.ownerId !== course.ownerId || !release.assignmentActive ||
            !release.preparedForAudience || !release.audience || !release.settings ||
            !release.assignedAt) continue;
        if (!await audienceAllows(ctx, course._id, release.audience, identity.subject)) continue;
        const snapshot = await ctx.db.get("examSnapshots", release.activeSnapshotId);
        if (!snapshot || snapshot.courseId !== course._id || snapshot.ownerId !== course.ownerId ||
            snapshot.draftId !== release.draftId) continue;
        const { opensAt, closesAt, durationMinutes, mode } = release.settings;
        if (mode === "scheduled" && (!opensAt || !closesAt || closesAt <= now)) continue;
        due.push({
          releaseId: release._id, courseId: course._id, courseTitle: course.metadata.title,
          title: snapshot.title, questionCount: snapshot.questions.length,
          durationMinutes, opensAt: mode === "scheduled" ? opensAt! : null,
          closesAt: mode === "scheduled" ? closesAt! : null,
          status: mode === "scheduled" && opensAt! > now ? "upcoming" : "due",
          assignedAt: release.assignedAt,
        });
      }
    }
    return due.sort((a, b) => (a.opensAt ?? 0) - (b.opensAt ?? 0) ||
      b.assignedAt - a.assignedAt).slice(0, 200);
  },
});
