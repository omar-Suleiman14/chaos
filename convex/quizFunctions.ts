/**
 * Accounts, admin switches and platform settings. (The name is historical: this module also held the
 * classic quiz editor and player, retired in favour of quiz forms; see convex/classicQuizMigration.ts.)
 */
import { getAuthIdentity } from "./authIdentity";
import { setOwnedUsername } from "./links";
import { reserveUsername, usernameOwner } from "./usernameModel";
import { internal } from "./_generated/api";
import { grantPlan, usersForActor } from "./admin";
import { paginationOptsValidator } from "convex/server";
import { isAdmin, requireAdmin, verifiedIdentityEmail } from "./authz";
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

// ============================================================
// USER FUNCTIONS
// ============================================================

/** Attach form invitations sent to this email before the person signed in. */
async function linkPendingInvites(ctx: MutationCtx, userId: string, email: string | undefined) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return;
  const invites = await ctx.db
    .query("formCollaborators")
    .withIndex("by_email", (q) => q.eq("email", normalized))
    .take(100);
  for (const invite of invites) {
    if (!invite.userId) await ctx.db.patch("formCollaborators", invite._id, { userId });
  }
}

export const getOrCreateUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) throw new Error("Not authenticated");
    await linkPendingInvites(ctx, identity.subject, verifiedIdentityEmail(identity));

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (existing) {
      // Authentication profile sync must not become a write bypass for a
      // moderated account. Banned creators keep read access to their data.
      if (existing.isBanned || existing.suspendedUntil) return existing._id;

      // Update fields if changed
      const updates: Record<string, unknown> = {};
      if (!existing.profileNameChosen && identity.name && identity.name !== existing.name) updates.name = identity.name;
      // The address and whether the provider verified it always change together.
      const emailVerified = verifiedIdentityEmail(identity) !== undefined;
      if (identity.email && (identity.email !== existing.email || existing.emailVerified !== emailVerified)) Object.assign(updates, { email: identity.email, emailVerified });
      if (identity.pictureUrl && identity.pictureUrl !== existing.imageUrl) updates.imageUrl = identity.pictureUrl;

      // Identity-provider sync must not rename public URLs or rewrite historical quizzes.
      await reserveUsername(ctx, existing.username, existing.clerkId);
      if (Object.keys(updates).length > 0) await ctx.db.patch("users", existing._id, updates);
      return existing._id;
    }

    return await insertNewUser(ctx, {
      clerkId: identity.subject,
      name: identity.nickname || identity.name || identity.givenName || "Anonymous",
      email: identity.email || "",
      emailVerified: verifiedIdentityEmail(identity) !== undefined,
      imageUrl: identity.pictureUrl,
    });
  },
});

/** First sign-in, from the web app or from a connected app such as ChatGPT. */
export async function insertNewUser(ctx: MutationCtx, profile: { clerkId: string; name: string; email: string; emailVerified: boolean; imageUrl?: string }) {
  const planExpiresAt = Date.now() + 30 * 86_400_000;
  let username = "";
  // Bounded retry; indexed reads participate in the transaction's uniqueness checks.
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = "user" + Math.floor(10000 + Math.random() * 90000);
    if (await usernameOwner(ctx, candidate) === null) { username = candidate; break; }
  }
  if (!username) throw new Error("USERNAME_UNAVAILABLE: Please retry account setup.");
  await reserveUsername(ctx, username, profile.clerkId);
  const userId = await ctx.db.insert("users", {
    clerkId: profile.clerkId,
    name: profile.name,
    email: profile.email,
    emailVerified: profile.emailVerified,
    username,
    imageUrl: profile.imageUrl,
    cardOnboardingPending: true,
    // Every new account receives one 30-day Pro trial.
    plan: "pro",
    planExpiresAt,
    isElevated: true,
    isBanned: false,
    createdAt: Date.now(),
  });
  await ctx.scheduler.runAt(planExpiresAt, internal.admin.expirePlan, { userId, expiresAt: planExpiresAt });
  return userId;
}

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
  },
});

export const setUsername = mutation({
  args: { username: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await setOwnedUsername(ctx, args);
    return true;
  },
});

// ============================================================
// ADMIN FUNCTIONS
// ============================================================

export const getIsAdmin = query({
  args: {},
  handler: async (ctx) => {
    // Presentation helper only. Every privileged operation still calls requireAdmin.
    return await isAdmin(ctx);
  },
});

/** Legacy admin names now share the bounded inventory and cached analytics paths. */
export const getAdminStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const snapshot = await ctx.db.query("adminMetrics").withIndex("by_key", q => q.eq("key", "platform")).unique();
    const ready = snapshot?.completedAt != null;
    return {
      totalUsers: ready ? snapshot.counts.users : null,
      totalQuizzes: ready ? snapshot.counts.quizzes : null,
      totalSubmissions: ready ? snapshot.counts.completedAttempts : null,
      activeToday: ready && !snapshot.running && new Date(snapshot.startedAt).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
        ? snapshot.counts.activeTodayQuizzes ?? null : null,
      completedAt: snapshot?.completedAt ?? null,
      refreshing: snapshot?.running ?? false,
    };
  },
});

const adminPageArgs = { paginationOpts: v.optional(paginationOptsValidator) };
function adminPage(options: { numItems: number; cursor: string | null } | undefined) {
  if (options && (!Number.isSafeInteger(options.numItems) || options.numItems < 1 || options.numItems > 50)) {
    throw new Error("Page size must be 1-50");
  }
  return options ?? { numItems: 25, cursor: null };
}
export const getAdminUsers = query({
  args: adminPageArgs,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return usersForActor(ctx, { paginationOpts: adminPage(args.paginationOpts) });
  },
});
export const adminToggleUserBan = mutation({
  args: { clerkId: v.string(), ban: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (user) {
      await ctx.db.patch("users", user._id, { isBanned: args.ban });
    }
  },
});

export const adminToggleUserElevation = mutation({
  args: { clerkId: v.string(), elevate: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (user) {
      // User elevation is manually granted by an administrator and removes response caps on the user's forms.
      await grantPlan(ctx, user, args.elevate ? "pro" : "free");
    }
  },
});

// ============================================================
// GLOBAL CONFIGURATION
// ============================================================

export const getGlobalConfig = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("globalConfig").first();
  },
});

export const updateGlobalConfig = mutation({
  args: {
    playerLimitErrorText: v.optional(v.string()),
    defaultMcqTimer: v.optional(v.number()),
    defaultWrittenTimer: v.optional(v.number()),
    defaultPointsPerQuestion: v.optional(v.number()),
    halfMarkThreshold: v.optional(v.number()),
    randomizeQuestions: v.optional(v.boolean()),
    randomizeOptions: v.optional(v.boolean()),
    showCorrectAnswers: v.optional(v.boolean()),
    showExplanations: v.optional(v.boolean()),
    displayMode: v.optional(v.string()),
    passingThreshold: v.optional(v.number()),
    disableAnimations: v.optional(v.boolean()),
    formResponseLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.formResponseLimit !== undefined && (!Number.isInteger(args.formResponseLimit) || args.formResponseLimit < 1)) {
      throw new Error("INVALID_CONFIG: The form response limit must be a whole number of at least 1.");
    }

    const existing = await ctx.db.query("globalConfig").first();
    if (existing) {
      await ctx.db.patch("globalConfig", existing._id, args);
    } else {
      await ctx.db.insert("globalConfig", args);
    }
  },
});
