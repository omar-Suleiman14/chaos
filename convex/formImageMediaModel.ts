import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Private image uploads are scoped to one authored form, never to a course source. */
export const formImageMediaTables = {
  formImageMedia: defineTable({
    formId: v.id("forms"),
    ownerId: v.string(),
    mimeType: v.string(),
    bytes: v.number(),
    status: v.union(v.literal("pending"), v.literal("ready"), v.literal("removed")),
    etag: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_form", ["formId"]).index("by_owner", ["ownerId"]),
};
