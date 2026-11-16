import { defineTable } from "convex/server";
import { v } from "convex/values";

/** R2 images attached to an owner's private reusable question bank. */
export const questionBankMediaTables = {
  questionBankMedia: defineTable({
    ownerId: v.string(), mimeType: v.string(), bytes: v.number(),
    storageCounted: v.optional(v.boolean()),
    status: v.union(v.literal("pending"),v.literal("ready"),v.literal("removed")),
    etag: v.optional(v.string()),
    reclaimToken: v.optional(v.string()), reclaimStatus: v.optional(v.union(v.literal("checking"), v.literal("in_use"))), createdAt:v.number(),expiresAt:v.number(),
  }).index("by_owner",["ownerId"]),
};
