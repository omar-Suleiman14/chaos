/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { defineSchema, makeFunctionReference } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { observabilityTables } from "../../convex/observabilityModel";
import { observeHttp } from "../../lib/backendTelemetry";
import type { ActionCtx } from "../../convex/_generated/server";

const modules = import.meta.glob("../../convex/**/*.*s");
const testSchema = defineSchema({ ...schema.tables, ...observabilityTables });
const record = makeFunctionReference<"mutation">("observability:record");
const status = makeFunctionReference<"query">("observability:publicStatus");
const incident = makeFunctionReference<"mutation">("observability:setIncident");
const prune = makeFunctionReference<"mutation">("observability:prune");
describe("observability", () => {
  it("exposes only aggregate status and reports insufficient evidence as unknown", async () => {
    const t = convexTest(testSchema, modules);
    await t.mutation(record, { service: "mcp", latencyMs: 20, outcome: "success", shard: 0 });
    const initial = await t.query(status, {});
    expect(initial.services.find((s: { service: string }) => s.service === "mcp")).toEqual({ service: "mcp", observed: true, status: "unknown", summary: null });
    expect(initial.services.find((s: { service: string }) => s.service === "ai")).toMatchObject({ observed: false, status: "unknown" });
    for (let i = 0; i < 20; i++) await t.mutation(record, { service: "mcp", latencyMs: 20, outcome: "error", shard: i % 16 });
    expect((await t.query(status, {})).services.find((s: { service: string }) => s.service === "mcp").status).toBe("outage");
    const rows = await t.run(ctx => ctx.db.query("serviceMetrics").collect());
    expect(rows.length).toBe(16);
    expect(rows[0]).not.toHaveProperty("userId");
    await expect(t.mutation(record, { service: "mcp", latencyMs: -1, outcome: "error", shard: 0 })).rejects.toThrow("Invalid metric");
  });
  it("requires active admin, keeps audit reasons private, and expires overrides", async () => {
    const t = convexTest(testSchema, modules);
    const admin = t.withIdentity({ subject: "operator", issuer: "test", tokenIdentifier: "test|operator" });
    const args = { service: "search", status: "degraded", publicSummary: "Search maintenance", reason: "Private ticket 123", durationMinutes: 5 };
    await expect(admin.mutation(incident, args)).rejects.toThrow("admin");
    await t.run(ctx => ctx.db.insert("admins", { clerkId: "operator", email: "secret@example.com", grantedAt: 0 }));
    const id = await admin.mutation(incident, args);
    expect(await t.run(ctx => ctx.db.get("serviceIncidents", id))).toMatchObject({ actor: "test|operator", reason: "Private ticket 123" });
    const feed = await t.query(status, {});
    expect(JSON.stringify(feed)).not.toContain("Private ticket");
    expect(JSON.stringify(feed)).not.toContain("operator");
    expect(feed.services.find((s: { service: string }) => s.service === "search").status).toBe("degraded");
    await t.run(ctx => ctx.db.patch("serviceIncidents", id, { expiresAt: Date.now() - 1 }));
    expect((await t.query(status, {})).services.find((s: { service: string }) => s.service === "search").status).toBe("unknown");
    await t.run(ctx => ctx.db.insert("users", { clerkId: "operator", name: "Operator", username: "operator", email: "secret@example.com", isBanned: true, createdAt: 0 }));
    await expect(admin.mutation(incident, args)).rejects.toThrow("ACCOUNT_BANNED");
  });
  it("prunes at most 200 expired metric shards and preserves fresh rows", async () => {
    const t = convexTest(testSchema, modules);
    await t.run(async ctx => {
      for (let i = 0; i < 205; i++) await ctx.db.insert("serviceMetrics", { service: "mcp", hour: Date.now() - 40 * 86400000 - i * 3600000, shard: 0, requests: 1, errors: 0, clientErrors: 0, histogram: [1, 0, 0, 0, 0, 0, 0], updatedAt: 0 });
    });
    await t.mutation(record, { service: "mcp", latencyMs: 20, outcome: "success", shard: 0 });
    expect(await t.mutation(prune, {})).toEqual({ deleted: 200, more: true });
    expect(await t.mutation(prune, {})).toEqual({ deleted: 5, more: false });
    expect((await t.query(status, {})).services.find((s: { service: string }) => s.service === "mcp").observed).toBe(true);
  });
  it("preserves business responses and thrown errors when telemetry fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = { runMutation: vi.fn().mockRejectedValue(new Error("Unavailable")) } as unknown as ActionCtx;
    const response = new Response("ok", { status: 201 });
    expect(await observeHttp(ctx, "submissions", async () => response)).toBe(response);
    const failure = new Error("Business failure");
    await expect(observeHttp(ctx, "submissions", async () => { throw failure; })).rejects.toBe(failure);
    expect(ctx.runMutation).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ outcome: "error" }));
    warn.mockRestore();
  });
});
