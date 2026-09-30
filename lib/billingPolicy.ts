/** Provider-neutral policy only. No webhook authenticity or persistence is implied. */
export interface BillingSnapshot {
  accountKey: string;
  subscriptionId: string;
  subjectId: string;
  revision: number;
  status: "active" | "canceling" | "past_due" | "canceled";
  periodStart: number;
  periodEnd: number;
  currency: string;
  paidMinor: number;
  refundedMinor: number;
  dispute: "none" | "open" | "lost" | "won";
}
export interface BillingEvent {
  eventId: string;
  /** Hash of canonical normalized payload, computed by the trusted adapter. */
  digest: string;
  snapshot: BillingSnapshot;
}
export interface EventReceipt { digest: string }
export type ReconciliationDecision =
  | { action: "duplicate" | "stale" | "unchanged" }
  | { action: "apply"; snapshot: BillingSnapshot }
  | { action: "quarantine"; reason: string };

export function validateBillingSnapshot(s: BillingSnapshot): void {
  if (![s.accountKey, s.subscriptionId, s.subjectId].every(v => typeof v === "string" && v.trim().length > 0 && v.length <= 200))
    throw new Error("Missing or oversized billing identity");
  if (!Number.isSafeInteger(s.revision) || s.revision < 1 ||
      !Number.isSafeInteger(s.periodStart) || s.periodStart < 0 ||
      !Number.isSafeInteger(s.periodEnd) || s.periodEnd <= s.periodStart)
    throw new Error("Invalid revision or billing period");
  if (!/^[A-Z]{3}$/.test(s.currency) ||
      !Number.isSafeInteger(s.paidMinor) || s.paidMinor < 0 ||
      !Number.isSafeInteger(s.refundedMinor) || s.refundedMinor < 0 || s.refundedMinor > s.paidMinor)
    throw new Error("Invalid currency or cumulative monetary amounts");
  if (!["active", "canceling", "past_due", "canceled"].includes(s.status) ||
      !["none", "open", "lost", "won"].includes(s.dispute))
    throw new Error("Invalid billing state");
}

function sameSnapshot(a: BillingSnapshot, b: BillingSnapshot): boolean {
  return (Object.keys(a) as (keyof BillingSnapshot)[]).every(key => a[key] === b[key]) &&
    (Object.keys(b) as (keyof BillingSnapshot)[]).every(key => a[key] === b[key]);
}

/** Receipts must be looked up by (accountKey,eventId), not eventId alone. */
export function reconcileBillingEvent(current: BillingSnapshot | null, event: BillingEvent, receipt?: EventReceipt): ReconciliationDecision {
  validateBillingSnapshot(event.snapshot);
  if (!event.eventId.trim() || event.eventId.length > 200 || !/^[a-f0-9]{64}$/.test(event.digest))
    throw new Error("Invalid event identity or SHA-256 digest");
  if (receipt) return receipt.digest === event.digest
    ? { action: "duplicate" }
    : { action: "quarantine", reason: "Event ID reused with a different payload" };
  if (!current) return { action: "apply", snapshot: { ...event.snapshot } };
  validateBillingSnapshot(current);
  const next = event.snapshot;
  if (current.accountKey !== next.accountKey || current.subscriptionId !== next.subscriptionId || current.subjectId !== next.subjectId)
    return { action: "quarantine", reason: "Subscription or account binding mismatch" };
  if (next.revision < current.revision) return { action: "stale" };
  if (next.revision === current.revision) return sameSnapshot(current, next)
    ? { action: "unchanged" }
    : { action: "quarantine", reason: "Conflicting snapshots at the same revision" };
  return { action: "apply", snapshot: { ...next } };
}

export interface IndependentGrant {
  kind: "trial" | "admin";
  startsAt: number;
  expiresAt: number;
  revoked: boolean;
}
export interface EntitlementProjection {
  plan: "free" | "pro";
  planExpiresAt?: number;
  reasons: ("paid" | "trial" | "admin")[];
}

/** Refund/dispute suspension affects only the implicated subscription grant. */
export function projectBillingEntitlement(snapshots: readonly BillingSnapshot[], grants: readonly IndependentGrant[], now: number): EntitlementProjection {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid policy clock");
  const identities = new Set<string>();
  let subject: string | undefined;
  let expiresAt = 0;
  const reasons = new Set<"paid" | "trial" | "admin">();
  for (const s of snapshots) {
    validateBillingSnapshot(s);
    const key = JSON.stringify([s.accountKey, s.subscriptionId]);
    if (identities.has(key) || (subject !== undefined && subject !== s.subjectId)) throw new Error("Projection requires unique subscriptions for one subject");
    identities.add(key);
    subject = s.subjectId;
    if ((s.status === "active" || s.status === "canceling") && s.periodStart <= now && s.periodEnd > now &&
        s.paidMinor > s.refundedMinor && (s.dispute === "none" || s.dispute === "won")) {
      expiresAt = Math.max(expiresAt, s.periodEnd);
      reasons.add("paid");
    }
  }
  for (const g of grants) {
    if (!["trial", "admin"].includes(g.kind) || !Number.isSafeInteger(g.startsAt) || g.startsAt < 0 ||
        !Number.isSafeInteger(g.expiresAt) || g.expiresAt <= g.startsAt) throw new Error("Invalid independent grant");
    if (!g.revoked && g.startsAt <= now && g.expiresAt > now) {
      expiresAt = Math.max(expiresAt, g.expiresAt);
      reasons.add(g.kind);
    }
  }
  return expiresAt > now ? { plan: "pro", planExpiresAt: expiresAt, reasons: [...reasons].sort() } : { plan: "free", reasons: [] };
}

/** Implementations authenticate events and resolve bindings before invoking policy. */
export interface BillingProviderAdapter {
  readonly accountKey: string;
  verifyAndNormalizeWebhook(rawBody: Uint8Array, headers: Readonly<Record<string, string>>): Promise<BillingEvent>;
  fetchAuthoritativeSnapshot(subscriptionId: string): Promise<BillingSnapshot>;
  requestRefund(input: { paymentId: string; amountMinor: number; currency: string; idempotencyKey: string }): Promise<{ refundId: string }>;
}
