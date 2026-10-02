import { internalMutation, mutation, query } from "./_generated/server";

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";

import { requireActiveUser, requireAdmin } from "./authz";
import { METRIC_POLICY, observabilityTables, serviceValidator, statusValidator } from "./observabilityModel";

const hourMs = 3600000;
const services = ["submissions", "integration-api", "mcp", "source-files", "learn-reads", "search", "ai", "webhooks"] as const;

export const record = internalMutation({
  args: { service: serviceValidator, latencyMs: v.number(), outcome: v.union(v.literal("success"), v.literal("client-error"), v.literal("error")), shard: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.latencyMs) || args.latencyMs < 0 || args.latencyMs > 86400000 || !Number.isInteger(args.shard) || args.shard < 0 || args.shard >= METRIC_POLICY.shards) throw new Error("Invalid metric");
    const now = Date.now(); const hour = Math.floor(now / hourMs) * hourMs;
    const prior = await ctx.db.query("serviceMetrics").withIndex("by_service_and_hour_and_shard", q => q.eq("service", args.service).eq("hour", hour).eq("shard", args.shard)).unique();
    const histogram = prior?.histogram.slice() ?? Array<number>(METRIC_POLICY.latencyBoundsMs.length + 1).fill(0);
    const found = METRIC_POLICY.latencyBoundsMs.findIndex(bound => args.latencyMs <= bound);
    histogram[found < 0 ? histogram.length - 1 : found]++;
    const values = { service: args.service, hour, shard: args.shard, requests: (prior?.requests ?? 0) + 1, errors: (prior?.errors ?? 0) + Number(args.outcome === "error"), clientErrors: (prior?.clientErrors ?? 0) + Number(args.outcome === "client-error"), histogram, updatedAt: now };
    if (prior) await ctx.db.patch("serviceMetrics", prior._id, values); else await ctx.db.insert("serviceMetrics", values);
    return null;
  },
});

export const publicStatus = query({
  args: {}, returns: v.object({ generatedAt: v.number(), windowStart: v.number(), services: v.array(v.object({ service: serviceValidator, observed: v.boolean(), status: statusValidator, summary: v.union(v.string(), v.null()) })) }),
  handler: async ctx => {
    const now = Date.now(); const windowStart = Math.floor(now / hourMs) * hourMs - hourMs;
    const result = [];
    for (const service of services) {
      const rows = await ctx.db.query("serviceMetrics").withIndex("by_service_and_hour_and_shard", q => q.eq("service", service).gte("hour", windowStart)).take(33);
      const incident = await ctx.db.query("serviceIncidents").withIndex("by_service_and_createdAt", q => q.eq("service", service)).order("desc").first();
      const requests = rows.reduce((n, row) => n + row.requests, 0); const errors = rows.reduce((n, row) => n + row.errors, 0);
      const slow = rows.reduce((n, row) => n + row.histogram.slice(3).reduce((a, b) => a + b, 0), 0);
      const measured = requests < METRIC_POLICY.minimumSamples ? "unknown" as const : errors / requests > 0.2 ? "outage" as const : errors / requests > 0.01 || slow / requests > 0.05 ? "degraded" as const : "operational" as const;
      result.push({ service, observed: rows.length > 0, status: incident && incident.expiresAt > now ? incident.status : measured, summary: incident && incident.expiresAt > now ? incident.publicSummary : null });
    }
    return { generatedAt: now, windowStart, services: result };
  },
});

export const setIncident = mutation({
  args: { service: serviceValidator, status: statusValidator, publicSummary: v.string(), reason: v.string(), durationMinutes: v.number() }, returns: v.id("serviceIncidents"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx); const { identity } = await requireActiveUser(ctx);
    if (!args.reason.trim() || args.reason.length > 2000 || !args.publicSummary.trim() || args.publicSummary.length > 500 || !Number.isInteger(args.durationMinutes) || args.durationMinutes < 1 || args.durationMinutes > 10080) throw new Error("Invalid incident: summary, reason and duration required");
    return ctx.db.insert("serviceIncidents", { service: args.service, status: args.status, publicSummary: args.publicSummary.trim(), reason: args.reason.trim(), actor: identity.tokenIdentifier, createdAt: Date.now(), expiresAt: Date.now() + args.durationMinutes * 60000 });
  },
});

export const prune = internalMutation({ args: {}, returns: v.object({ deleted: v.number(), more: v.boolean() }), handler: async ctx => {
  const rows = await ctx.db.query("serviceMetrics").withIndex("by_hour", q => q.lt("hour", Date.now() - METRIC_POLICY.retentionDays * 86400000)).take(201);
  for (const row of rows.slice(0, 200)) await ctx.db.delete("serviceMetrics", row._id);
  if (rows.length > 200) await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("observability:prune"), {});
  return { deleted: Math.min(rows.length, 200), more: rows.length > 200 };
} });
