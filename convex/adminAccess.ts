import { requireAdmin, requireIdentity } from "./authz";
import { requireLearnActor } from "./mcpLearn";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/** actorId is supplied only by internal MCP adapters after transport verification. */
export async function requireAdminForActor(ctx: QueryCtx | MutationCtx, actorId?: string) {
  if (actorId === undefined) return requireAdmin(ctx);
  await requireLearnActor(ctx, actorId);
  const admin = await ctx.db.query("admins").withIndex("by_clerkId", q => q.eq("clerkId", actorId)).first();
  if (!admin) throw new Error("FORBIDDEN: Admin access required.");
}

export async function adminIdentity(ctx: QueryCtx | MutationCtx, actorId?: string) {
  if (actorId === undefined) return requireIdentity(ctx);
  await requireAdminForActor(ctx, actorId);
  return { subject: actorId };
}
