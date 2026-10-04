import { addCrmNote, contactListArgs, contactSaveArgs, crmStage, listCrmContacts, readCrmNotes, saveCrmContact } from "./crmServices";
import { authorDb } from "./authorIndex";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { isPaidPlan, requireAdmin, requireIdentity } from "./authz";

const DAY = 86_400_000;
export const contact = query({ args: { contactId: v.id("crmContacts") }, handler: async (ctx, { contactId }) => {
  await requireAdmin(ctx); return ctx.db.get("crmContacts", contactId);
} });
export const contactActivity = query({ args: { contactId: v.id("crmContacts") }, handler: async (ctx, { contactId }) => {
  await requireAdmin(ctx);
  return ctx.db.query("adminAudit").withIndex("by_target", q => q.eq("target", String(contactId))).order("desc").take(100);
} });
export const setContactStages = mutation({ args: { contactIds: v.array(v.id("crmContacts")), stage: crmStage }, returns: v.null(), handler: async (ctx, args) => {
  await requireAdmin(ctx); const { subject } = await requireIdentity(ctx);
  const ids = [...new Set(args.contactIds)];
  if (!ids.length || ids.length > 48) throw new Error("Select between 1 and 48 contacts.");
  for (const id of ids) {
    const contact = await ctx.db.get("crmContacts", id);
    if (!contact) throw new Error("Contact not found.");
    if (contact.stage === args.stage) continue;
    await ctx.db.patch("crmContacts", id, { stage: args.stage, updatedAt: Date.now() });
    await ctx.db.insert("adminAudit", { actorId: subject, action: "crm_stage_changed", target: String(id), reason: `${contact.stage} → ${args.stage}`, createdAt: Date.now() });
  }
  return null;
} });
export const completeContactFollowUp = mutation({ args: { contactId: v.id("crmContacts") }, returns: v.null(), handler: async (ctx, { contactId }) => {
  await requireAdmin(ctx); const { subject } = await requireIdentity(ctx);
  const contact = await ctx.db.get("crmContacts", contactId);
  if (!contact) throw new Error("Contact not found.");
  if (contact.nextFollowUp === undefined) return null;
  await ctx.db.patch("crmContacts", contactId, { nextFollowUp: undefined, updatedAt: Date.now() });
  await ctx.db.insert("adminAudit", { actorId: subject, action: "crm_follow_up_completed", target: String(contactId), reason: `Completed follow-up scheduled for ${new Date(contact.nextFollowUp).toISOString().slice(0, 10)}`, createdAt: Date.now() });
  return null;
} });
export const contacts = query({ args: contactListArgs, handler: async (ctx, args) => {
  await requireAdmin(ctx); return listCrmContacts(ctx, args);
} });
export const contactNotes = query({ args: { contactId: v.id("crmContacts") }, handler: async (ctx, { contactId }) => {
  await requireAdmin(ctx); return readCrmNotes(ctx, contactId);
} });
export const saveContact = mutation({ args: contactSaveArgs, handler: async (ctx, args) => {
  await requireAdmin(ctx); const identity = await requireIdentity(ctx); return saveCrmContact(ctx, identity.subject, args);
} });
export const addContactNote = mutation({ args: { contactId: v.id("crmContacts"), body: v.string() }, handler: async (ctx, { contactId, body }) => {
  await requireAdmin(ctx); const identity = await requireIdentity(ctx); await addCrmNote(ctx, identity.subject, contactId, body); return null;
} });
const planValidator = v.union(v.literal("free"), v.literal("pro"));
const stateValidator = v.union(
  v.literal("active"),
  v.literal("suspended"),
  v.literal("banned"),
);
const userRow = v.object({
  _id: v.id("users"),
  clerkId: v.string(),
  name: v.string(),
  email: v.string(),
  username: v.string(),
  state: stateValidator,
  suspendedUntil: v.union(v.number(), v.null()),
  reason: v.string(),
  plan: planValidator,
  legacyGrant: v.boolean(),
  planExpiresAt: v.union(v.number(), v.null()),
});
const contentRow = v.object({
  id: v.string(),
  title: v.string(),
  ownerId: v.string(),
  status: v.string(),
  held: v.boolean(),
  responses: v.union(v.number(), v.null()),
  createdAt: v.number(),
});
// Mirrors paginationResultValidator: paginate() may add splitCursor and pageStatus.
const pageFields = {
  isDone: v.boolean(),
  continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(
    v.union(
      v.literal("SplitRecommended"),
      v.literal("SplitRequired"),
      v.null(),
    ),
  ),
};

