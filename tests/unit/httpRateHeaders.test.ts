import { describe, expect, it } from "vitest";
import { rateHeaders } from "../../convex/httpRateHeaders";

describe("rateHeaders", () => {
  it("retains the exact four public header names and values", () => {
    expect(rateHeaders({ limit: 300, remaining: 299, reset: 60, policy: "read;w=60" })).toEqual({
      "RateLimit-Limit": "300",
      "RateLimit-Remaining": "299",
      "RateLimit-Reset": "60",
      "RateLimit-Policy": "read;w=60",
    });
  });

  it("preserves zeros and is deterministic", () => {
    const rate = { limit: 0, remaining: 0, reset: 0, policy: "" };
    expect(rateHeaders(rate)).toEqual(rateHeaders({ ...rate }));
    expect(rateHeaders(rate)["RateLimit-Remaining"]).toBe("0");
  });
});
