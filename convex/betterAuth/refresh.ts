import { mutationGeneric } from "convex/server";
import { v } from "convex/values";

/**
 * Compare-and-set refresh revocation in one Convex transaction. Public within the component so the app can
 * call it (components.betterAuth.refresh.claim): a component's internal functions aren't reachable from the
 * app, and its public ones aren't reachable from clients.
 */
export const claim = mutationGeneric({
  args: { id: v.id("oauthRefreshToken"), revokedAt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { id, revokedAt }) => {
    const token = await ctx.db.get("oauthRefreshToken", id);
    if (!token || token.revoked != null) return false;
    await ctx.db.patch("oauthRefreshToken", id, { revoked: revokedAt });
    return true;
  },
});
