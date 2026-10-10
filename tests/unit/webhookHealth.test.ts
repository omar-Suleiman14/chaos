import { describe, expect, it } from "vitest";
import { webhookHealth } from "../../convex/webhookHealth";
import { FAILING_AFTER } from "../../convex/webhookModel";

describe("webhookHealth", () => {
  it("preserves paused and disabled states even after failures", () => {
    for (const status of ["paused", "disabled"] as const) {
      expect(webhookHealth({ status, consecutiveFailures: 100, lastAttemptAt: 1 })).toBe(status);
    }
  });
  it("shows new active subscriptions before any attempt", () => {
    expect(webhookHealth({ status: "active", consecutiveFailures: 0 })).toBe("new");
  });
  it("classifies failing subscriptions before healthy ones", () => {
    expect(webhookHealth({ status: "active", consecutiveFailures: FAILING_AFTER, lastAttemptAt: 1 })).toBe("failing");
    expect(webhookHealth({ status: "active", consecutiveFailures: FAILING_AFTER - 1, lastAttemptAt: 1 })).toBe("healthy");
  });
});
