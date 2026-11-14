import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthIdentity } from "./authIdentity";
import { requireActiveUser } from "./authz";
import { hasApprovedCourseAccess } from "./courseMembership";
import { recordStudent } from "./studentRoster";

/**
 * Course cohorts are organizational metadata, never admission credentials.
 * Only an approved join request + matching enrollment (courseMembership.ts)
 * grants access. The owner controls groups, invitations and roster sanctions.
 */
type Ctx = QueryCtx | MutationCtx;
const batchAction = v.union(v.literal("suspend"), v.literal("remove"), v.literal("readmit"));
const groupAction = v.union(v.literal("add"), v.literal("remove"));
const LIMIT = 100;

async function requireCourseOwner(ctx: Ctx, courseId: Id<"learnCollections">) {
  const { identity } = await requireActiveUser(ctx);
  const course = await ctx.db.get("learnCollections", courseId);
  if (!course || course.ownerId !== identity.subject) throw new Error("NOT_FOUND: Course not found.");
  return { course, actor: identity.subject };
}

async function groupForOwner(ctx: Ctx, groupId: Id<"courseGroups">) {
  const group = await ctx.db.get("courseGroups", groupId);
  if (!group) throw new Error("NOT_FOUND: Group not found.");
  const { course, actor } = await requireCourseOwner(ctx, group.courseId);
  if (group.ownerId !== course.ownerId) throw new Error("NOT_FOUND: Group not found.");
  return { group, course, actor };
}

async function joinRow(ctx: Ctx, courseId: Id<"learnCollections">, studentId: string) {
  return ctx.db.query("courseJoinRequests")
    .withIndex("by_course_student", q => q.eq("courseId", courseId).eq("studentId", studentId))
    .unique();
}

async function invitationRow(ctx: Ctx, courseId: Id<"learnCollections">, studentId: string) {
  return ctx.db.query("courseInvitations")
    .withIndex("by_course_student", q => q.eq("courseId", courseId).eq("studentId", studentId))
    .unique();
}

function ids(values: string[]) {
  if (!values.length || values.length > LIMIT || new Set(values).size !== values.length ||
      values.some(x => !x.trim() || x.length > 160)) {
    throw new Error("VALIDATION_FAILED: Supply 1–100 unique student IDs.");
  }
  return values;
}

export const roster = query({
  args: { courseId: v.id("learnCollections") },
  handler: async (ctx, { courseId }) => {
    const { course } = await requireCourseOwner(ctx, courseId);
    const states = await Promise.all((["approved", "suspended", "removed"] as const).map(status =>
      ctx.db.query("courseJoinRequests")
        .withIndex("by_course_status_requestedAt", q => q.eq("courseId", courseId).eq("status", status))
        .take(200),
    ));
    const students = await Promise.all(states.flat().map(async r => {
      const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", r.studentId)).first();
      // A historical row that lacks the approved enrollment is not an admitted student.
      if (r.status === "approved" && !await hasApprovedCourseAccess(ctx, courseId, r.studentId)) return null;
      return { studentId: r.studentId, status: r.status,
        name: user?.name ?? "Chaos student", username: user?.username ?? null };
    }));
    const groups = await ctx.db.query("courseGroups").withIndex("by_course", q => q.eq("courseId", courseId)).take(100);
    const detailedGroups = await Promise.all(groups.map(async g => ({
      id: g._id, name: g.name,
      studentIds: (await ctx.db.query("courseGroupMembers").withIndex("by_group", q => q.eq("groupId", g._id)).take(500)).map(m => m.studentId),
    })));
    const invites = await ctx.db.query("courseInvitations")
      .withIndex("by_course_status", q => q.eq("courseId", courseId).eq("status", "pending")).take(100);
    const invitations = await Promise.all(invites.map(async invitation => {
      const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", invitation.studentId)).first();
      return { studentId: invitation.studentId, name: user?.name ?? "Chaos student", username: user?.username ?? null };
    }));
    return { students: students.filter((s): s is NonNullable<typeof s> => s !== null),
      groups: detailedGroups, invitations, truncated: states.some(s => s.length === 200),
      ownerId: course.ownerId };
  },
});

export const createGroup = mutation({
  args: { courseId: v.id("learnCollections"), name: v.string() },
  returns: v.id("courseGroups"),
  handler: async (ctx, { courseId, name }) => {
    const { course } = await requireCourseOwner(ctx, courseId);
    const clean = name.trim();
    if (clean.length < 2 || clean.length > 60) throw new Error("VALIDATION_FAILED: Group name must be 2–60 characters.");
    const groups = await ctx.db.query("courseGroups").withIndex("by_course", q => q.eq("courseId", courseId)).take(101);
    if (groups.length >= 100) throw new Error("LIMIT_REACHED: Maximum 100 course groups.");
    if (groups.some(g => g.name.toLocaleLowerCase() === clean.toLocaleLowerCase()))
      throw new Error("ALREADY_EXISTS: A group with this name exists.");
    const now = Date.now();
    return ctx.db.insert("courseGroups", { courseId, ownerId: course.ownerId, name: clean, createdAt: now, updatedAt: now });
  },
});

