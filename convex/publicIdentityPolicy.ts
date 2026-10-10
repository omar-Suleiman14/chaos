import type { QueryCtx } from "./_generated/server";
import { creatorRestricted } from "./authz";
import { canonicalCommunityActor } from "./learnCommunityIntegrations";

/** Internal facts only; callers project their existing public payload and never expose claim evidence. */
export async function publicIdentityFacts(ctx: QueryCtx, username: string) {
  if (!username || username.length > 100) return null;
  const user = await ctx.db.query("users").withIndex("by_username", q => q.eq("username", username)).unique();
  if (!user || await creatorRestricted(ctx, user.clerkId)) return null;
  const userKey = (await canonicalCommunityActor(ctx, user.clerkId)).tokenIdentifier;
  const claims = await ctx.db.query("learnIdentityClaims").withIndex("by_userKey_and_role", q => q.eq("userKey", userKey)).take(2);
  const verified = claims.filter(c => c.status === "verified" && c.method === "manual_review" && !!c.reviewedBy && (c.expiresAt ?? 0) > Date.now());
  return { user, verified };
}
