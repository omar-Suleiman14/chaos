import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Payload schema version sent in every delivery body (`version`). Bump only for breaking changes. */
export const WEBHOOK_SCHEMA_VERSION = "1";

/** Events a subscription can choose. `webhook.test` is sent only on request and cannot be subscribed to. */
export const webhookEventTypes = ["response.completed", "response.graded", "form.published", "form.closed", "form.reopened"] as const;
export type WebhookEventType = (typeof webhookEventTypes)[number];
export type WebhookSentEvent = WebhookEventType | "webhook.test";

export const eventTypeValidator = v.union(
  v.literal("response.completed"), v.literal("response.graded"), v.literal("form.published"),
  v.literal("form.closed"), v.literal("form.reopened"),
);
export const sentEventValidator = v.union(eventTypeValidator, v.literal("webhook.test"));

/** Classified outcome of one attempt. Raw endpoint response bodies are never stored. */
export const attemptOutcomes = [
  "success", "http_error", "redirect", "timeout", "network_error", "dns_error", "blocked_address", "invalid_url", "internal_error",
] as const;
export type AttemptOutcome = (typeof attemptOutcomes)[number];
export const outcomeValidator = v.union(
  v.literal("success"), v.literal("http_error"), v.literal("redirect"), v.literal("timeout"), v.literal("network_error"),
  v.literal("dns_error"), v.literal("blocked_address"), v.literal("invalid_url"), v.literal("internal_error"),
);

// ── Delivery policy ─────────────────────────────────────────────────────────

/** Automatic attempts per delivery, including the first. */
export const MAX_ATTEMPTS = 8;
export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_FACTOR = 4;
export const BACKOFF_MAX_MS = 6 * 3_600_000;
export const REQUEST_TIMEOUT_MS = 10_000;
/** Consecutive failed attempts after which a subscription is switched off and the creator is told. */
export const AUTO_DISABLE_AFTER = 25;
/** A subscription is shown as failing after this many consecutive failed attempts. */
export const FAILING_AFTER = 3;
/** The old secret keeps signing deliveries for this long after a rotation. */
export const ROTATION_GRACE_MS = 24 * 3_600_000;
/** Consumers should reject deliveries whose signed timestamp is older than this. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;
/** Payloads that contain respondent answers are erased after this long; others after PAYLOAD_RETENTION_MS. */
export const ANSWER_PAYLOAD_RETENTION_MS = 24 * 3_600_000;
export const PAYLOAD_RETENTION_MS = 7 * 86_400_000;
/** Delivery and attempt records (no payload) are kept this long. */
export const HISTORY_RETENTION_MS = 30 * 86_400_000;
export const MAX_SUBSCRIPTIONS_PER_OWNER = 20;
export const MAX_SUBSCRIPTIONS_PER_CONNECTION = 5;

/**
 * Delay before automatic attempt `failedAttempts + 1`: 30 s, 2 min, 8 min, 32 min, ~2 h, then 6 h,
 * each with up to ±10% jitter so retries from many deliveries spread out.
 */
export function backoffDelay(failedAttempts: number, random: number = Math.random()): number {
  const base = Math.min(BACKOFF_BASE_MS * BACKOFF_FACTOR ** Math.max(0, failedAttempts - 1), BACKOFF_MAX_MS);
  return Math.round(base * (0.9 + 0.2 * random));
}

/** Whether a failed attempt with this outcome is worth retrying automatically. */
export function isRetryable(outcome: AttemptOutcome, statusCode?: number): boolean {
  if (outcome === "success" || outcome === "invalid_url" || outcome === "blocked_address") return false;
  // 410 Gone is the endpoint saying it no longer wants deliveries; everything else may be temporary
  // (a consumer that is still being set up often answers 401 or 404 for a while).
  return !(outcome === "http_error" && statusCode === 410);
}

export const webhookTables = {
  webhookSubscriptions: defineTable({
    ownerId: v.string(),
    url: v.string(),
    description: v.string(),
    events: v.array(eventTypeValidator),
    /**
     * "all": every form and quiz of the owner. "selected": only `itemRefs`.
     * "connection": whatever the creating connection can reach (API-created subscriptions).
     */
    target: v.union(v.literal("all"), v.literal("selected"), v.literal("connection")),
    itemRefs: v.array(v.string()),
    /** Opt-in: include respondent answers and names. Never allowed for connection-created subscriptions. */
    includeAnswers: v.boolean(),
    /** AES-GCM ciphertext of the signing secret. The plaintext is shown once. */
    secretCiphertext: v.string(),
    secretHint: v.string(),
    previousSecretCiphertext: v.optional(v.string()),
    previousSecretExpiresAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("disabled")),
    disabledReason: v.optional(v.union(v.literal("failures"), v.literal("connection_revoked"))),
    consecutiveFailures: v.number(),
    lastAttemptAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    lastFailureAt: v.optional(v.number()),
    lastOutcome: v.optional(outcomeValidator),
    /** Set when an integration connection created the subscription through the API. */
    connectionId: v.optional(v.id("integrationTokens")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_connectionId", ["connectionId"]),

  /** One row per event per subscription. Its id is the `Chaos-Delivery` header, stable across retries. */
  webhookDeliveries: defineTable({
    subscriptionId: v.id("webhookSubscriptions"),
    ownerId: v.string(),
    event: sentEventValidator,
    eventId: v.string(),
    itemRef: v.optional(v.string()),
    /** Exact JSON body that is signed and sent. Erased at `payloadExpiresAt`. */
    payload: v.optional(v.string()),
    containsAnswers: v.boolean(),
    /** Cleared together with the payload so erased rows leave the expiry index. */
    payloadExpiresAt: v.optional(v.number()),
    status: v.union(v.literal("pending"), v.literal("retrying"), v.literal("succeeded"), v.literal("failed"), v.literal("cancelled")),
    attempts: v.number(),
    /** Manual resends make one attempt without automatic retries. */
    manual: v.optional(v.boolean()),
    nextAttemptAt: v.optional(v.number()),
    lastStatusCode: v.optional(v.number()),
    lastOutcome: v.optional(outcomeValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subscriptionId_and_createdAt", ["subscriptionId", "createdAt"])
    .index("by_payloadExpiresAt", ["payloadExpiresAt"])
    .index("by_createdAt", ["createdAt"]),

  webhookAttempts: defineTable({
    deliveryId: v.id("webhookDeliveries"),
    subscriptionId: v.id("webhookSubscriptions"),
    attempt: v.number(),
    at: v.number(),
    durationMs: v.number(),
    statusCode: v.optional(v.number()),
    outcome: outcomeValidator,
    /** Short classified detail (for example "ENOTFOUND" or "private_address"), never endpoint text. */
    detail: v.optional(v.string()),
  })
    .index("by_deliveryId_and_attempt", ["deliveryId", "attempt"])
    .index("by_at", ["at"]),
};
