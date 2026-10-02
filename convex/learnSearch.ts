import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { query } from "./_generated/server";
import { creatorRestricted } from "./authz";
import { lessonMeta } from "./learnModel";
export const searchHit = v.object({ lessonId: v.id("lessons"), versionId: v.id("lessonVersions"), metadata: lessonMeta, matchingBlocks: v.array(v.object({ id: v.string(), text: v.string() })) });
export const searchPublic = query({
  args: { text: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(searchHit),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) throw new Error("Search page size must be 1–100");
    const text = args.text.trim();
    if (!text || text.length > 200) throw new Error("Search text must contain 1–200 characters");
    const words = text.toLocaleLowerCase().split(/\s+/).filter(Boolean);

    // 1. Search full text index on lessons
    const result = await ctx.db.query("lessons").withSearchIndex("search_text", q => q.search("searchText", text).eq("visibility", "public").eq("communityState", "ok").eq("status", "active")).paginate(args.paginationOpts);

    const page: Array<{ lessonId: any; versionId: any; metadata: any; matchingBlocks: Array<{ id: string; text: string }> }> = [];
    const seenIds = new Set<string>();

    for (const lesson of result.page) {
      if (!lesson.publishedVersionId || await creatorRestricted(ctx, lesson.ownerId)) continue;
      const version = await ctx.db.get("lessonVersions", lesson.publishedVersionId);
      if (!version || version.lessonId !== lesson._id || (version.visibility !== undefined && version.visibility !== "public")) continue;
      seenIds.add(lesson._id);
      const matchingBlocks = version.document.blocks.filter(b => "text" in b && words.some(w => b.text.toLocaleLowerCase().includes(w))).slice(0, 5).map(b => ({ id: b.id, text: "text" in b ? b.text.slice(0, 300) : "" }));
      page.push({ lessonId: lesson._id, versionId: version._id, metadata: version.metadata, matchingBlocks });
    }

    // 2. Also search authors by name or username (e.g. typing "omar" finds Omar Suleiman's lessons)
    if (page.length < args.paginationOpts.numItems) {
      const allUsers = await ctx.db.query("users").take(100);
      const matchingUsers = allUsers.filter((u) => {
        const authorStr = `${u.name} ${u.username}`.toLocaleLowerCase();
        return words.some((w) => authorStr.includes(w));
      });

      for (const u of matchingUsers) {
        if (page.length >= args.paginationOpts.numItems) break;
        if (await creatorRestricted(ctx, u.clerkId)) continue;
        const authorLessons = await ctx.db
          .query("lessons")
          .withIndex("by_ownerId_and_visibility_and_communityState_and_status", (q) =>
            q.eq("ownerId", u.clerkId).eq("visibility", "public").eq("communityState", "ok").eq("status", "active")
          )
          .take(args.paginationOpts.numItems - page.length);

        for (const lesson of authorLessons) {
          if (seenIds.has(lesson._id) || !lesson.publishedVersionId) continue;
          const version = await ctx.db.get("lessonVersions", lesson.publishedVersionId);
          if (!version || version.lessonId !== lesson._id || (version.visibility !== undefined && version.visibility !== "public")) continue;
          seenIds.add(lesson._id);
          page.push({ lessonId: lesson._id, versionId: version._id, metadata: version.metadata, matchingBlocks: [] });
          if (page.length >= args.paginationOpts.numItems) break;
        }
      }
    }

    return { ...result, page };
  },
});
