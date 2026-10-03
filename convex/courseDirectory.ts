import { authorDb } from "./authorIndex";
import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { creatorRestricted } from "./authz";
import { courseSearchText } from "./courseSearchModel";
const card = v.object({
  id: v.id("learnCollections"),
  title: v.string(),
  description: v.string(),
  coverUrl: v.optional(v.string()),
  icon: v.optional(v.string()),
  language: v.string(),
  tags: v.array(v.string()),
  lessons: v.number(),
  ownerName: v.string(),
  ownerUsername: v.string(),
  updatedAt: v.number(),
});
export const browse = query({
  args: {
    text: v.optional(v.string()),
    language: v.optional(v.string()),
    topic: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("recent"), v.literal("relevant"))),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(card),
  handler: async (ctx, args) => {
    if (
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 48 ||
      (args.text?.length ?? 0) > 200
    )
      throw new Error("Invalid directory request");
    const text = args.text?.trim();
    const result = text
      ? await ctx.db
          .query("learnCollections")
          .withSearchIndex("search_public", (q) =>
            q
              .search("searchText", text)
              .eq("visibility", "public")
              .eq("communityState", "ok"),
          )
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("learnCollections")
          .withIndex("by_visibility_and_updatedAt", (q) =>
            q.eq("visibility", "public"),
          )
          .order("desc")
          .paginate(args.paginationOpts);
    const page = [];
    for (const row of result.page) {
      if (
        !row.publishedVersionId ||
        row.archived ||
        row.communityState !== "ok" ||
        (await creatorRestricted(ctx, row.ownerId))
      )
        continue;
      const version = await ctx.db.get(
        "collectionVersions",
        row.publishedVersionId,
      );
      if (!version || version.collectionId !== row._id) continue;
      const m = version.metadata;
      if (
        (args.language && args.language !== m.language) ||
        (args.topic && !m.tags.includes(args.topic))
      )
        continue;
      const owner = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", row.ownerId))
        .unique();
      page.push({
        id: row._id,
        title: m.title,
        description: m.description,
        coverUrl: m.coverUrl,
        icon: m.icon,
        language: m.language,
        tags: m.tags,
        lessons: version.items.filter((i) => i.kind === "lesson").length,
        ownerName: owner?.name ?? "Chaos creator",
        ownerUsername: owner?.username ?? "",
        updatedAt: version.publishedAt,
      });
    }
    return { ...result, page };
  },
});
/** Idempotent bounded migration: indexes published snapshots without changing content. */
export const backfill = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const batch = await ctx.db
      .query("learnCollections")
      .paginate({ numItems: 20, cursor: args.cursor ?? null });
    for (const row of batch.page)
      if (row.publishedVersionId) {
        const version = await ctx.db.get(
          "collectionVersions",
          row.publishedVersionId,
        );
        if (version?.collectionId === row._id)
          await authorDb(ctx).patch("learnCollections", row._id, {
            searchText: await courseSearchText(
              ctx,
              row.ownerId,
              version.metadata,
              version.items,
            ),
          });
      }
    if (!batch.isDone)
      await ctx.scheduler.runAfter(0, internal.courseDirectory.backfill, {
        cursor: batch.continueCursor,
      });
    return null;
  },
});
