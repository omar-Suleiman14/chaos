import { paginationOptsValidator } from "convex/server";
import { v, type ObjectType } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { adminIdentity, requireAdminForActor } from "./adminAccess";
import { supportPriority, supportStatus } from "./adminOperationsModel";

const pageArgs = { paginationOpts: paginationOptsValidator };
const PAGE_LIMIT = 25;
const READ_BYTES = 1_000_000;

function boundedPage(options: ObjectType<typeof paginationOptsValidator>) {
  if (!Number.isSafeInteger(options.numItems) || options.numItems < 1 || options.numItems > PAGE_LIMIT)
    throw new Error("INVALID_PAGE: Choose 1–25 records.");
  return { ...options, maximumBytesRead: READ_BYTES };
}

async function courseName(ctx: QueryCtx, courseId: string) {
  const id = ctx.db.normalizeId("learnCollections", courseId);
  if (!id) return "Unavailable course";
  const course = await ctx.db.get("learnCollections", id);
  return course?.metadata.title ?? "Unavailable course";
}

/** Operational metadata only. Admission remains a doctor decision. */
export const admissionsArgs = {
  ...pageArgs,
  status: v.optional(v.union(
    v.literal("pending"), v.literal("approved"), v.literal("rejected"),
    v.literal("withdrawn"), v.literal("suspended"), v.literal("removed"),
  )),
};
export async function admissionsForActor(ctx: QueryCtx, args: ObjectType<typeof admissionsArgs>, actorId?: string) {
  await requireAdminForActor(ctx, actorId);
  const base = args.status
    ? ctx.db.query("courseJoinRequests").withIndex("by_status_updated", q => q.eq("status", args.status!))
    : ctx.db.query("courseJoinRequests");
  const result = await base.order("desc").paginate(boundedPage(args.paginationOpts));
  return {
    ...result,
    page: await Promise.all(result.page.map(async row => ({
      id: String(row._id),
      courseId: String(row.courseId),
      courseTitle: await courseName(ctx, row.courseId),
      ownerId: row.ownerId,
      studentId: row.studentId,
      status: row.status,
      requestedAt: row.requestedAt,
      updatedAt: row.updatedAt,
    }))),
  };
}
export const admissions = query({ args: admissionsArgs, handler: (ctx, args) => admissionsForActor(ctx, args) });

/** No questions, attempts, answers, scores, rubrics, or unreleased results. */
export async function examsForActor(ctx: QueryCtx, args: ObjectType<typeof pageArgs>, actorId?: string) {
  await requireAdminForActor(ctx, actorId);
  const result = await ctx.db.query("examReleases").order("desc").paginate(boundedPage(args.paginationOpts));
  return {
    ...result,
    page: await Promise.all(result.page.map(async row => ({
      id: String(row._id),
      courseId: String(row.courseId),
      courseTitle: await courseName(ctx, row.courseId),
      ownerId: row.ownerId,
      version: row.version,
      studentEntryEnabled: row.studentEntryEnabled,
      assigned: row.assignmentActive === true,
      configured: !!row.settings && !!row.audience,
      mode: row.settings?.mode ?? null,
      opensAt: row.settings?.opensAt ?? null,
      closesAt: row.settings?.closesAt ?? null,
      updatedAt: row.updatedAt,
    }))),
  };
}
export const exams = query({ args: pageArgs, handler: (ctx, args) => examsForActor(ctx, args) });

export const gradingArgs = {
  ...pageArgs,
  status: v.optional(v.union(v.literal("queued"), v.literal("claimed"), v.literal("doctor_review"))),
};
export async function gradingForActor(ctx: QueryCtx, args: ObjectType<typeof gradingArgs>, actorId?: string) {
  await requireAdminForActor(ctx, actorId);
  const base = args.status
    ? ctx.db.query("examGradingJobs").withIndex("by_status_updated", q => q.eq("status", args.status!))
    : ctx.db.query("examGradingJobs");
  const result = await base.order("desc").paginate(boundedPage(args.paginationOpts));
  return {
    ...result,
    page: result.page.map(row => ({
      id: String(row._id),
      courseId: String(row.courseId),
      ownerId: row.ownerId,
      status: row.status,
      retryCount: row.retryCount,
      revision: row.revision,
      updatedAt: row.updatedAt,
      claimExpiresAt: row.claimExpiresAt ?? null,
    })),
  };
}
export const grading = query({ args: gradingArgs, handler: (ctx, args) => gradingForActor(ctx, args) });

