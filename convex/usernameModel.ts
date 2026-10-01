import type { MutationCtx, QueryCtx } from "./_generated/server";

type ReadCtx = QueryCtx | MutationCtx;

export function lookupUsername(value: string): string | null {
  const username = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username) ? username : null;
}

/** Constant-size indexed reads; current users and legacy quiz routes protect pre-migration names. */
export async function usernameOwner(ctx: ReadCtx, username: string): Promise<string | null> {
  const alias = await ctx.db.query("usernameAliases").withIndex("by_username", (q) => q.eq("username", username)).unique();
  const users = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", username)).take(2);
  if (users.length > 1) throw new Error("USERNAME_CONFLICT: This legacy username has conflicting owners.");
  const legacy = await ctx.db.query("quizzes").withIndex("by_creator_slug", (q) => q.eq("creatorUsername", username)).first();
  const owners = [alias?.ownerId, users[0]?.clerkId, legacy?.creatorId].filter((id): id is string => id !== undefined);
  if (owners.some((id) => id !== owners[0])) throw new Error("USERNAME_CONFLICT: This legacy username has conflicting owners.");
  return owners[0] ?? null;
}

/** A missing/deleted owner never frees the name; reservations are direct, not redirect chains. */
export async function reserveUsername(ctx: MutationCtx, username: string, ownerId: string): Promise<void> {
  const owner = await usernameOwner(ctx, username);
  if (owner !== null && owner !== ownerId) throw new Error("USERNAME_TAKEN: That username belongs to another account.");
  const existing = await ctx.db.query("usernameAliases").withIndex("by_username", (q) => q.eq("username", username)).unique();
  if (!existing) await ctx.db.insert("usernameAliases", { username, ownerId, createdAt: Date.now() });
}

export async function userByUsername(ctx: ReadCtx, value: string) {
  const username = lookupUsername(value);
  if (!username) return null;
  const ownerId = await usernameOwner(ctx, username);
  if (!ownerId) return null;
  return ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", ownerId)).unique();
}