export const users = query({
  args: {
    paginationOpts: paginationOptsValidator,
    email: v.optional(v.string()),
  },
  returns: v.object({ page: v.array(userRow), ...pageFields }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const email = args.email?.trim();
    const source = email
      ? ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email))
      : ctx.db.query("users");
    const result = await source
      .order("desc")
      .paginate({ ...args.paginationOpts, maximumBytesRead: 2_000_000 });
    return {
      ...result,
      page: result.page.map((u) => ({
        _id: u._id,
        clerkId: u.clerkId,
        name: u.name,
        email: u.email,
        username: u.username,
        state: u.isBanned
          ? ("banned" as const)
          : u.suspendedUntil
            ? ("suspended" as const)
            : ("active" as const),
        suspendedUntil: u.suspendedUntil ?? null,
        reason: u.moderationReason ?? "",
        plan: isPaidPlan(u) ? ("pro" as const) : ("free" as const),
        legacyGrant: u.plan === undefined && !!u.isElevated,
        planExpiresAt: u.planExpiresAt ?? null,
      })),
    };
  },
});

export const content = query({
  args: {
    kind: v.union(v.literal("forms"), v.literal("quizzes")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({ page: v.array(contentRow), ...pageFields }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.kind === "forms") {
      const result = await ctx.db
        .query("forms")
        .order("desc")
        .paginate({ ...args.paginationOpts, maximumBytesRead: 2_000_000 });
      return {
        ...result,
        page: result.page.map((f) => ({
          id: String(f._id),
          title: f.title,
          ownerId: f.ownerId,
          status: f.status,
          held: !!f.isBanned,
          responses: f.responseCount,
          createdAt: f.createdAt,
        })),
      };
    }
    const result = await ctx.db
      .query("quizzes")
      .order("desc")
      .paginate({ ...args.paginationOpts, maximumBytesRead: 2_000_000 });
    return {
      ...result,
      page: result.page.map((q) => ({
        id: String(q._id),
        title: q.title,
        ownerId: q.creatorId,
        status: q.isPublished ? "live" : "draft",
        held: !!q.isBanned,
        responses: null,
        createdAt: q.createdAt,
      })),
    };
  },
});

async function audit(
  ctx: MutationCtx,
  action: string,
  target: string,
  reason: string,
) {
  const identity = await requireIdentity(ctx);
  await ctx.db.insert("adminAudit", {
    actorId: identity.subject,
    action,
    target,
    reason,
    createdAt: Date.now(),
  });
}
function reasonText(reason: string) {
  const text = reason.trim();
  if (!text || text.length > 500)
    throw new Error("Enter a reason between 1 and 500 characters.");
  return text;
}

export const moderateUser = mutation({
  args: {
    userId: v.id("users"),
    state: stateValidator,
    days: v.optional(v.number()),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const identity = await requireIdentity(ctx);
    const user = await ctx.db.get("users", args.userId);
    if (!user) throw new Error("User not found");
    if (user.clerkId === identity.subject && args.state !== "active")
      throw new Error("You cannot restrict your own admin account.");
    const reason = reasonText(args.reason);
    const days = args.days ?? 7;
    if (
      args.state === "suspended" &&
      (!Number.isInteger(days) || days < 1 || days > 365)
    )
      throw new Error("Suspensions must last 1–365 days.");
    const suspendedUntil =
      args.state === "suspended" ? Date.now() + days * DAY : undefined;
    await ctx.db.patch("users", user._id, {
      isBanned: args.state === "banned",
      suspendedUntil,
      moderationReason: reason,
    });
    if (suspendedUntil)
      await ctx.scheduler.runAt(
        suspendedUntil,
        internal.admin.expireSuspension,
        { userId: user._id, expiresAt: suspendedUntil },
      );
    await audit(ctx, `account_${args.state}`, user.clerkId, reason);
    return null;
  },
});

export async function grantPlan(
  ctx: MutationCtx,
  user: Doc<"users">,
  plan: "free" | "pro",
) {
  const planExpiresAt = plan === "pro" ? Date.now() + 30 * DAY : undefined;
  await ctx.db.patch("users", user._id, {
    plan,
    planExpiresAt,
    isElevated: plan === "pro",
  });
  if (planExpiresAt)
    await ctx.scheduler.runAt(planExpiresAt, internal.admin.expirePlan, {
      userId: user._id,
      expiresAt: planExpiresAt,
    });
}
export const setPlan = mutation({
  args: { userId: v.id("users"), plan: planValidator, reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get("users", args.userId);
    if (!user) throw new Error("User not found");
    const reason = reasonText(args.reason);
    await grantPlan(ctx, user, args.plan);
    await audit(ctx, `plan_${args.plan}`, user.clerkId, reason);
    return null;
  },
});
export const expirePlan = internalMutation({
  args: { userId: v.id("users"), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (
      user?.plan === "pro" &&
      user.planExpiresAt === args.expiresAt &&
      args.expiresAt <= Date.now()
    ) {
      await ctx.db.patch("users", user._id, {
        plan: "free",
        isElevated: false,
        planExpiresAt: undefined,
      });
      await ctx.db.insert("adminAudit", {
        actorId: "system",
        action: "plan_expired",
        target: user.clerkId,
        reason: "30-day grant ended",
        createdAt: Date.now(),
      });
    }
    return null;
  },
});
export const expireSuspension = internalMutation({
  args: { userId: v.id("users"), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (
      user?.suspendedUntil === args.expiresAt &&
      args.expiresAt <= Date.now()
    ) {
      await ctx.db.patch("users", user._id, { suspendedUntil: undefined });
      await ctx.db.insert("adminAudit", {
        actorId: "system",
        action: "suspension_expired",
        target: user.clerkId,
        reason: "Suspension ended",
        createdAt: Date.now(),
      });
    }
    return null;
  },
});
/** Retry overdue transitions after an interrupted scheduled job. */
export const sweepExpiries = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const plans = await ctx.db
      .query("users")
      .withIndex("by_planExpiresAt", (q) =>
        q.gt("planExpiresAt", 0).lte("planExpiresAt", now),
      )
      .take(100);
    const suspensions = await ctx.db
      .query("users")
      .withIndex("by_suspendedUntil", (q) =>
        q.gt("suspendedUntil", 0).lte("suspendedUntil", now),
      )
      .take(100);
    for (const user of plans)
      await ctx.runMutation(internal.admin.expirePlan, {
        userId: user._id,
        expiresAt: user.planExpiresAt!,
      });
    for (const user of suspensions)
      await ctx.runMutation(internal.admin.expireSuspension, {
        userId: user._id,
        expiresAt: user.suspendedUntil!,
      });
    if (plans.length === 100 || suspensions.length === 100)
      await ctx.scheduler.runAfter(0, internal.admin.sweepExpiries, {});
    return null;
  },
});

