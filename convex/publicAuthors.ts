import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireActiveUser } from "./authz";
import { internal } from "./_generated/api";
import { authorTables, syncAuthorAsset } from "./authorIndex";
import { avatarSeed } from "../lib/avatarSeed";

const card = v.object({ name: v.string(), username: v.string(), seed: v.string(), memberSince: v.number(), style: v.number() });
export const browse = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(card),
  handler: async (ctx, { paginationOpts }) => {
    if (paginationOpts.numItems < 1 || paginationOpts.numItems > 48) throw new Error("Invalid author page size");
    const result = await ctx.db.query("users").withIndex("by_publicAuthorAssets", q => q.gt("publicAuthorAssets", 0)).order("desc").paginate(paginationOpts);
    return { ...result, page: result.page.filter(user => !user.hideFromAuthorLists && !user.isBanned && !user.suspendedUntil && /^[a-z0-9][a-z0-9_.-]{2,63}$/.test(user.username)).map(user => ({ name: user.name, username: user.username, seed: avatarSeed(user.clerkId), memberSince: user.createdAt, style: user.cardStyle ?? 0 })) };
  },
});

/** Persist only the authenticated person's directory preference. */
export const setListingVisibility = mutation({
  args: { visible: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await requireActiveUser(ctx);
    if (!user) throw new Error("ACCOUNT_REQUIRED: Finish signing in first.");
    await ctx.db.patch("users", user._id, { hideFromAuthorLists: !args.visible });
    return null;
  },
});

/** Bounded, restartable import of the existing public publications. */
export const backfill = internalMutation({
  args: { phase: v.optional(v.number()), cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const phase = args.phase ?? 0;
    const table = authorTables[phase];
    if (!table) return null;
    const result = await ctx.db.query(table).paginate({ cursor: args.cursor ?? null, numItems: 20 });
    for (const row of result.page) await syncAuthorAsset(ctx, table, row._id);
    if (!result.isDone) await ctx.scheduler.runAfter(0, internal.publicAuthors.backfill, { phase, cursor: result.continueCursor });
    else if (phase + 1 < authorTables.length) await ctx.scheduler.runAfter(0, internal.publicAuthors.backfill, { phase: phase + 1 });
    return null;
  },
});
