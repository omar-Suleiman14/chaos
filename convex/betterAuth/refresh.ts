import { internalMutationGeneric } from "convex/server";
import { v } from "convex/values";

/** Compare-and-set refresh revocation in one Convex transaction. */
export const claim = internalMutationGeneric({
  args: { id: v.id("oauthRefreshToken"), revokedAt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { id, revokedAt }) => {
    const token = await ctx.db.get("oauthRefreshToken", id);
    if (!token || token.revoked != null) return false;
    await ctx.db.patch("oauthRefreshToken", id, { revoked: revokedAt });
    return true;
  },
});