export const moderateContent = mutation({
  args: {
    targetId: v.union(v.id("forms"), v.id("quizzes")),
    hold: v.boolean(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const reason = reasonText(args.reason);
    const formId = ctx.db.normalizeId("forms", args.targetId);
    const quizId = ctx.db.normalizeId("quizzes", args.targetId);
    const item = formId
      ? await ctx.db.get("forms", formId)
      : quizId
        ? await ctx.db.get("quizzes", quizId)
        : null;
    if (!item) throw new Error("Content not found");
    if ("shareId" in item) {
      await authorDb(ctx).patch("forms", item._id, {
        isBanned: args.hold,
        ...(args.hold
          ? {
              status:
                item.publishedVersion === undefined
                  ? ("draft" as const)
                  : ("closed" as const),
            }
          : {}),
        updatedAt: Date.now(),
      });
    } else {
      await authorDb(ctx).patch("quizzes", item._id, {
        isBanned: args.hold,
        ...(args.hold ? { isPublished: false } : {}),
        updatedAt: Date.now(),
      });
    }
    await audit(
      ctx,
      args.hold ? "content_held" : "content_released",
      String(item._id),
      reason,
    );
    return null;
  },
});

export const activity = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.string(),
      actorId: v.string(),
      action: v.string(),
      target: v.string(),
      reason: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return (await ctx.db.query("adminAudit").order("desc").take(50)).map(
      (a) => ({
        id: String(a._id),
        actorId: a.actorId,
        action: a.action,
        target: a.target,
        reason: a.reason,
        createdAt: a.createdAt,
      }),
    );
  },
});

