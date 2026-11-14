import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthIdentity } from "./authIdentity";
import { requireActiveUser } from "./authz";
import { readPublicCourse } from "./courses";
import { recordStudent } from "./studentRoster";

/**
 * Course admission is separate from course publication. This module introduces
 * doctor-reviewed requests; it does NOT make the old self-enrollment or public
 * lesson paths secure on its own. Those paths must be migrated before rollout.
 */
const requestStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("withdrawn"),
);

async function requestFor(
  ctx: QueryCtx | MutationCtx,
  courseId: Id<"learnCollections">,
  studentId: string,
) {
  return ctx.db
    .query("courseJoinRequests")
    .withIndex("by_course_student", q =>
      q.eq("courseId", courseId).eq("studentId", studentId),
    )
    .unique();
}

async function existingEnrollment(
  ctx: QueryCtx | MutationCtx,
  courseId: Id<"learnCollections">,
  studentId: string,
) {
  return ctx.db
    .query("courseEnrollments")
    .withIndex("by_course_key", q =>
      q.eq("courseId", courseId).eq("key", `user:${studentId}`),
    )
    .unique();
}

/** A student may request access to a published, discoverable course; never enroll directly. */
export const requestJoin = mutation({
  args: { courseId: v.string() },
  returns: v.null(),
  handler: async (ctx, { courseId }) => {
    const { identity } = await requireActiveUser(ctx);
    const course = await readPublicCourse(ctx, { courseId });
    if (!course) throw new Error("NOT_FOUND: Course is unavailable.");
    const row = await ctx.db.get("learnCollections", course.id);
    if (!row || row.ownerId === identity.subject) {
      throw new Error("VALIDATION_FAILED: Cannot request your own course.");
    }
    if (await existingEnrollment(ctx, course.id, identity.subject)) return null;
    const prior = await requestFor(ctx, course.id, identity.subject);
    if (prior?.status === "pending" || prior?.status === "approved") return null;
    const now = Date.now();
    if (prior) {
      await ctx.db.patch("courseJoinRequests", prior._id, {
        status: "pending",
        requestedAt: now,
        updatedAt: now,
        reviewedAt: undefined,
        reviewedBy: undefined,
      });
    } else {
      await ctx.db.insert("courseJoinRequests", {
        courseId: course.id,
        ownerId: row.ownerId,
        studentId: identity.subject,
        status: "pending",
        requestedAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

/** The learner only sees their own admission state. */
export const myStatus = query({
  args: { courseId: v.id("learnCollections") },
  returns: v.union(
    v.literal("none"),
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
    v.literal("withdrawn"),
  ),
  handler: async (ctx, { courseId }) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return "none";
    const row = await ctx.db.get("learnCollections", courseId);
    if (!row) return "none";
    if (row.ownerId === identity.subject) return "approved";
    if (await existingEnrollment(ctx, courseId, identity.subject)) return "approved";
    const request = await requestFor(ctx, courseId, identity.subject);
    return request?.status ?? "none";
  },
});

/** A learner can withdraw only their pending request, never an approval. */
export const withdraw = mutation({
  args: { courseId: v.id("learnCollections") },
  returns: v.null(),
  handler: async (ctx, { courseId }) => {
    const { identity } = await requireActiveUser(ctx);
    const prior = await requestFor(ctx, courseId, identity.subject);
    if (prior?.status === "pending") {
      await ctx.db.patch("courseJoinRequests", prior._id, {
        status: "withdrawn",
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/** Pending requests are private to their course owner (not arbitrary logged-in teachers). */
export const listPending = query({
  args: { courseId: v.id("learnCollections") },
  returns: v.array(v.object({
    id: v.id("courseJoinRequests"),
    studentId: v.string(),
    name: v.string(),
    username: v.union(v.string(), v.null()),
    requestedAt: v.number(),
  })),
  handler: async (ctx, { courseId }) => {
    const { identity } = await requireActiveUser(ctx);
    const course = await ctx.db.get("learnCollections", courseId);
    if (!course || course.ownerId !== identity.subject) {
      throw new Error("NOT_FOUND: Course not found.");
    }
    const rows = await ctx.db
      .query("courseJoinRequests")
      .withIndex("by_course_status_requestedAt", q =>
        q.eq("courseId", courseId).eq("status", "pending"),
      )
      .order("asc")
      .take(100);
    return Promise.all(rows.map(async row => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", q => q.eq("clerkId", row.studentId))
        .first();
      return {
        id: row._id,
        studentId: row.studentId,
        name: user?.name || "Chaos student",
        username: user?.username ?? null,
        requestedAt: row.requestedAt,
      };
    }));
  },
});

/** Only the owning doctor can admit or decline a requesting student. */
export const decide = mutation({
  args: {
    requestId: v.id("courseJoinRequests"),
    approve: v.boolean(),
  },
  returns: requestStatus,
  handler: async (ctx, { requestId, approve }) => {
    const { identity } = await requireActiveUser(ctx);
    const request = await ctx.db.get("courseJoinRequests", requestId);
    const course = request
      ? await ctx.db.get("learnCollections", request.courseId)
      : null;
    if (!request || !course || course.ownerId !== identity.subject ||
        request.ownerId !== course.ownerId) {
      throw new Error("NOT_FOUND: Join request not found.");
    }
    const wanted = approve ? "approved" : "rejected";
    if (request.status === wanted) return wanted;
    if (request.status !== "pending") {
      throw new Error("VALIDATION_FAILED: This request is no longer pending.");
    }
    const now = Date.now();
    if (approve) {
      // Existing signed-in enrollment rows are preserved; guests are never admitted.
      if (!await existingEnrollment(ctx, course._id, request.studentId)) {
        await ctx.db.insert("courseEnrollments", {
          courseId: course._id,
          ownerId: course.ownerId,
          key: `user:${request.studentId}`,
          studentId: request.studentId,
          completedLessonIds: [],
          enrolledAt: now,
          updatedAt: now,
        });
      }
      await recordStudent(ctx, {
        authorId: course.ownerId,
        studentId: request.studentId,
        context: course.metadata.title,
      });
    }
    await ctx.db.patch("courseJoinRequests", request._id, {
      status: wanted,
      reviewedAt: now,
      reviewedBy: identity.subject,
      updatedAt: now,
    });
    return wanted;
  },
});
