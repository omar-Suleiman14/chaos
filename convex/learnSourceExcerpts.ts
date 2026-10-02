import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireActiveUser } from "./authz";
import { storedSourceExcerpt, CONTEXT_LIMITS } from "./learnContextModel";

/** Manual owner-supplied quotations; never extracted or fetched automatically. */
export const replace = mutation({
  args: { sourceId: v.id("learnSources"), expectedRevision: v.number(), excerpts: v.array(storedSourceExcerpt) },
  returns: v.object({ revision: v.number() }),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const source = await ctx.db.get("learnSources", args.sourceId);
    if (!source || source.ownerId !== identity.subject || source.status !== "active") throw new Error("Active owned source required");
    const revision = source.excerptRevision ?? 0;
    if (args.expectedRevision !== revision) throw new ConvexError({ code: "REVISION_CONFLICT", currentRevision: revision });
    if (args.excerpts.length > CONTEXT_LIMITS.storedExcerpts || new Set(args.excerpts.map(e => e.id)).size !== args.excerpts.length || new TextEncoder().encode(JSON.stringify(args.excerpts)).length > CONTEXT_LIMITS.storedBytes) throw new Error("Excerpt collection exceeds limits or has duplicate IDs");
    for (const excerpt of args.excerpts) {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(excerpt.id) || !excerpt.text.trim() || new TextEncoder().encode(excerpt.text).length > CONTEXT_LIMITS.excerptBytes) throw new Error("Excerpt requires stable ID and 1-4000 bytes of text");
      const l = excerpt.locator;
      if ((l.kind === "page" && (!Number.isSafeInteger(l.page) || l.page < 1)) || (l.kind === "slide" && (!Number.isSafeInteger(l.slide) || l.slide < 1)) || (l.kind === "time" && (!Number.isFinite(l.start) || l.start < 0 || (l.end !== undefined && (!Number.isFinite(l.end) || l.end <= l.start)))) || (l.kind === "section" && (!l.label.trim() || l.label.length > 200))) throw new Error("Invalid excerpt source location");
    }
    await ctx.db.patch("learnSources", source._id, { excerpts: args.excerpts, excerptRevision: revision + 1 });
    return { revision: revision + 1 };
  },
});
