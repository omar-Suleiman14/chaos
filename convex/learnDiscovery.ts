import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { creatorRestricted } from "./authz";

const kind = v.union(v.literal("institution"), v.literal("program"), v.literal("module"), v.literal("creator"), v.literal("tag"));
export const directoryHit = v.object({ kind, id: v.string(), name: v.string(), parentId: v.union(v.string(), v.null()) });

/** Indexed catalog discovery. Creator matching uses public username prefixes, not a global
 * full-text index. Empty pages can have a continuation cursor. Creator/tag
 * discovery is based exclusively on current public published lessons.
 */
export const search = query({
  args: { kind, creatorMatch: v.optional(v.union(v.literal("username"), v.literal("name"))), text: v.string(), institutionId: v.optional(v.id("curriculumInstitutions")), versionId: v.optional(v.id("curriculumVersions")), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(directoryHit),
  handler: async (ctx, args) => {
    const text = args.text.normalize("NFKC").trim().toLowerCase();
    if (!text || text.length > 200) throw new Error("Search text must contain 1–200 characters");
    if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 25) throw new Error("Page size must be 1–25");
    // Reject reactive range expansion: each request must scan a fixed bounded page.
    if (args.paginationOpts.endCursor !== undefined) throw new Error("Discovery does not support endCursor");
    if ((args.institutionId !== undefined && args.kind !== "program") || (args.versionId !== undefined && args.kind !== "module")) throw new Error("Filter does not apply to this entity kind");
    if (args.creatorMatch !== undefined && args.kind !== "creator") throw new Error("creatorMatch applies only to creators");
    const matches = (name: string) => name.normalize("NFKC").toLowerCase().includes(text);
    if (args.kind === "institution") {
      const result = await ctx.db.query("curriculumInstitutions").withSearchIndex("search_name", q => q.search("name", text)).paginate(args.paginationOpts);
      return { ...result, page: result.page.map(row => ({ kind: "institution" as const, id: row._id, name: row.name, parentId: null })) };
    }
    if (args.kind === "program") {
      const result = await ctx.db.query("curriculumPrograms").withSearchIndex("search_name", q => args.institutionId ? q.search("name", text).eq("institutionId", args.institutionId) : q.search("name", text)).paginate(args.paginationOpts);
      const page = [];
      for (const row of result.page) if (await ctx.db.get("curriculumInstitutions", row.institutionId)) page.push({ kind: "program" as const, id: row._id, name: row.name, parentId: row.institutionId });
      return { ...result, page };
    }
    if (args.kind === "module") {
      const result = await ctx.db.query("curriculumNodes").withSearchIndex("search_name", q => args.versionId ? q.search("name", text).eq("versionId", args.versionId) : q.search("name", text)).paginate(args.paginationOpts);
      const page = [];
      for (const row of result.page) {
        if ((row.kind !== "module" && row.kind !== "subject")) continue;
        const version = await ctx.db.get("curriculumVersions", row.versionId);
        const program = version ? await ctx.db.get("curriculumPrograms", version.programId) : null;
        if (!program || !await ctx.db.get("curriculumInstitutions", program.institutionId)) continue;
        page.push({ kind: "module" as const, id: row._id, name: row.name, parentId: row.versionId });
      }
      return { ...result, page };
    }
    if (args.kind === "creator") {
      const result = args.creatorMatch === "name"
        ? await ctx.db.query("users").withSearchIndex("search_name", q => q.search("name", text)).paginate(args.paginationOpts)
        : await ctx.db.query("users").withIndex("by_username", q => q.gte("username", text).lt("username", `${text}\uffff`)).paginate(args.paginationOpts);
      const page = [];
      for (const user of result.page) {
        if (await creatorRestricted(ctx, user.clerkId)) continue;
        // Bound hydration while allowing a stale newest candidate to be skipped.
        const lessons = await ctx.db.query("lessons").withIndex("by_ownerId_and_visibility_and_communityState_and_status", q => q.eq("ownerId", user.clerkId).eq("visibility", "public").eq("communityState", "ok").eq("status", "active")).order("desc").take(5);
        let hasPublicSnapshot = false;
        for (const lesson of lessons) {
          if (!lesson.publishedVersionId) continue;
          const version = await ctx.db.get("lessonVersions", lesson.publishedVersionId);
          if (version && version.lessonId === lesson._id && (version.visibility === undefined || version.visibility === "public")) {
            hasPublicSnapshot = true;
            break;
          }
        }
        if (!hasPublicSnapshot) continue;
        page.push({ kind: "creator" as const, id: user.username, name: user.name, parentId: null });
      }
      return { ...result, page };
    }
    const result = await ctx.db.query("lessons").withSearchIndex("search_text", q => q.search("searchText", text).eq("visibility", "public").eq("communityState", "ok").eq("status", "active")).paginate(args.paginationOpts);
    const found = new Map<string, { kind: "creator" | "tag"; id: string; name: string; parentId: null }>();
    for (const lesson of result.page) {
      if (lesson.status !== "active" || !lesson.publishedVersionId || await creatorRestricted(ctx, lesson.ownerId)) continue;
      const version = await ctx.db.get("lessonVersions", lesson.publishedVersionId);
      if (!version || version.lessonId !== lesson._id || (version.visibility !== undefined && version.visibility !== "public")) continue;
      if (args.kind === "tag") {
        for (const tag of version.metadata.tags) {
          const id = tag.normalize("NFKC").trim().toLowerCase();
          if (matches(tag) && !found.has(id)) found.set(id, { kind: "tag", id, name: tag, parentId: null });
        }
      }
    }
    return { ...result, page: [...found.values()] };
  },
});