export const bulkPlan = mutation({
  args: {
    userIds: v.array(v.id("users")),
    plan: planValidator,
    reason: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const reason = reasonText(args.reason);
    const ids = [...new Set(args.userIds)];
    if (!ids.length || ids.length > 100)
      throw new Error("Select between 1 and 100 users per batch.");
    for (const id of ids) {
      const user = await ctx.db.get("users", id);
      if (!user)
        throw new Error("A selected user no longer exists. Refresh and retry.");
      await grantPlan(ctx, user, args.plan);
      await audit(ctx, `plan_${args.plan}`, user.clerkId, reason);
    }
    return ids.length;
  },
});
export const allUsersPlan = mutation({
  args: { plan: planValidator, reason: v.string() },
  returns: v.id("adminBulkJobs"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const identity = await requireIdentity(ctx);
    const reason = reasonText(args.reason);
    const jobId = await ctx.db.insert("adminBulkJobs", {
      actorId: identity.subject,
      plan: args.plan,
      reason,
      cutoff: Date.now(),
      processed: 0,
      done: false,
    });
    await ctx.scheduler.runAfter(0, internal.admin.applyAllUsersPlan, {
      jobId,
      cursor: null,
    });
    await audit(ctx, `bulk_plan_${args.plan}_started`, String(jobId), reason);
    return jobId;
  },
});
export const applyAllUsersPlan = internalMutation({
  args: { jobId: v.id("adminBulkJobs"), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("adminBulkJobs", args.jobId);
    if (!job || job.done) return null;
    const page = await ctx.db
      .query("users")
      .withIndex("by_creation_time", (q) => q.lte("_creationTime", job.cutoff))
      .paginate({ cursor: args.cursor, numItems: 50 });
    for (const user of page.page) {
      await grantPlan(ctx, user, job.plan);
      await ctx.db.insert("adminAudit", {
        actorId: job.actorId,
        action: `plan_${job.plan}`,
        target: user.clerkId,
        reason: job.reason,
        createdAt: Date.now(),
      });
    }
    await ctx.db.patch("adminBulkJobs", job._id, {
      processed: job.processed + page.page.length,
      done: page.isDone,
    });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.admin.applyAllUsersPlan, {
        jobId: job._id,
        cursor: page.continueCursor,
      });
    return null;
  },
});
export const bulkJob = query({
  args: { jobId: v.id("adminBulkJobs") },
  returns: v.union(
    v.null(),
    v.object({ processed: v.number(), done: v.boolean() }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const job = await ctx.db.get("adminBulkJobs", args.jobId);
    return job ? { processed: job.processed, done: job.done } : null;
  },
});

// ── Admin membership (Convex CLI / dashboard only) ───────────────────────────
// npx convex run --prod admin:grantAdmin '{"email":"you@example.com"}'
// The person must have signed in to Chaos once so their account exists.

export const grantAdmin = internalMutation({
  args: { email: v.string() },
  returns: v.object({ clerkId: v.string(), alreadyAdmin: v.boolean() }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!user)
      throw new Error(
        "USER_NOT_FOUND: Sign in to Chaos with this email once, then try again.",
      );
    const existing = await ctx.db
      .query("admins")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", user.clerkId))
      .first();
    if (existing) return { clerkId: user.clerkId, alreadyAdmin: true };
    await ctx.db.insert("admins", {
      clerkId: user.clerkId,
      email,
      grantedAt: Date.now(),
    });
    await ctx.db.insert("adminAudit", {
      actorId: "convex-cli",
      action: "grant_admin",
      target: user.clerkId,
      reason: email,
      createdAt: Date.now(),
    });
    return { clerkId: user.clerkId, alreadyAdmin: false };
  },
});

export const revokeAdmin = internalMutation({
  args: { email: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const rows = await ctx.db.query("admins").take(100);
    const matches = rows.filter((row) => row.email === email);
    for (const row of matches) {
      await ctx.db.delete("admins", row._id);
      await ctx.db.insert("adminAudit", {
        actorId: "convex-cli",
        action: "revoke_admin",
        target: row.clerkId,
        reason: email,
        createdAt: Date.now(),
      });
    }
    return matches.length;
  },
});
