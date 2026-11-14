import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireActiveUser } from "./authz";
import { audienceAllows } from "./examAudience";
import { hasApprovedCourseAccess } from "./courseMembership";

type Ctx = QueryCtx | MutationCtx;
const RULES_VERSION = 1;
const MAX_GROUP_MEMBERSHIPS = 100;

/**
 * Student-only, fail-closed entry check. This does not read or deliver snapshot
 * questions. A fresh check runs inside every read and consent write.
 */
async function eligible(ctx: Ctx, releaseId: Id<"examReleases">) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
  const studentId = identity.subject;
  const release = await ctx.db.get("examReleases", releaseId);
  if (!release || !release.assignmentActive || !release.preparedForAudience ||
      !release.audience || !release.settings || !release.assignedAt)
    throw new Error("NOT_FOUND: Assigned examination not found.");
  const course = await ctx.db.get("learnCollections", release.courseId);
  if (!course || course.ownerId !== release.ownerId || course.ownerId === studentId ||
      course.archived || course.communityState === "removed" ||
      course.communityState === "hidden" || !course.publishedVersionId)
    throw new Error("NOT_FOUND: Assigned examination not found.");
  const published = await ctx.db.get("collectionVersions", course.publishedVersionId);
  if (!published || published.collectionId !== course._id)
    throw new Error("NOT_FOUND: Course publication unavailable.");
  if (!await hasApprovedCourseAccess(ctx, course._id, studentId) ||
      !await audienceAllows(ctx, course._id, release.audience, studentId))
    throw new Error("NOT_FOUND: Assigned examination not found.");
  const request = await ctx.db.query("courseJoinRequests")
    .withIndex("by_course_student", q => q.eq("courseId", course._id).eq("studentId", studentId)).unique();
  const enrollment = await ctx.db.query("courseEnrollments")
    .withIndex("by_course_key", q => q.eq("courseId", course._id).eq("key", `user:${studentId}`)).unique();
  if (!request || request.status !== "approved" || request.ownerId !== course.ownerId ||
      !enrollment || enrollment.studentId !== studentId || enrollment.ownerId !== course.ownerId)
    throw new Error("NOT_FOUND: Approved enrollment required.");
  const snapshot = await ctx.db.get("examSnapshots", release.activeSnapshotId);
  const draft = await ctx.db.get("examBuilderDrafts", release.draftId);
  if (!snapshot || !draft || snapshot.ownerId !== course.ownerId ||
      snapshot.courseId !== course._id || snapshot.draftId !== draft._id ||
      snapshot.draftRevision !== draft.revision || draft.courseId !== course._id ||
      draft.ownerId !== course.ownerId || snapshot.version !== release.version)
    throw new Error("EXAM_CHANGED: Exam must be resealed before students can enter.");

  // A group membership removed and re-created must not inherit an earlier consent.
  let membershipMarker = "";
  if (release.audience.mode === "groups") {
    const members = await ctx.db.query("courseGroupMembers")
      .withIndex("by_course_student", q => q.eq("courseId", course._id).eq("studentId", studentId))
      .take(MAX_GROUP_MEMBERSHIPS + 1);
    if (members.length > MAX_GROUP_MEMBERSHIPS)
      throw new Error("LIMIT_REACHED: Group membership preflight requires review.");
    const matching: string[] = [];
    for (const member of members) {
      if (!release.audience.groupIds.includes(member.groupId)) continue;
      const group = await ctx.db.get("courseGroups", member.groupId);
      if (group?.courseId === course._id && group.ownerId === course.ownerId)
        matching.push(member._id);
    }
    if (!matching.length) throw new Error("NOT_FOUND: Group assignment no longer applies.");
    membershipMarker = matching.sort().join(",");
  }
  const now = Date.now();
  const { settings } = release;
  if (settings.mode === "scheduled" &&
      (!settings.opensAt || !settings.closesAt || settings.closesAt <= now))
    throw new Error("EXAM_CLOSED: This examination window has ended.");
  // A revision is an invalidation stamp, NOT a bearer token or an access grant.
  const policyVersion = [
    `rules:${RULES_VERSION}`, release._id, release.activeSnapshotId,
    release.version, release.settingsRevision ?? 0, release.audienceRevision ?? 0,
    release.assignedAt, course.publishedVersionId,
    request._id, request.updatedAt, enrollment._id, enrollment.updatedAt, membershipMarker,
  ].join("|");
  return { release, course, snapshot, settings, studentId, policyVersion, now };
}

