import { defineTable } from "convex/server";
import { v } from "convex/values";

export const docLocale = v.union(v.literal("en"), v.literal("ar"));
export const docBlock = v.union(
  v.object({ type: v.literal("p"), text: v.string() }),
  v.object({ type: v.literal("tip"), text: v.string() }),
  v.object({ type: v.literal("heading"), id: v.string(), text: v.string() }),
  v.object({ type: v.literal("steps"), items: v.array(v.string()) }),
  v.object({ type: v.literal("list"), items: v.array(v.string()) }),
  v.object({ type: v.literal("keys"), items: v.array(v.object({ keys: v.array(v.string()), label: v.string() })) }),
);
export const docContent = v.object({ title: v.string(), summary: v.string(), blocks: v.array(docBlock) });
export const docSnapshot = v.object({ ...docContent.fields, sectionId: v.string(), sectionTitle: v.string(), order: v.number() });
export const docFields = { slug: v.string(), locale: docLocale, sectionId: v.string(), sectionTitle: v.string(), order: v.number(), content: docContent };
export const publishedDoc = v.object({ slug: v.string(), locale: docLocale, sectionId: v.string(), sectionTitle: v.string(), order: v.number(), title: v.string(), summary: v.string(), blocks: v.array(docBlock), updatedAt: v.number() });
export const docsTables = {
  docArticles: defineTable({ ...docFields, published: v.union(docSnapshot, v.null()), revision: v.number(), updatedAt: v.number(), publishedAt: v.union(v.number(), v.null()) })
    .index("by_slug_and_locale", ["slug", "locale"])
    .index("by_locale_and_order", ["locale", "order"]),
};
