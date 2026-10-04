import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireLearnActor } from "./mcpLearn";
import { browsePublicAuthors } from "./publicAuthors";
import { readPublicCard } from "./memberCards";
import { pageFor } from "./studentRoster";
import { userByUsername } from "./usernameModel";

const actor = { userId: v.string() };
const page = { cursor: v.optional(v.string()), limit: v.optional(v.number()) };
function pagination(
  args: { cursor?: string; limit?: number },
  fallback: number,
) {
  const numItems = args.limit ?? fallback;
  if (
    !Number.isSafeInteger(numItems) ||
    numItems < 1 ||
    numItems > 48 ||
    (args.cursor?.length ?? 0) > 4096
  )
    throw new Error("VALIDATION_FAILED: Invalid pagination.");
  return { numItems, cursor: args.cursor ?? null };
}
export const authors = internalQuery({
  args: { ...actor, ...page },
  handler: async (ctx, args) => {
    await requireLearnActor(ctx, args.userId);
    return browsePublicAuthors(ctx, pagination(args, 24));
  },
});
export const card = internalQuery({
  args: { ...actor, username: v.string() },
  handler: async (ctx, args) => {
    await requireLearnActor(ctx, args.userId);
    return { card: await readPublicCard(ctx, args.username) };
  },
});
export const students = internalQuery({
  args: { ...actor, ...page, username: v.string() },
  handler: async (ctx, args) => {
    await requireLearnActor(ctx, args.userId);
    const opts = pagination(args, 8);
    const author = await userByUsername(
      ctx,
      args.username.trim().toLowerCase(),
    );
    if (!author || author.isBanned || author.suspendedUntil)
      return { page: [], isDone: true, continueCursor: "" };
    return pageFor(ctx, author.clerkId, opts, true);
  },
});
export const visibility = internalQuery({
  args: { ...actor, username: v.string() },
  handler: async (ctx, args) => {
    await requireLearnActor(ctx, args.userId);
    const author = await userByUsername(
      ctx,
      args.username.trim().toLowerCase(),
    );
    const row = author
      ? await ctx.db
          .query("authorStudents")
          .withIndex("by_author_key", (q) =>
            q.eq("authorId", author.clerkId).eq("key", `user:${args.userId}`),
          )
          .unique()
      : null;
    return { visible: row?.publicVisible ?? null };
  },
});
export const listing = internalMutation({
  args: { ...actor, visible: v.boolean() },
  handler: async (ctx, args) => {
    await requireLearnActor(ctx, args.userId);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.userId))
      .unique();
    if (!user) throw new Error("ACCOUNT_REQUIRED: Sign in first.");
    await ctx.db.patch("users", user._id, {
      hideFromAuthorLists: !args.visible,
    });
    return { ok: true };
  },
});
