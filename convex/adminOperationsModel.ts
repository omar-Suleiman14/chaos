import { defineTable } from "convex/server";
import { v } from "convex/values";

export const supportStatus = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("resolved"),
);
export const supportPriority = v.union(v.literal("normal"), v.literal("urgent"));

/** Only platform administrators may read/write cases. No exam content or billing data. */
export const adminOperationsTables = {
  platformSupportCases: defineTable({
    subject: v.string(),
    summary: v.string(),
    accountId: v.optional(v.string()),
    priority: supportPriority,
    status: supportStatus,
    revision: v.number(),
    createdBy: v.string(),
    updatedBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  }).index("by_status_updated", ["status", "updatedAt"]),
};