export const renameGroup = mutation({
  args: { groupId: v.id("courseGroups"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { groupId, name }) => {
    const { group } = await groupForOwner(ctx, groupId);
    const clean = name.trim();
    if (clean.length < 2 || clean.length > 60) throw new Error("VALIDATION_FAILED: Group name must be 2–60 characters.");
    const groups = await ctx.db.query("courseGroups").withIndex("by_course", q => q.eq("courseId", group.courseId)).collect();
    if (groups.some(g => g._id !== groupId && g.name.toLocaleLowerCase() === clean.toLocaleLowerCase()))
      throw new Error("ALREADY_EXISTS: A group with this name exists.");
    await ctx.db.patch("courseGroups", groupId, { name: clean, updatedAt: Date.now() });
    return null;
  },
});

export const deleteGroup = mutation({
  args: { groupId: v.id("courseGroups") },
  returns: v.null(),
  handler: async (ctx, { groupId }) => {
    await groupForOwner(ctx, groupId);
    const members = await ctx.db.query("courseGroupMembers").withIndex("by_group", q => q.eq("groupId", groupId)).collect();
    for (const member of members) await ctx.db.delete("courseGroupMembers", member._id);
    await ctx.db.delete("courseGroups", groupId);
    return null;
  },
});

export const changeGroupMembers = mutation({
  args: { groupId: v.id("courseGroups"), studentIds: v.array(v.string()), action: groupAction },
  returns: v.null(),
  handler: async (ctx, { groupId, studentIds, action }) => {
    const { group, course } = await groupForOwner(ctx, groupId);
    for (const studentId of ids(studentIds)) {
      const current = await ctx.db.query("courseGroupMembers")
        .withIndex("by_group_student", q => q.eq("groupId", groupId).eq("studentId", studentId)).unique();
      if (action === "remove") {
        if (current) await ctx.db.delete("courseGroupMembers", current._id);
      } else {
        if (studentId === course.ownerId || !await hasApprovedCourseAccess(ctx, group.courseId, studentId))
          throw new Error("APPROVAL_REQUIRED: Groups can contain approved students only.");
        if (!current) await ctx.db.insert("courseGroupMembers", {
          courseId: group.courseId, groupId, studentId, addedAt: Date.now(),
        });
      }
    }
    return null;
  },
});

/** Revocation is effective immediately because the content guard checks the request status. */
export const manageStudents = mutation({
  args: { courseId: v.id("learnCollections"), studentIds: v.array(v.string()), action: batchAction },
  returns: v.null(),
  handler: async (ctx, { courseId, studentIds, action }) => {
    const { course, actor } = await requireCourseOwner(ctx, courseId);
    for (const studentId of ids(studentIds)) {
      if (studentId === actor) throw new Error("VALIDATION_FAILED: Cannot change course owner.");
      const row = await joinRow(ctx, courseId, studentId);
      if (!row || row.ownerId !== course.ownerId) throw new Error("NOT_FOUND: Roster member not found.");
      if (action === "readmit") {
        if (row.status !== "removed" && row.status !== "suspended")
          throw new Error("VALIDATION_FAILED: Only removed or suspended students can be readmitted.");
        const enrollment = await ctx.db.query("courseEnrollments")
          .withIndex("by_course_key", q => q.eq("courseId", courseId).eq("key", `user:${studentId}`)).unique();
        if (!enrollment) await ctx.db.insert("courseEnrollments", {
          courseId, ownerId: course.ownerId, key: `user:${studentId}`, studentId,
          completedLessonIds: [], enrolledAt: Date.now(), updatedAt: Date.now(),
        });
        else if (enrollment.ownerId !== course.ownerId || enrollment.studentId !== studentId)
          throw new Error("VALIDATION_FAILED: Enrollment ownership mismatch.");
        await ctx.db.patch("courseJoinRequests", row._id, { status: "approved", updatedAt: Date.now(), reviewedAt: Date.now(), reviewedBy: actor });
        await recordStudent(ctx, { authorId: course.ownerId, studentId, context: course.metadata.title });
      } else {
        if (row.status !== "approved") throw new Error("VALIDATION_FAILED: Only approved students can be removed or suspended.");
        await ctx.db.patch("courseJoinRequests", row._id, {
          status: action === "remove" ? "removed" : "suspended", updatedAt: Date.now(), reviewedAt: Date.now(), reviewedBy: actor,
        });
        const invite = await invitationRow(ctx, courseId, studentId);
        if (invite?.status === "pending") await ctx.db.patch("courseInvitations", invite._id, { status: "canceled", respondedAt: Date.now() });
        // Suspension preserves group assignments for later readmission; removal does not.
        if (action === "remove") {
          const members = await ctx.db.query("courseGroupMembers")
            .withIndex("by_course_student", q => q.eq("courseId", courseId).eq("studentId", studentId)).collect();
          for (const member of members) await ctx.db.delete("courseGroupMembers", member._id);
        }
      }
    }
    return null;
  },
});

/** Invite an existing account by username; sending an invitation does not grant lesson access. */
export const inviteStudent = mutation({
  args: { courseId: v.id("learnCollections"), username: v.string() },
  returns: v.null(),
  handler: async (ctx, { courseId, username }) => {
    const { course, actor } = await requireCourseOwner(ctx, courseId);
    const handle = username.trim().replace(/^@/, "");
    if (!handle || handle.length > 80) throw new Error("VALIDATION_FAILED: Enter a valid username.");
    const user = await ctx.db.query("users").withIndex("by_username", q => q.eq("username", handle)).unique();
    if (!user || user.clerkId === actor || user.isBanned || user.suspendedUntil)
      throw new Error("NOT_FOUND: Eligible student account not found.");
    const join = await joinRow(ctx, courseId, user.clerkId);
    if (join?.status === "approved") throw new Error("ALREADY_EXISTS: Student is already admitted.");
    if (join?.status === "removed" || join?.status === "suspended")
      throw new Error("VALIDATION_FAILED: Readmit this student from the roster.");
    const prior = await invitationRow(ctx, courseId, user.clerkId);
    if (prior?.status === "pending") return null;
    const now = Date.now();
    if (prior) await ctx.db.patch("courseInvitations", prior._id, {
      status: "pending", invitedAt: now, invitedBy: actor, respondedAt: undefined,
    });
    else await ctx.db.insert("courseInvitations", {
      courseId, ownerId: course.ownerId, studentId: user.clerkId,
      status: "pending", invitedAt: now, invitedBy: actor,
    });
    return null;
  },
});

export const cancelInvitation = mutation({
  args: { courseId: v.id("learnCollections"), studentId: v.string() },
  returns: v.null(),
  handler: async (ctx, { courseId, studentId }) => {
    await requireCourseOwner(ctx, courseId);
    const row = await invitationRow(ctx, courseId, studentId);
    if (row?.status === "pending") await ctx.db.patch("courseInvitations", row._id, {
      status: "canceled", respondedAt: Date.now(),
    });
    return null;
  },
});

export const myInvitation = query({
  args: { courseId: v.id("learnCollections") },
  returns: v.union(v.literal("none"), v.literal("pending")),
  handler: async (ctx, { courseId }) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return "none";
    return (await invitationRow(ctx, courseId, identity.subject))?.status === "pending" ? "pending" : "none";
  },
});

