import { describe, expect, it } from "vitest";
import { error, respond } from "../../convex/httpResponses";

describe("HTTP JSON response helpers", () => {
  it("preserves no-store JSON headers and per-result headers", async () => {
    const result = respond({ status: 201, body: { created: true }, headers: { "X-Request-Id": "fixture" } });
    expect(result.status).toBe(201);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(result.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(result.headers.get("X-Request-Id")).toBe("fixture");
    expect(await result.json()).toEqual({ created: true });
  });
  it("omits error details when absent and forwards rate-limit headers", async () => {
    const result = error(429, "RATE_LIMITED", "Retry later", undefined, { "Retry-After": "30" });
    expect(result.headers.get("Retry-After")).toBe("30");
    expect(await result.json()).toEqual({ error: { code: "RATE_LIMITED", message: "Retry later" } });
  });
  it("preserves present error details", async () => {
    expect(await error(400, "INVALID", "Invalid body", { field: "x" }).json()).toEqual({
      error: { code: "INVALID", message: "Invalid body", details: { field: "x" } },
    });
  });
});