export const get = query({
  args: { releaseId: v.id("examReleases") },
  handler: async (ctx, { releaseId }) => {
    const { release, course, snapshot, settings, studentId, policyVersion, now } =
      await eligible(ctx, releaseId);
    const consent = await ctx.db.query("examConsents")
      .withIndex("by_release_student", q => q.eq("releaseId", releaseId).eq("studentId", studentId)).unique();
    return {
      releaseId, courseId: course._id, courseTitle: course.metadata.title,
      title: snapshot.title, questionCount: snapshot.questions.length,
      durationMinutes: settings.durationMinutes, maxAttempts: settings.maxAttempts,
      requireAllAnswers: settings.requireAllAnswers,
      allowEarlySubmission: settings.allowEarlySubmission,
      timeoutAction: settings.timeoutAction, resultVisibility: settings.resultVisibility,
      showCorrectAnswers: settings.showCorrectAnswers,
      showExplanations: settings.showExplanations,
      opensAt: settings.mode === "scheduled" ? settings.opensAt! : null,
      closesAt: settings.mode === "scheduled" ? settings.closesAt! : null,
      status: settings.mode === "scheduled" && settings.opensAt! > now
        ? "upcoming" as const : "available" as const,
      serverNow: now, rulesVersion: RULES_VERSION, policyVersion,
      consentRevision: consent?.revision ?? 0,
      consentAccepted: !!consent && consent.policyVersion === policyVersion &&
        consent.rulesVersion === RULES_VERSION,
      acceptedAt: consent?.policyVersion === policyVersion ? consent.acceptedAt : null,
      // Intentionally hardcoded until secure delivery, quotas, server timers and submissions land.
      entryEnabled: false,
    };
  },
});

/** Explicit, optimistic-concurrency-checked rules acceptance; never starts an attempt. */
export const acknowledge = mutation({
  args: {
    releaseId: v.id("examReleases"),
    expectedPolicyVersion: v.string(),
    expectedConsentRevision: v.number(),
    accepted: v.boolean(),
  },
  returns: v.object({ revision: v.number(), acceptedAt: v.number() }),
  handler: async (ctx, args) => {
    if (args.accepted !== true)
      throw new Error("CONSENT_REQUIRED: Explicit acceptance of the exam rules is required.");
    const { studentId, policyVersion } = await eligible(ctx, args.releaseId);
    if (args.expectedPolicyVersion !== policyVersion)
      throw new Error("PREFLIGHT_STALE: Reload the latest exam rules before accepting.");
    const prior = await ctx.db.query("examConsents")
      .withIndex("by_release_student", q => q.eq("releaseId", args.releaseId).eq("studentId", studentId)).unique();
    if (!Number.isSafeInteger(args.expectedConsentRevision) ||
        (prior?.revision ?? 0) !== args.expectedConsentRevision)
      throw new Error("REVISION_CONFLICT: Your exam consent has changed; reload.");
    const acceptedAt = Date.now();
    const revision = args.expectedConsentRevision + 1;
    if (prior) await ctx.db.patch("examConsents", prior._id, {
      policyVersion, rulesVersion: RULES_VERSION, snapshotId:
        (await ctx.db.get("examReleases", args.releaseId))!.activeSnapshotId,
      acceptedAt, revision,
    });
    else {
      const release = await ctx.db.get("examReleases", args.releaseId);
      if (!release) throw new Error("NOT_FOUND: Assigned examination not found.");
      await ctx.db.insert("examConsents", {
        releaseId: args.releaseId, studentId, snapshotId: release.activeSnapshotId,
        policyVersion, rulesVersion: RULES_VERSION, acceptedAt, revision,
      });
    }
    return { revision, acceptedAt };
  },
});
