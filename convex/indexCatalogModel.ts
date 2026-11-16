import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Public Telegram references only. Do not store answer keys or private learner data. */
export const catalogItemFields = {
  source: v.union(v.literal("zatooona44"), v.literal("ZatOona46"), v.literal("medics_44_mcq")),
  messageId: v.number(),
  moduleIndex: v.number(),
  subject: v.string(),
  kind: v.union(v.literal("lecture"), v.literal("tutorial"), v.literal("cbl"), v.literal("practical"), v.literal("exam"), v.literal("timetable"), v.literal("resource")),
  title: v.string(),
  filename: v.optional(v.string()),
  postedAt: v.optional(v.string()),
  numbers: v.optional(v.array(v.number())),
};

export const catalogItemValidator = v.object(catalogItemFields);

export const indexCatalogTables = {
  indexCatalogEntries: defineTable({
    ...catalogItemFields,
    status: v.union(v.literal("published"), v.literal("hidden")),
    updatedAt: v.number(),
  })
    .index("by_source_message", ["source", "messageId"])
    .index("by_status", ["status"]),
};
