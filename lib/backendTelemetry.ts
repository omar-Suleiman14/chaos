import { makeFunctionReference } from "convex/server";
import type { Infer } from "convex/values";
import type { ActionCtx } from "../convex/_generated/server";
import { METRIC_POLICY, serviceValidator } from "../convex/observabilityModel";

/** Trusted server helper; never accepts a client-provided service or metric. */
export async function observeHttp(ctx: ActionCtx, service: Infer<typeof serviceValidator>, execute: () => Promise<Response>): Promise<Response> {
  const started = Date.now();
  let outcome: "success" | "client-error" | "error" = "error";
  try {
    const response = await execute();
    outcome = response.status >= 500 ? "error" : response.status >= 400 ? "client-error" : "success";
    return response;
  } finally {
    try {
      const bytes = new Uint32Array(1); crypto.getRandomValues(bytes);
      await ctx.runMutation(makeFunctionReference<"mutation">("observability:record"), { service, latencyMs: Math.max(0, Date.now() - started), outcome, shard: bytes[0] % METRIC_POLICY.shards });
    } catch {
      // No request body, URL, identity, exception text or credentials in logs.
      console.warn("backend_telemetry_write_failed");
    }
  }
}
