import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdmin, requireIdentity } from "./authz";
import { docFields, docLocale, publishedDoc } from "./docsModel";
import { docSections } from "../lib/docs/content";
import type { Doc } from "./_generated/dataModel";

type Fields = Pick<Doc<"docArticles">, "slug" | "locale" | "sectionId" | "sectionTitle" | "order" | "content">;
const saveArgs = { ...docFields, expectedRevision: v.optional(v.number()), publish: v.optional(v.boolean()) };
const saved = v.object({ slug: v.string(), locale: docLocale, revision: v.number(), published: v.boolean() });
const adminRow = v.object({ ...docFields, revision: v.number(), published: v.boolean() });
async function adminActor(ctx: QueryCtx | MutationCtx, userId: string) {
  const admin = await ctx.db.query("admins").withIndex("by_clerkId", q => q.eq("clerkId", userId)).first();
  if (!admin) throw new Error("FORBIDDEN: Admin access required.");
  const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", userId)).first();
  if (user?.isBanned || user?.suspendedUntil) throw new Error("ACCOUNT_RESTRICTED: This account is read-only.");
}
function validate(fields: Fields) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.slug) || fields.slug.length > 100) throw new Error("Use a lowercase hyphenated slug, up to 100 characters.");
  if (!fields.content.title.trim() || fields.content.title.length > 200 || fields.content.summary.length > 2000 || fields.sectionTitle.length > 200 || !fields.sectionId || fields.sectionId.length > 100 || !Number.isSafeInteger(fields.order)) throw new Error("Invalid article metadata.");
  if (fields.content.blocks.length > 500 || JSON.stringify(fields.content).length > 200_000) throw new Error("Article is too large.");
  const headings = fields.content.blocks.flatMap(b => b.type === "heading" ? [b.id] : []);
  if (new Set(headings).size !== headings.length || headings.some(id => !/^[a-z0-9][a-z0-9-]*$/.test(id))) throw new Error("Heading IDs must be unique lowercase anchors.");
}
async function saveForActor(ctx: MutationCtx, actorId: string, args: Fields & { expectedRevision?: number; publish?: boolean }) {
  validate(args);
  const prior = await ctx.db.query("docArticles").withIndex("by_slug_and_locale", q => q.eq("slug", args.slug).eq("locale", args.locale)).unique();
  if (prior && args.expectedRevision !== prior.revision) throw new Error("CONFLICT: Reload the article before saving.");
  const revision = (prior?.revision ?? -1) + 1;
  const { expectedRevision: _revision, publish, ...fields } = args;
  const now = Date.now();
  const patch = { ...fields, revision, updatedAt: now, published: publish ? { ...args.content, sectionId: args.sectionId, sectionTitle: args.sectionTitle, order: args.order } : prior?.published ?? null, publishedAt: publish ? now : prior?.publishedAt ?? null };
  if (prior) await ctx.db.patch("docArticles", prior._id, patch); else await ctx.db.insert("docArticles", patch);
  await ctx.db.insert("adminAudit", { actorId, action: publish ? "publish_doc" : "save_doc", target: `${args.locale}/${args.slug}`, reason: args.content.title, createdAt: now });
  return { slug: args.slug, locale: args.locale, revision, published: publish === true };
}
async function listAdmin(ctx: QueryCtx, locale: "en" | "ar") {
  return (await ctx.db.query("docArticles").withIndex("by_locale_and_order", q => q.eq("locale", locale)).take(200)).map(row => ({ slug: row.slug, locale: row.locale, sectionId: row.sectionId, sectionTitle: row.sectionTitle, order: row.order, content: row.content, revision: row.revision, published: row.published !== null }));
}
export const listPublished = query({ args: { locale: docLocale }, returns: v.array(publishedDoc), handler: async (ctx, { locale }) => (await ctx.db.query("docArticles").withIndex("by_locale_and_order", q => q.eq("locale", locale)).take(200)).flatMap(row => row.published ? [{ slug: row.slug, locale: row.locale, ...row.published, updatedAt: row.publishedAt! }] : []).sort((a, b) => a.order - b.order) });
export const getPublished = query({ args: { slug: v.string(), locale: docLocale }, returns: v.union(publishedDoc, v.null()), handler: async (ctx, args) => { const row = await ctx.db.query("docArticles").withIndex("by_slug_and_locale", q => q.eq("slug", args.slug).eq("locale", args.locale)).unique(); return row?.published ? { slug: row.slug, locale: row.locale, ...row.published, updatedAt: row.publishedAt! } : null; } });
export const adminList = query({ args: { locale: docLocale }, returns: v.array(adminRow), handler: async (ctx, args) => { await requireAdmin(ctx); return listAdmin(ctx, args.locale); } });
export const save = mutation({ args: saveArgs, returns: saved, handler: async (ctx, args) => { await requireAdmin(ctx); const identity = await requireIdentity(ctx); await adminActor(ctx, identity.subject); return saveForActor(ctx, identity.subject, args); } });
export const mcpList = internalQuery({ args: { userId: v.string(), locale: docLocale }, returns: v.array(adminRow), handler: async (ctx, args) => { await adminActor(ctx, args.userId); return listAdmin(ctx, args.locale); } });
export const mcpCapabilities = internalQuery({ args: { userId: v.string() }, returns: v.object({ admin: v.boolean() }), handler: async (ctx, { userId }) => {
  const admin = await ctx.db.query("admins").withIndex("by_clerkId", q => q.eq("clerkId", userId)).first();
  if (!admin) return { admin: false };
  const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", userId)).first();
  return { admin: !user?.isBanned && !user?.suspendedUntil };
} });
export const mcpSave = internalMutation({ args: { userId: v.string(), ...saveArgs }, returns: saved, handler: async (ctx, { userId, ...args }) => { await adminActor(ctx, userId); return saveForActor(ctx, userId, args); } });
export const seed = internalMutation({ args: { locale: docLocale, offset: v.optional(v.number()) }, returns: v.object({ inserted: v.number(), nextOffset: v.union(v.number(), v.null()) }), handler: async (ctx, { locale, offset = 0 }) => {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid offset");
  const all = docSections[locale].flatMap(section => section.articles.map(article => ({ sectionId: section.id, sectionTitle: section.title, article })));
  let inserted = 0;
  for (let index = offset; index < Math.min(offset + 10, all.length); index++) {
    const { sectionId, sectionTitle, article } = all[index];
    const prior = await ctx.db.query("docArticles").withIndex("by_slug_and_locale", q => q.eq("slug", article.slug).eq("locale", locale)).unique();
    if (prior) continue;
    const content = { title: article.title, summary: article.summary, blocks: article.blocks };
    const now = Date.now();
    await ctx.db.insert("docArticles", { slug: article.slug, locale, sectionId, sectionTitle, order: index, content, published: { ...content, sectionId, sectionTitle, order: index }, revision: 0, updatedAt: now, publishedAt: now }); inserted++;
  }
  return { inserted, nextOffset: offset + 10 < all.length ? offset + 10 : null };
} });
