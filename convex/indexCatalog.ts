import { internalMutation, mutation, query } from "./_generated/server";
import { v, type Infer } from "convex/values";
import { requireAdmin, requireIdentity } from "./authz";
import { catalogItemValidator } from "./indexCatalogModel";

type CatalogItem = Infer<typeof catalogItemValidator>;

function validate(item: CatalogItem): void {
  if (!Number.isSafeInteger(item.messageId) || item.messageId < 1 || item.messageId > 100_000_000) throw new Error("Invalid Telegram message.");
  if (!Number.isInteger(item.moduleIndex) || item.moduleIndex < 0 || item.moduleIndex >= 18) throw new Error("Invalid module.");
  if (!item.subject.trim() || item.subject.length > 90 || !item.title.trim() || item.title.length > 300) throw new Error("Invalid title or subject.");
  if (item.filename !== undefined && item.filename.length > 300) throw new Error("Invalid filename.");
  if (item.postedAt !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(item.postedAt)) throw new Error("Invalid date.");
  if (item.numbers !== undefined && (item.numbers.length > 30 || item.numbers.some(n => !Number.isInteger(n) || n < 1 || n > 100))) throw new Error("Invalid numbering.");
}

/** Anonymous public read. Paginated so the full catalogue never depends on one oversized query. */
export const list = query({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db.query("indexCatalogEntries").paginate({ cursor: cursor ?? null, numItems: 400 });
    return {
      entries: result.page.map(row => ({
        source: row.source, messageId: row.messageId, moduleIndex: row.moduleIndex,
        subject: row.subject, kind: row.kind, title: row.title,
        filename: row.filename, postedAt: row.postedAt, numbers: row.numbers,
        status: row.status, updatedAt: row.updatedAt,
      })),
      cursor: result.continueCursor,
      done: result.isDone,
    };
  },
});

/** Authenticated Chaos administrator edits; no anonymous write path is exposed. */
export const upsert = mutation({
  args: { item: catalogItemValidator, hidden: v.optional(v.boolean()) },
  handler: async (ctx, { item, hidden }) => {
    await requireAdmin(ctx);
    const actor = await requireIdentity(ctx);
    validate(item);
    const previous = await ctx.db.query("indexCatalogEntries")
      .withIndex("by_source_message", q => q.eq("source", item.source).eq("messageId", item.messageId)).unique();
    const status = hidden === undefined ? (previous?.status ?? "published") : (hidden ? "hidden" : "published");
    const payload = { ...item, status };
    if (previous) {
      const before = {
        source: previous.source, messageId: previous.messageId, moduleIndex: previous.moduleIndex,
        subject: previous.subject, kind: previous.kind, title: previous.title,
        filename: previous.filename, postedAt: previous.postedAt, numbers: previous.numbers, status: previous.status,
      };
      if (JSON.stringify(before) === JSON.stringify(payload)) return { changed: false };
      await ctx.db.patch("indexCatalogEntries", previous._id, { ...payload, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("indexCatalogEntries", { ...payload, updatedAt: Date.now() });
    }
    await ctx.db.insert("adminAudit", {
      actorId: actor.subject,
      action: "index_catalog_upsert",
      target: item.source + "/" + item.messageId,
      reason: status,
      createdAt: Date.now(),
    });
    return { changed: true };
  },
});

/** Deploy-authorized importer for the original catalogue and GitHub Actions data-only updates. */
export const importBatch = internalMutation({
  args: { items: v.array(catalogItemValidator), mode: v.union(v.literal("seed"), v.literal("upsert")) },
  handler: async (ctx, { items, mode }) => {
    if (items.length > 25) throw new Error("Import batches must contain at most 25 entries.");
    let added = 0, updated = 0, unchanged = 0;
    for (const item of items) {
      validate(item);
      const previous = await ctx.db.query("indexCatalogEntries")
        .withIndex("by_source_message", q => q.eq("source", item.source).eq("messageId", item.messageId)).unique();
      if (!previous) {
        await ctx.db.insert("indexCatalogEntries", { ...item, status: "published", updatedAt: Date.now() });
        added++;
      } else if (mode === "upsert" && previous.status !== "hidden" && (
        previous.moduleIndex !== item.moduleIndex || previous.subject !== item.subject || previous.kind !== item.kind ||
        previous.title !== item.title || previous.filename !== item.filename || previous.postedAt !== item.postedAt ||
        JSON.stringify(previous.numbers ?? []) !== JSON.stringify(item.numbers ?? [])
      )) {
        await ctx.db.patch("indexCatalogEntries", previous._id, { ...item, updatedAt: Date.now() });
        updated++;
      } else unchanged++;
    }
    return { added, updated, unchanged };
  },
});
