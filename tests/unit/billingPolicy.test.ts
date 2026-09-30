import { describe, expect, it } from "vitest";
import { projectBillingEntitlement, reconcileBillingEvent, validateBillingSnapshot, type BillingSnapshot } from "../../lib/billingPolicy";

const paid: BillingSnapshot = {
  accountKey: "stripe:test:primary", subscriptionId: "subscription-1", subjectId: "user-1", revision: 2,
  status: "active", periodStart: 100, periodEnd: 1000, currency: "USD", paidMinor: 1000, refundedMinor: 0, dispute: "none",
};
const digest = "a".repeat(64);
const event = (snapshot = paid) => ({ eventId: "evt-1", digest, snapshot });

describe("billing reconciliation", () => {
  it("retries never apply twice and changed replay payloads are quarantined", () => {
    expect(reconcileBillingEvent(paid, event(), { digest })).toEqual({ action: "duplicate" });
    expect(reconcileBillingEvent(paid, { ...event(), digest: "b".repeat(64) }, { digest }).action).toBe("quarantine");
  });
  it("late active notifications cannot undo a newer refund", () => {
    const refunded = { ...paid, revision: 3, refundedMinor: 1000 };
    expect(reconcileBillingEvent(refunded, event()).action).toBe("stale");
    expect(projectBillingEntitlement([refunded], [], 500).plan).toBe("free");
  });
  it("equal revisions require identical snapshots; newer snapshots reconcile missed events", () => {
    expect(reconcileBillingEvent(paid, event()).action).toBe("unchanged");
    expect(reconcileBillingEvent(paid, event({ ...paid, refundedMinor: 1 })).action).toBe("quarantine");
    expect(reconcileBillingEvent(paid, event({ ...paid, revision: 10, dispute: "open" })).action).toBe("apply");
  });
  it.each(["accountKey", "subscriptionId", "subjectId"] as const)("rejects cross-binding changes to %s", key => {
    expect(reconcileBillingEvent(paid, event({ ...paid, [key]: "other", revision: 3 })).action).toBe("quarantine");
  });
  it("rejects invalid money, periods and untrusted event identifiers", () => {
    for (const change of [{ paidMinor: 1.5 }, { refundedMinor: 1001 }, { refundedMinor: -1 }, { currency: "usd" }, { periodEnd: 100 }, { revision: 0 }])
      expect(() => validateBillingSnapshot({ ...paid, ...change })).toThrow();
    expect(() => reconcileBillingEvent(null, { ...event(), digest: "raw payload" })).toThrow();
  });
});

describe("entitlement boundary", () => {
  it("partial refunds preserve access; full refunds and open/lost disputes suspend the paid grant", () => {
    expect(projectBillingEntitlement([{ ...paid, refundedMinor: 500 }], [], 500).plan).toBe("pro");
    for (const change of [{ refundedMinor: 1000 }, { dispute: "open" as const }, { dispute: "lost" as const }])
      expect(projectBillingEntitlement([{ ...paid, ...change }], [], 500).plan).toBe("free");
    expect(projectBillingEntitlement([{ ...paid, dispute: "won" }], [], 500).plan).toBe("pro");
  });
  it("a chargeback cannot erase an independent admin grant or trial", () => {
    expect(projectBillingEntitlement([{ ...paid, dispute: "lost" }], [
      { kind: "trial", startsAt: 100, expiresAt: 600, revoked: false },
      { kind: "admin", startsAt: 100, expiresAt: 2000, revoked: false },
    ], 500)).toEqual({ plan: "pro", planExpiresAt: 2000, reasons: ["admin", "trial"] });
  });
  it("cancellation at period end retains paid time, while past-due has no implicit grace", () => {
    expect(projectBillingEntitlement([{ ...paid, status: "canceling" }], [], 999).plan).toBe("pro");
    expect(projectBillingEntitlement([{ ...paid, status: "canceling" }], [], 1000).plan).toBe("free");
    expect(projectBillingEntitlement([{ ...paid, status: "past_due" }], [], 500).plan).toBe("free");
    expect(projectBillingEntitlement([paid], [], 99).plan).toBe("free");
  });
  it("one revoked subscription leaves another paid subscription intact", () => {
    expect(projectBillingEntitlement([{ ...paid, dispute: "lost" }, { ...paid, subscriptionId: "subscription-2", periodEnd: 1500 }], [], 500))
      .toEqual({ plan: "pro", planExpiresAt: 1500, reasons: ["paid"] });
    expect(() => projectBillingEntitlement([paid, paid], [], 500)).toThrow();
    expect(() => projectBillingEntitlement([paid, { ...paid, subjectId: "other", subscriptionId: "other" }], [], 500)).toThrow();
  });
});