export async function auditForActor(ctx: QueryCtx, args: ObjectType<typeof pageArgs>, actorId?: string) {
  await requireAdminForActor(ctx, actorId);
  const result = await ctx.db.query("adminAudit").order("desc").paginate(boundedPage(args.paginationOpts));
  return {
    ...result,
    page: result.page.map(row => ({
      id: String(row._id), actorId: row.actorId,
      action: row.action, target: row.target,
      reason: row.reason, createdAt: row.createdAt,
    })),
  };
}
export const audit = query({ args: pageArgs, handler: (ctx, args) => auditForActor(ctx, args) });

export const casesArgs = {
  ...pageArgs,
  status: v.optional(supportStatus),
};
export async function casesForActor(ctx: QueryCtx, args: ObjectType<typeof casesArgs>, actorId?: string) {
  await requireAdminForActor(ctx, actorId);
  const base = args.status
    ? ctx.db.query("platformSupportCases").withIndex("by_status_updated", q => q.eq("status", args.status!))
    : ctx.db.query("platformSupportCases");
  const result = await base.order("desc").paginate(boundedPage(args.paginationOpts));
  return { ...result, page: result.page.map(row => ({
    id: row._id, subject: row.subject, summary: row.summary,
    accountId: row.accountId ?? null, priority: row.priority,
    status: row.status, revision: row.revision, updatedAt: row.updatedAt,
    createdAt: row.createdAt, updatedBy: row.updatedBy,
  })) };
}
export const cases = query({ args: casesArgs, handler: (ctx, args) => casesForActor(ctx, args) });

export function validateSupportText(value: string, min: number, max: number, label: string) {
  const text = value.trim();
  if (text.length < min || text.length > max) throw new Error("INVALID_SUPPORT: " + label + " must be " + min + "–" + max + " characters.");
  return text;
}
export const createCaseArgs = {
  subject: v.string(), summary: v.string(),
  accountId: v.optional(v.string()), priority: supportPriority,
};
export async function createCaseForActor(ctx: MutationCtx, args: ObjectType<typeof createCaseArgs>, actorId?: string) {
  await requireAdminForActor(ctx, actorId);
  const actor = (await adminIdentity(ctx, actorId)).subject;
  const subject = validateSupportText(args.subject, 3, 160, "Subject");
  const summary = validateSupportText(args.summary, 10, 1200, "Summary");
  const accountId = args.accountId?.trim();
  if (accountId && (accountId.length > 128 || !(await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", accountId)).first())))
    throw new Error("INVALID_SUPPORT: Account does not exist.");
  const now = Date.now();
  const id = await ctx.db.insert("platformSupportCases", {
    subject, summary, ...(accountId ? { accountId } : {}),
    priority: args.priority, status: "open", revision: 0,
    createdBy: actor, updatedBy: actor, createdAt: now, updatedAt: now,
  });
  await ctx.db.insert("adminAudit", {
    actorId: actor, action: "support_case_created",
    target: String(id), reason: "Created operational support case",
    createdAt: now,
  });
  return id;
}
export const createCase = mutation({ args: createCaseArgs, handler: (ctx, args) => createCaseForActor(ctx, args) });

export const transitionCaseArgs = {
  caseId: v.id("platformSupportCases"), expectedRevision: v.number(),
  status: supportStatus, reason: v.string(),
};
export async function transitionCaseForActor(ctx: MutationCtx, args: ObjectType<typeof transitionCaseArgs>, actorId?: string) {
  await requireAdminForActor(ctx, actorId);
  const actor = (await adminIdentity(ctx, actorId)).subject;
  const reason = validateSupportText(args.reason, 8, 500, "Transition reason");
  const row = await ctx.db.get("platformSupportCases", args.caseId);
  if (!row) throw new Error("NOT_FOUND: Support case not found.");
  if (!Number.isSafeInteger(args.expectedRevision) || row.revision !== args.expectedRevision)
    throw new Error("REVISION_CONFLICT: Reload the support case.");
  if (row.status === args.status)
    throw new Error("INVALID_SUPPORT: Case is already in that state.");
  const now = Date.now();
  await ctx.db.patch("platformSupportCases", row._id, {
    status: args.status, revision: row.revision + 1,
    updatedAt: now, updatedBy: actor,
    resolvedAt: args.status === "resolved" ? now : undefined,
  });
  await ctx.db.insert("adminAudit", {
    actorId: actor, action: "support_case_" + args.status,
    target: String(row._id), reason, createdAt: now,
  });
  return { revision: row.revision + 1 };
}
export const transitionCase = mutation({
  args: transitionCaseArgs, handler: (ctx, args) => transitionCaseForActor(ctx, args),
});
