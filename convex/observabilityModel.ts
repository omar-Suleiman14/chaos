import { defineTable } from "convex/server";
import { v } from "convex/values";

export const serviceValidator = v.union(v.literal("submissions"), v.literal("integration-api"), v.literal("mcp"), v.literal("source-files"), v.literal("learn-reads"), v.literal("search"), v.literal("ai"), v.literal("webhooks"));
export const statusValidator = v.union(v.literal("operational"), v.literal("degraded"), v.literal("outage"), v.literal("unknown"));
export const observabilityTables = {
  serviceMetrics: defineTable({ service: serviceValidator, hour: v.number(), shard: v.number(), requests: v.number(), errors: v.number(), clientErrors: v.number(), histogram: v.array(v.number()), updatedAt: v.number() })
    .index("by_service_and_hour_and_shard", ["service", "hour", "shard"]).index("by_hour", ["hour"]),
  serviceIncidents: defineTable({ service: serviceValidator, status: statusValidator, publicSummary: v.string(), expiresAt: v.number(), createdAt: v.number(), actor: v.string(), reason: v.string() })
    .index("by_service_and_createdAt", ["service", "createdAt"]),
  /** Nightly data consistency checks (convex/consistency.ts): what was scanned and what broke an invariant. */
  consistencyReports: defineTable({
    startedAt: v.number(), finishedAt: v.optional(v.number()), scanned: v.number(),
    findings: v.array(v.object({ check: v.string(), count: v.number(), samples: v.array(v.string()) })),
  }).index("by_startedAt", ["startedAt"]),
};
export const METRIC_POLICY = { shards: 16, retentionDays: 30, minimumSamples: 20, latencyBoundsMs: [100, 300, 1000, 3000, 10000, 60000], windowHours: 1 } as const;
