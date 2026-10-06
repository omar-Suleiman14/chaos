import { v } from "convex/values";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getAuthIdentity } from "./authIdentity";
import { requireAdmin } from "./authz";
import { defaultFlags, evaluateFlag, FLAG_KEYS, isFlagKey, type FlagKey } from "../lib/flags";

/** One indexed read per declared flag; the registry is small and fixed (lib/flags.ts). */
async function rolloutOf(ctx: QueryCtx | MutationCtx, key: FlagKey) {
  return ctx.db.query("featureRollouts").withIndex("by_key", (q) => q.eq("key", key)).unique();
}

async function evaluateAll(ctx: QueryCtx, userId: string | null) {
  const flags = defaultFlags();
  for (const key of FLAG_KEYS) flags[key] = evaluateFlag(key, await rolloutOf(ctx, key), userId);
  return flags;
}

const flagValues = v.record(v.string(), v.boolean());

/** Every flag's value for the signed-in person (defaults when signed out). One subscription per page via useFlag. */
export const mine = query({
  args: {},
  returns: flagValues,
  handler: async (ctx) => evaluateAll(ctx, (await getAuthIdentity(ctx))?.subject ?? null),
});

/** For backend paths that act for a verified user id, such as the MCP handlers. */
export const forUser = internalQuery({
  args: { userId: v.string() },
  returns: flagValues,
  handler: async (ctx, args) => evaluateAll(ctx, args.userId),
});

/** In a query or mutation that already knows the acting user. */
export async function flagEnabled(ctx: QueryCtx | MutationCtx, key: FlagKey, userId: string | null): Promise<boolean> {
  return evaluateFlag(key, await rolloutOf(ctx, key), userId);
}

export const list = query({
  args: {},
  returns: v.array(v.object({ key: v.string(), percent: v.union(v.number(), v.null()), allow: v.number(), updatedAt: v.union(v.number(), v.null()) })),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const out = [];
    for (const key of FLAG_KEYS) {
      const row = await rolloutOf(ctx, key);
      out.push({ key, percent: row?.percent ?? null, allow: row?.allow.length ?? 0, updatedAt: row?.updatedAt ?? null });
    }
    return out;
  },
});

/**
 * Sets a flag's rollout: a percentage of signed-in accounts (stable buckets) and an allow list.
 * `null` removes the rollout so the flag returns to its default.
 */
export const setRollout = mutation({
  args: { key: v.string(), rollout: v.union(v.null(), v.object({ percent: v.number(), allow: v.optional(v.array(v.string())) })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const identity = (await getAuthIdentity(ctx))!;
    if (!isFlagKey(args.key)) throw new Error(`UNKNOWN_FLAG: ${args.key} is not declared in lib/flags.ts.`);
    const existing = await rolloutOf(ctx, args.key);
    if (args.rollout === null) {
      if (existing) await ctx.db.delete("featureRollouts", existing._id);
      return null;
    }
    const { percent } = args.rollout;
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new Error("VALIDATION_FAILED: percent must be a whole number from 0 to 100.");
    const allow = [...new Set(args.rollout.allow ?? existing?.allow ?? [])].slice(0, 200);
    const row = { key: args.key, percent, allow, updatedAt: Date.now(), updatedBy: identity.subject };
    if (existing) await ctx.db.replace("featureRollouts", existing._id, row);
    else await ctx.db.insert("featureRollouts", row);
    return null;
  },
});

/** Rows whose flag was removed from lib/flags.ts: obsolete rollout metadata, swept by maintenance:sweep. */
export async function sweepObsoleteRollouts(ctx: MutationCtx, limit: number): Promise<number> {
  const rows = await ctx.db.query("featureRollouts").take(limit + 50);
  let removed = 0;
  for (const row of rows) {
    if (isFlagKey(row.key) || removed >= limit) continue;
    await ctx.db.delete("featureRollouts", row._id);
    removed++;
  }
  return removed;
}
