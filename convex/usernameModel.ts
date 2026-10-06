import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type ReadCtx = QueryCtx | MutationCtx;

const DAY_MS = 86_400_000;
/** Username changes allowed per account within the window. */
export const USERNAME_CHANGE_LIMIT = 5;
export const USERNAME_CHANGE_WINDOW_MS = 30 * DAY_MS;
/** A name left behind that never appeared in a public link still points to its owner this long. */
export const RELEASED_ALIAS_GRACE_MS = 30 * DAY_MS;
/** Old names kept permanently per account (the current name is not counted). */
export const MAX_RETAINED_ALIASES = 10;

const live = (alias: Doc<"usernameAliases"> | null, now: number) => alias && (alias.expiresAt === undefined || alias.expiresAt > now) ? alias : null;

export function lookupUsername(value: string): string | null {
  const username = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username) ? username : null;
}

/** Constant-size indexed reads; current users and legacy quiz routes protect pre-migration names. */
export async function usernameOwner(ctx: ReadCtx, username: string): Promise<string | null> {
  const alias = live(await ctx.db.query("usernameAliases").withIndex("by_username", (q) => q.eq("username", username)).unique(), Date.now());
  const users = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", username)).take(2);
  if (users.length > 1) throw new Error("USERNAME_CONFLICT: This legacy username has conflicting owners.");
  const legacy = await ctx.db.query("quizzes").withIndex("by_creator_slug", (q) => q.eq("creatorUsername", username)).first();
  const owners = [alias?.ownerId, users[0]?.clerkId, legacy?.creatorId].filter((id): id is string => id !== undefined);
  if (owners.some((id) => id !== owners[0])) throw new Error("USERNAME_CONFLICT: This legacy username has conflicting owners.");
  return owners[0] ?? null;
}

/**
 * A missing/deleted owner never frees the name; reservations are direct, not redirect chains.
 * Reserving a name makes it permanent again for its owner, and takes over an expired alias.
 */
export async function reserveUsername(ctx: MutationCtx, username: string, ownerId: string): Promise<void> {
  const owner = await usernameOwner(ctx, username);
  if (owner !== null && owner !== ownerId) throw new Error("USERNAME_TAKEN: That username belongs to another account.");
  const existing = await ctx.db.query("usernameAliases").withIndex("by_username", (q) => q.eq("username", username)).unique();
  if (!existing) await ctx.db.insert("usernameAliases", { username, ownerId, createdAt: Date.now() });
  else if (existing.ownerId !== ownerId) await ctx.db.replace("usernameAliases", existing._id, { username, ownerId, createdAt: Date.now() });
  else if (existing.expiresAt !== undefined) await ctx.db.patch("usernameAliases", existing._id, { expiresAt: undefined });
}

/**
 * True when `username` appeared in a public link of this account: a form custom link
 * (chaos.fail/<username>/<slug>), a classic quiz route, or the public author listing.
 */
async function usedInPublicLinks(ctx: ReadCtx, user: Doc<"users">, username: string): Promise<boolean> {
  if ((user.publicAuthorAssets ?? 0) > 0) return true;
  const slugged = await ctx.db.query("forms").withIndex("by_ownerId_and_slug", (q) => q.eq("ownerId", user.clerkId).gt("slug", "")).first();
  if (slugged) return true;
  return (await ctx.db.query("quizzes").withIndex("by_creator_slug", (q) => q.eq("creatorUsername", username)).first()) !== null;
}

/**
 * Moves an account to a new username. Old names that were used in public links stay reserved
 * for good, up to MAX_RETAINED_ALIASES; any other old name keeps pointing to the account for
 * RELEASED_ALIAS_GRACE_MS and is then released (crons.cleanup). Changes are rate limited, so
 * nobody can walk alice → alice2 → alice3 … and hold the namespace.
 */
export async function changeUsername(ctx: MutationCtx, user: Doc<"users">, next: string): Promise<Partial<Doc<"users">>> {
  if (next === user.username) return {};
  const now = Date.now();
  const recent = await ctx.db.query("usernameChanges")
    .withIndex("by_ownerId_and_at", (q) => q.eq("ownerId", user.clerkId).gt("at", now - USERNAME_CHANGE_WINDOW_MS)).take(USERNAME_CHANGE_LIMIT);
  if (recent.length >= USERNAME_CHANGE_LIMIT) {
    const retry = new Date(recent[0].at + USERNAME_CHANGE_WINDOW_MS).toISOString().slice(0, 10);
    throw new Error(`USERNAME_CHANGE_LIMIT: You can change your username ${USERNAME_CHANGE_LIMIT} times in 30 days. Try again on ${retry}.`);
  }
  const pinned = await usedInPublicLinks(ctx, user, user.username);
  if (pinned) {
    const owned = await ctx.db.query("usernameAliases").withIndex("by_ownerId", (q) => q.eq("ownerId", user.clerkId)).take(MAX_RETAINED_ALIASES + 2);
    const retained = owned.filter((a) => a.expiresAt === undefined && a.username !== user.username && a.username !== next);
    if (retained.length >= MAX_RETAINED_ALIASES) {
      throw new Error(`USERNAME_ALIAS_LIMIT: This account already keeps ${MAX_RETAINED_ALIASES} earlier usernames for its links. Switch back to one of them instead.`);
    }
  }
  // Both reservations and the profile change commit in the same transaction.
  await reserveUsername(ctx, user.username, user.clerkId);
  await reserveUsername(ctx, next, user.clerkId);
  if (!pinned) {
    const old = await ctx.db.query("usernameAliases").withIndex("by_username", (q) => q.eq("username", user.username)).unique();
    if (old) await ctx.db.patch("usernameAliases", old._id, { expiresAt: now + RELEASED_ALIAS_GRACE_MS });
  }
  await ctx.db.insert("usernameChanges", { ownerId: user.clerkId, at: now });
  return { username: next, usernameChosen: true };
}

/** Change records older than the rate-limit window; they no longer count for anything. */
export async function pruneUsernameChanges(ctx: MutationCtx, limit: number): Promise<number> {
  const old = await ctx.db.query("usernameChanges").withIndex("by_at", (q) => q.lt("at", Date.now() - USERNAME_CHANGE_WINDOW_MS)).take(limit);
  for (const row of old) await ctx.db.delete("usernameChanges", row._id);
  return old.length;
}

/** Releases expired aliases nobody holds any more; returns how many were removed. */
export async function releaseExpiredAliases(ctx: MutationCtx, limit: number): Promise<number> {
  const now = Date.now();
  const expired = await ctx.db.query("usernameAliases").withIndex("by_expiresAt", (q) => q.gt("expiresAt", 0).lt("expiresAt", now)).take(limit);
  for (const alias of expired) {
    // Never release a name an account still uses (the alias was reserved again since).
    const holder = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", alias.username)).first();
    if (holder) await ctx.db.patch("usernameAliases", alias._id, { expiresAt: undefined });
    else await ctx.db.delete("usernameAliases", alias._id);
  }
  return expired.length;
}

export async function userByUsername(ctx: ReadCtx, value: string) {
  const username = lookupUsername(value);
  if (!username) return null;
  const ownerId = await usernameOwner(ctx, username);
  if (!ownerId) return null;
  return ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", ownerId)).unique();
}
