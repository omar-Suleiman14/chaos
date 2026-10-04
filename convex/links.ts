import { getAuthIdentity } from "./authIdentity";
import { authorDb } from "./authorIndex";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { userByUsername, reserveUsername } from "./usernameModel";
import { requireActiveUser, requireFormRole } from "./authz";

/**
 * Custom links: chaos.fail/<username>/<slug>. Every form keeps its /f/<shareId>
 * link; a custom link is an optional second address the owner chooses. Links
 * resolve through permanent username reservations to the same owner after renames.
 */

/** First path segments the app already uses, so no username can shadow a page. */
const RESERVED = new Set([
  "ai", "forms-quizzes", "live-games", "open-source", "status", "changelog", "admin", "api", "app", "auth", "compare", "copyright", "faq", "dashboard", "f", "help", "login", "logout", "privacy", "settings", "sign-in", "sign-up",
  "signin", "signup", "static", "support", "terms", "_next", "favicon.ico", "icon.svg", "robots.txt", "sitemap.xml",
  "mcp", "print", "opengraph-image", "chatgpt", "connect", "play", "learn", "homework", "card", "docs", "pricing", "courses",
]);
const USERNAME = /^[a-z0-9][a-z0-9_.-]{2,29}$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
/** Usernames Chaos generated at sign-up; the owner hasn't picked these. */
const GENERATED = /^user\d{5}$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "");
}
export function normalizeSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}
export function usernameProblem(username: string): string | null {
  if (!USERNAME.test(username)) return "Use 3–30 letters, numbers, dots, dashes or underscores, starting with a letter or number.";
  if (RESERVED.has(username) || GENERATED.test(username)) return "That username is reserved. Try another.";
  return null;
}

/** The signed-in person's username, and whether they have chosen it yet. */
export const getMyLinkIdentity = query({
  args: {},
  returns: v.union(v.null(), v.object({ username: v.string(), chosen: v.boolean() })),
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return null;
    const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject)).first();
    if (!user) return null;
    return { username: user.username, chosen: user.usernameChosen === true || !GENERATED.test(user.username) };
  },
});

/** Pick the username used in custom links (and old quiz links). */
export const chooseUsername = mutation({
  args: { username: v.string() },
  returns: v.string(),
  handler: setOwnedUsername,
});

/** Shared by both native username mutations; no caller-supplied owner identity. */
export async function setOwnedUsername(ctx: MutationCtx, args: { username: string }): Promise<string> {
    const { identity, user } = await requireActiveUser(ctx);
    if (!user) throw new Error("USER_NOT_FOUND: Sign in again and retry.");
    // Reject invalid input rather than silently stripping characters.
    const username = args.username.trim().toLowerCase();
    const problem = usernameProblem(username);
    if (problem) throw new Error(`INVALID_USERNAME: ${problem}`);
    // Both reservations and the profile change commit in the same transaction.
    await reserveUsername(ctx, user.username, identity.subject);
    await reserveUsername(ctx, username, identity.subject);
    await ctx.db.patch("users", user._id, { username, usernameChosen: true });
    // Legacy quizzes keep their original routing username and creator ID.
    return username;
}

/** Set or clear a form's custom link. Owner only; needs a chosen username. */
export const setFormSlug = mutation({
  args: { formId: v.id("forms"), slug: v.union(v.string(), v.null()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const { form, user } = await requireFormRole(ctx, args.formId, "owner").then(async (access) => ({
      ...access,
      user: await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", access.identity.subject)).first(),
    }));
    if (args.slug === null) {
      await authorDb(ctx).patch("forms", form._id, { slug: undefined, updatedAt: Date.now() });
      return null;
    }
    if (!user || (user.usernameChosen !== true && GENERATED.test(user.username))) {
      throw new Error("USERNAME_REQUIRED: Choose your username first.");
    }
    const slug = normalizeSlug(args.slug);
    if (!SLUG.test(slug)) throw new Error("INVALID_SLUG: Use letters, numbers and dashes.");
    const clash = await ctx.db.query("forms").withIndex("by_ownerId_and_slug", (q) => q.eq("ownerId", form.ownerId).eq("slug", slug)).first();
    if (clash && clash._id !== form._id) throw new Error("SLUG_TAKEN: Another of your forms already uses that link.");
    const quiz = await ctx.db.query("quizzes").withIndex("by_creator_slug", (q) => q.eq("creatorUsername", user.username).eq("slug", slug)).first();
    if (quiz) throw new Error("SLUG_TAKEN: One of your older quizzes already uses that link.");
    await authorDb(ctx).patch("forms", form._id, { slug, updatedAt: Date.now() });
    return slug;
  },
});

/** chaos.fail/<username>/<slug> → the form's share id, or null (old quizzes use the same address). */
export const resolveLink = query({
  args: { username: v.string(), slug: v.string() },
  returns: v.union(v.null(), v.object({ shareId: v.string() })),
  handler: async (ctx, args) => {
    const user = await userByUsername(ctx, args.username.toLowerCase());
    if (!user) return null;
    // A form created later must never shadow an existing classic quiz URL.
    const quiz = await ctx.db.query("quizzes").withIndex("by_creator_slug", (q) => q.eq("creatorUsername", args.username.toLowerCase()).eq("slug", args.slug.toLowerCase())).first();
    if (quiz) return null;
    const form = await ctx.db.query("forms").withIndex("by_ownerId_and_slug", (q) => q.eq("ownerId", user.clerkId).eq("slug", args.slug.toLowerCase())).first();
    return form ? { shareId: form.shareId } : null;
  },
});

/** Release migration: call each phase with the returned cursor until done. No deployment side effects. */
export const backfillUsernameAliases = internalMutation({
  args: { phase: v.union(v.literal("users"), v.literal("quizzes")), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ cursor: v.string(), done: v.boolean(), processed: v.number() }),
  handler: async (ctx, args) => {
    const page = args.phase === "users"
      ? await ctx.db.query("users").withIndex("by_username").paginate({ cursor: args.cursor, numItems: 100 })
      : await ctx.db.query("quizzes").withIndex("by_creator_slug").paginate({ cursor: args.cursor, numItems: 100 });
    for (const row of page.page) {
      if ("clerkId" in row) await reserveUsername(ctx, row.username, row.clerkId);
      else await reserveUsername(ctx, row.creatorUsername, row.creatorId);
    }
    return { cursor: page.continueCursor, done: page.isDone, processed: page.page.length };
  },
});
