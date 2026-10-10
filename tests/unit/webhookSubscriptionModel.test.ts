import { describe, expect, it } from "vitest";
import { webhookEventTypes } from "../../convex/webhookModel";
import { validEvents } from "../../convex/webhookSubscriptionModel";

describe("webhook event selection", () => {
  it("preserves canonical ordering and drops duplicates", () => {
    const [first, second] = webhookEventTypes;
    expect(validEvents([second, first, second])).toEqual([first, second]);
  });
  it("rejects subscriptions without any events", () => {
    expect(() => validEvents([])).toThrow("INVALID_EVENTS: Choose at least one event.");
  });
});
