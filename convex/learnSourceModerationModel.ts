import { defineTable } from "convex/server";
import { v } from "convex/values";
export const sourceModerationTables = {
  learnSourceReports: defineTable({ sourceId: v.id("learnSources"), reporterKey: v.string(), category: v.union(v.literal("copyright"), v.literal("abuse")), detail: v.string(), status: v.union(v.literal("open"), v.literal("resolved")), createdAt: v.number() }).index("by_sourceId_and_reporterKey_and_category", ["sourceId", "reporterKey", "category"]).index("by_status", ["status"]),
  learnSourceAudit: defineTable({ sourceId: v.id("learnSources"), actorKey: v.string(), action: v.union(v.literal("takedown"), v.literal("restore")), reason: v.string(), before: v.union(v.literal("active"), v.literal("retained"), v.literal("removed")), after: v.union(v.literal("active"), v.literal("removed")), createdAt: v.number() }).index("by_sourceId", ["sourceId"]),
  learnSourceAppeals: defineTable({ sourceId: v.id("learnSources"), auditId: v.id("learnSourceAudit"), ownerId: v.string(), reason: v.string(), status: v.union(v.literal("open"), v.literal("accepted"), v.literal("denied")), resolution: v.optional(v.string()), resolvedBy: v.optional(v.string()), createdAt: v.number() }).index("by_auditId_and_ownerId", ["auditId", "ownerId"]).index("by_status", ["status"]),
};