/** Accepting an owner invitation is explicit student consent and owner preapproval. */
export const respondToInvitation = mutation({
  args: { courseId: v.id("learnCollections"), accept: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { courseId, accept }) => {
    const { identity } = await requireActiveUser(ctx);
    const invite = await invitationRow(ctx, courseId, identity.subject);
    const course = await ctx.db.get("learnCollections", courseId);
    if (!invite || invite.status !== "pending" || !course || course.ownerId !== invite.ownerId)
      throw new Error("NOT_FOUND: Pending invitation not found.");
    const join = await joinRow(ctx, courseId, identity.subject);
    if (join?.status === "removed" || join?.status === "suspended")
      throw new Error("APPROVAL_REQUIRED: The teacher must readmit this student.");
    const now = Date.now();
    if (accept) {
      const enrollment = await ctx.db.query("courseEnrollments")
        .withIndex("by_course_key", q => q.eq("courseId", courseId).eq("key", `user:${identity.subject}`)).unique();
      if (!enrollment) await ctx.db.insert("courseEnrollments", {
        courseId, ownerId: course.ownerId, key: `user:${identity.subject}`,
        studentId: identity.subject, completedLessonIds: [], enrolledAt: now, updatedAt: now,
      });
      else if (enrollment.studentId !== identity.subject || enrollment.ownerId !== course.ownerId)
        throw new Error("VALIDATION_FAILED: Enrollment ownership mismatch.");
      if (join) await ctx.db.patch("courseJoinRequests", join._id, {
        status: "approved", reviewedAt: now, reviewedBy: invite.invitedBy, updatedAt: now,
      });
      else await ctx.db.insert("courseJoinRequests", {
        courseId, ownerId: course.ownerId, studentId: identity.subject, status: "approved",
        requestedAt: now, updatedAt: now, reviewedAt: now, reviewedBy: invite.invitedBy,
      });
      await recordStudent(ctx, { authorId: course.ownerId, studentId: identity.subject, context: course.metadata.title });
    }
    await ctx.db.patch("courseInvitations", invite._id, {
      status: accept ? "accepted" : "declined", respondedAt: now,
    });
    return null;
  },
});
