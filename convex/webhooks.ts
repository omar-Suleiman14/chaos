import { parseResourceRef } from "./resourceRefs";
import { getAuthIdentity } from "./authIdentity";
import { v } from "convex/values";
import { env, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { ownsRecord, requireActiveUser } from "./authz";
import type { ApiResult } from "./integrations";
import { activeIntegrationToken, findIdempotent, logConnectionActivity } from "./integrationModel";
import { consumeRate, notify, randomHex } from "./serverUtils";
import { encryptSecret, newWebhookSecret, secretHint, webhookKeyMaterial } from "./webhookCrypto";
import { buildBody, enqueueDelivery } from "./webhookEvents";
import {
  ANSWER_PAYLOAD_RETENTION_MS, AUTO_DISABLE_AFTER, eventTypeValidator, FAILING_AFTER, HISTORY_RETENTION_MS, isRetryable, MAX_ATTEMPTS,
  MAX_SUBSCRIPTIONS_PER_CONNECTION, MAX_SUBSCRIPTIONS_PER_OWNER, outcomeValidator, ROTATION_GRACE_MS, backoffDelay,
  PAYLOAD_RETENTION_MS, webhookEventTypes,
} from "./webhookModel";
import type { WebhookEventType } from "./webhookModel";
import { checkWebhookUrl } from "./webhookUrl";
import { validEvents } from "./webhookSubscriptionModel";
import { isLearnWebhookEvent, learnWebhookOwnerTitle, mayDeliverLearnWebhook } from "./learnWebhookEvents";

type Ctx = QueryCtx | MutationCtx;
type Subscription = Doc<"webhookSubscriptions">;

const URL_ERRORS: Record<string, string> = {
  invalid_url: "INVALID_URL: Enter a full web address, such as https://example.com/hooks/chaos.",
  too_long: "INVALID_URL: This address is too long.",
  https_required: "INVALID_URL: Use an https:// address.",
  credentials_not_allowed: "INVALID_URL: Remove the user name or password from the address.",
  port_not_allowed: "INVALID_URL: Use port 443 or a port above 1023.",
  ip_literal: "INVALID_URL: Use a host name, not an IP address.",
  internal_hostname: "INVALID_URL: This address points to a private or internal network.",
};

export function allowLocalhost(): boolean {
  return env.CHAOS_WEBHOOK_ALLOW_LOCALHOST === "1";
}

function validUrl(raw: string): string {
  const check = checkWebhookUrl(raw, { allowLocalhost: allowLocalhost() });
  if (!check.ok) throw new Error(URL_ERRORS[check.code] ?? URL_ERRORS.invalid_url);
  return check.url.toString();
}


async function ownerRefTitle(ctx: Ctx, ownerId: string, ref: string): Promise<string | null> {
  if (/^(lesson|collection)_/.test(ref)) return await learnWebhookOwnerTitle(ctx, ownerId, ref);
  const rawId = parseResourceRef(ref, "form");
  const id = rawId ? ctx.db.normalizeId("forms", rawId) : null;
  const form = id ? await ctx.db.get("forms", id) : null;
  return form && form.ownerId === ownerId ? form.title : null;
}

async function validRefs(ctx: Ctx, ownerId: string, refs: string[]): Promise<string[]> {
  if (refs.length > 200) throw new Error("TOO_MANY_ITEMS: Choose at most 200 items.");
  const out: string[] = [];
  for (const ref of new Set(refs)) {
    if ((await ownerRefTitle(ctx, ownerId, ref)) === null) throw new Error("INVALID_ITEM: One of the selected items is not yours.");
    out.push(ref);
  }
  if (!out.length) throw new Error("INVALID_ITEM: Choose at least one form or quiz, or choose all of them.");
  return out;
}

function health(sub: Subscription): "paused" | "disabled" | "failing" | "healthy" | "new" {
  if (sub.status !== "active") return sub.status;
  if (sub.consecutiveFailures >= FAILING_AFTER) return "failing";
  return sub.lastAttemptAt === undefined ? "new" : "healthy";
}

async function ownedSubscription(ctx: MutationCtx, subscriptionId: Id<"webhookSubscriptions">) {
  const { identity } = await requireActiveUser(ctx);
  const sub = await ctx.db.get("webhookSubscriptions", subscriptionId);
  if (!sub || !ownsRecord(sub, identity)) throw new Error("NOT_FOUND: Webhook not found.");
  return sub;
}

async function insertSubscription(
  ctx: MutationCtx,
  fields: Pick<Subscription, "ownerId" | "url" | "description" | "events" | "target" | "itemRefs" | "includeAnswers" | "connectionId">,
): Promise<{ subscriptionId: Id<"webhookSubscriptions">; secret: string }> {
  const material = webhookKeyMaterial();
  const existing = await ctx.db.query("webhookSubscriptions").withIndex("by_ownerId", (q) => q.eq("ownerId", fields.ownerId)).take(MAX_SUBSCRIPTIONS_PER_OWNER + 1);
  if (existing.length >= MAX_SUBSCRIPTIONS_PER_OWNER) throw new Error(`WEBHOOK_LIMIT: Keep at most ${MAX_SUBSCRIPTIONS_PER_OWNER} webhooks.`);
  const secret = newWebhookSecret();
  const now = Date.now();
  const subscriptionId = await ctx.db.insert("webhookSubscriptions", {
    ...fields,
    secretCiphertext: await encryptSecret(secret, material),
    secretHint: secretHint(secret),
    status: "active",
    consecutiveFailures: 0,
    createdAt: now,
    updatedAt: now,
  });
  // The plaintext secret is returned once and never stored.
  return { subscriptionId, secret };
}

async function rotate(ctx: MutationCtx, sub: Subscription): Promise<{ secret: string; previousSecretExpiresAt: number }> {
  const secret = newWebhookSecret();
  const previousSecretExpiresAt = Date.now() + ROTATION_GRACE_MS;
  await ctx.db.patch("webhookSubscriptions", sub._id, {
    secretCiphertext: await encryptSecret(secret),
    secretHint: secretHint(secret),
    // A second rotation inside the grace window drops the oldest secret.
    previousSecretCiphertext: sub.secretCiphertext,
    previousSecretExpiresAt,
    updatedAt: Date.now(),
  });
  return { secret, previousSecretExpiresAt };
}

async function queueTest(ctx: MutationCtx, sub: Subscription): Promise<Id<"webhookDeliveries">> {
  if (sub.status !== "active") throw new Error("WEBHOOK_INACTIVE: Resume this webhook before sending a test.");
  await consumeRate(ctx, `webhook-test:${sub._id}`, 10, 60_000);
  const eventId = `evt_${randomHex(12)}`;
  const body = buildBody(eventId, "webhook.test", Date.now(), {
    webhook: { id: sub._id, description: sub.description },
    message: "This is a test delivery from Chaos. Verify its signature the same way as real events.",
  });
  return await enqueueDelivery(ctx, sub, { event: "webhook.test", eventId, body, containsAnswers: false });
}

async function removeSubscription(ctx: MutationCtx, sub: Subscription) {
  await ctx.db.delete("webhookSubscriptions", sub._id);
  await ctx.scheduler.runAfter(0, internal.webhooks.purgeSubscription, { subscriptionId: sub._id });
}

// ── Owner-facing ────────────────────────────────────────────────────────────

export const listWebhooks = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return [];
    const subs = await ctx.db.query("webhookSubscriptions").withIndex("by_ownerId", (q) => q.eq("ownerId", identity.subject)).take(100);
    const out = [];
    for (const s of subs) {
      const items = [];
      for (const ref of s.itemRefs) items.push({ ref, title: await ownerRefTitle(ctx, identity.subject, ref) });
      const connection = s.connectionId ? await ctx.db.get("integrationTokens", s.connectionId) : null;
      out.push({
        _id: s._id, url: s.url, description: s.description, events: s.events, target: s.target, items,
        includeAnswers: s.includeAnswers, secretHint: s.secretHint,
        previousSecretExpiresAt: s.previousSecretCiphertext ? (s.previousSecretExpiresAt ?? null) : null,
        status: s.status, disabledReason: s.disabledReason ?? null, health: health(s),
        consecutiveFailures: s.consecutiveFailures,
        lastAttemptAt: s.lastAttemptAt ?? null, lastSuccessAt: s.lastSuccessAt ?? null, lastFailureAt: s.lastFailureAt ?? null,
        lastOutcome: s.lastOutcome ?? null,
        connection: s.connectionId ? { id: s.connectionId, label: connection?.label ?? null } : null,
        createdAt: s.createdAt,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Delivery history for one webhook: the latest deliveries with their attempts. Never includes payloads or endpoint responses. */
export const listDeliveries = query({
  args: { subscriptionId: v.id("webhookSubscriptions") },
  handler: async (ctx, args) => {
    const identity = await getAuthIdentity(ctx);
    if (!identity) return [];
    const sub = await ctx.db.get("webhookSubscriptions", args.subscriptionId);
    if (!sub || !ownsRecord(sub, identity)) return [];
    const deliveries = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_subscriptionId_and_createdAt", (q) => q.eq("subscriptionId", sub._id))
      .order("desc")
      .take(25);
    const out = [];
    for (const d of deliveries) {
      const attempts = await ctx.db
        .query("webhookAttempts")
        .withIndex("by_deliveryId_and_attempt", (q) => q.eq("deliveryId", d._id))
        .order("desc")
        .take(10);
      out.push({
        _id: d._id, event: d.event, eventId: d.eventId, itemRef: d.itemRef ?? null, status: d.status, attempts: d.attempts,
        nextAttemptAt: d.status === "pending" || d.status === "retrying" ? (d.nextAttemptAt ?? null) : null,
        lastStatusCode: d.lastStatusCode ?? null, lastOutcome: d.lastOutcome ?? null,
        containsAnswers: d.containsAnswers,
        payloadAvailable: d.payload !== undefined,
        // Keep the numeric history contract after erasure; this does not put the row back in the expiry index.
        payloadExpiresAt: d.payloadExpiresAt ?? d.createdAt + (d.containsAnswers ? ANSWER_PAYLOAD_RETENTION_MS : PAYLOAD_RETENTION_MS),
        createdAt: d.createdAt,
        attemptLog: attempts.map((a) => ({ attempt: a.attempt, at: a.at, durationMs: a.durationMs, statusCode: a.statusCode ?? null, outcome: a.outcome, detail: a.detail ?? null })),
      });
    }
    return out;
  },
});

export const createWebhook = mutation({
  args: {
    url: v.string(),
    description: v.string(),
    events: v.array(eventTypeValidator),
    target: v.union(v.literal("all"), v.literal("selected")),
    itemRefs: v.array(v.string()),
    includeAnswers: v.boolean(),
  },
  returns: v.object({ subscriptionId: v.id("webhookSubscriptions"), secret: v.string() }),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    return await insertSubscription(ctx, {
      ownerId: identity.subject,
      url: validUrl(args.url),
      description: args.description.trim().slice(0, 80),
      events: validEvents(args.events),
      target: args.target,
      itemRefs: args.target === "selected" ? await validRefs(ctx, identity.subject, args.itemRefs) : [],
      includeAnswers: args.includeAnswers,
      connectionId: undefined,
    });
  },
});

export const updateWebhook = mutation({
  args: {
    subscriptionId: v.id("webhookSubscriptions"),
    url: v.optional(v.string()),
    description: v.optional(v.string()),
    events: v.optional(v.array(eventTypeValidator)),
    target: v.optional(v.union(v.literal("all"), v.literal("selected"))),
    itemRefs: v.optional(v.array(v.string())),
    includeAnswers: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sub = await ownedSubscription(ctx, args.subscriptionId);
    if (sub.connectionId && (args.target !== undefined || args.includeAnswers)) {
      throw new Error("MANAGED_BY_CONNECTION: This webhook follows its connection's access and never includes answers.");
    }
    const target = args.target ?? sub.target;
    await ctx.db.patch("webhookSubscriptions", sub._id, {
      url: args.url !== undefined ? validUrl(args.url) : sub.url,
      description: args.description !== undefined ? args.description.trim().slice(0, 80) : sub.description,
      events: args.events ? validEvents(args.events) : sub.events,
      target,
      itemRefs: target !== "selected" ? [] : args.itemRefs ? await validRefs(ctx, sub.ownerId, args.itemRefs) : sub.itemRefs,
      includeAnswers: args.includeAnswers ?? sub.includeAnswers,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Pause or resume. Resuming a webhook that was switched off after failures starts a fresh failure count. */
export const setWebhookPaused = mutation({
  args: { subscriptionId: v.id("webhookSubscriptions"), paused: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sub = await ownedSubscription(ctx, args.subscriptionId);
    if (!args.paused && sub.disabledReason === "connection_revoked") throw new Error("CONNECTION_REVOKED: Its connection was revoked. Delete this webhook and create a new one.");
    await ctx.db.patch("webhookSubscriptions", sub._id, args.paused
      ? { status: "paused", updatedAt: Date.now() }
      : { status: "active", disabledReason: undefined, consecutiveFailures: 0, updatedAt: Date.now() });
    return null;
  },
});

export const deleteWebhook = mutation({
  args: { subscriptionId: v.id("webhookSubscriptions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeSubscription(ctx, await ownedSubscription(ctx, args.subscriptionId));
    return null;
  },
});

export const rotateWebhookSecret = mutation({
  args: { subscriptionId: v.id("webhookSubscriptions") },
  returns: v.object({ secret: v.string(), previousSecretExpiresAt: v.number() }),
  handler: async (ctx, args) => await rotate(ctx, await ownedSubscription(ctx, args.subscriptionId)),
});

export const sendTestWebhook = mutation({
  args: { subscriptionId: v.id("webhookSubscriptions") },
  returns: v.id("webhookDeliveries"),
  handler: async (ctx, args) => await queueTest(ctx, await ownedSubscription(ctx, args.subscriptionId)),
});

/** Sends a finished delivery again with the same body and Chaos-Delivery id: one attempt, no automatic retries. */
export const resendDelivery = mutation({
  args: { deliveryId: v.id("webhookDeliveries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const delivery = await ctx.db.get("webhookDeliveries", args.deliveryId);
    if (!delivery || !ownsRecord(delivery, identity)) throw new Error("NOT_FOUND: Delivery not found.");
    const sub = await ctx.db.get("webhookSubscriptions", delivery.subscriptionId);
    if (!sub) throw new Error("NOT_FOUND: Webhook not found.");
    if (sub.status !== "active") throw new Error("WEBHOOK_INACTIVE: Resume this webhook before resending.");
    if (delivery.status === "pending" || delivery.status === "retrying") throw new Error("IN_PROGRESS: This delivery is still being attempted.");
    if (delivery.payload === undefined || delivery.payloadExpiresAt === undefined || delivery.payloadExpiresAt < Date.now()) throw new Error("PAYLOAD_EXPIRED: This delivery is too old to resend.");
    await consumeRate(ctx, `webhook-resend:${sub._id}`, 30, 60_000);
    await ctx.db.patch("webhookDeliveries", delivery._id, { status: "pending", manual: true, nextAttemptAt: Date.now(), updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.webhookDelivery.deliver, { deliveryId: delivery._id });
    return null;
  },
});

// ── Delivery bookkeeping (called by the delivery action) ────────────────────

/** Recheck the current grant, not just the permission when the event was queued. */
async function mayDeliver(ctx: MutationCtx, sub: Subscription, delivery: Doc<"webhookDeliveries">): Promise<boolean> {
  if (delivery.ownerId !== sub.ownerId) return false;
  if (delivery.containsAnswers && !sub.includeAnswers) return false;
  const owner = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", sub.ownerId)).first();
  if (!owner || owner.isBanned || owner.suspendedUntil) return false;
  const token = sub.connectionId ? await ctx.db.get("integrationTokens", sub.connectionId) : null;
  if (sub.connectionId || sub.target === "connection") {
    if (!token || sub.target !== "connection" || token.ownerId !== sub.ownerId || token.revokedAt
      || (token.expiresAt !== undefined && token.expiresAt <= Date.now())
      || !token.scopes.includes("webhooks:manage") || sub.includeAnswers || delivery.containsAnswers) return false;
  }
  // Test events have no item; they still require an active owner and connection.
  if (delivery.event === "webhook.test") return !delivery.containsAnswers;
  if (!sub.events.includes(delivery.event) || !delivery.itemRef) return false;
  if (isLearnWebhookEvent(delivery.event)) return !delivery.containsAnswers && await mayDeliverLearnWebhook(ctx, sub, delivery.event, delivery.itemRef);
  const ref = delivery.itemRef;
  const rawId = parseResourceRef(ref, "form");
  const id = rawId ? ctx.db.normalizeId("forms", rawId) : null;
  const form = id ? await ctx.db.get("forms", id) : null;
  if (!form || form.ownerId !== sub.ownerId || form.isBanned) return false;
  if (token) {
    if (token.access === "all" || token.itemRefs.includes(ref)) return true;
    return !!(await ctx.db.query("integrationCreatedItems")
      .withIndex("by_tokenId_and_itemRef", (q) => q.eq("tokenId", token._id).eq("itemRef", ref)).first());
  }
  return sub.target === "all" || (sub.target === "selected" && sub.itemRefs.includes(ref));
}

/**
 * Starts an attempt: returns what to send, or null when the delivery should not
 * be sent (already finished, or its webhook was paused, switched off or deleted).
 */
export const claimAttempt = internalMutation({
  args: { deliveryId: v.id("webhookDeliveries") },
  returns: v.union(
    v.null(),
    v.object({
      url: v.string(), body: v.string(), event: v.string(), attempt: v.number(),
      secretCiphertexts: v.array(v.string()), allowLocalhost: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get("webhookDeliveries", args.deliveryId);
    if (!delivery || (delivery.status !== "pending" && delivery.status !== "retrying")) return null;
    const sub = await ctx.db.get("webhookSubscriptions", delivery.subscriptionId);
    if (!sub || sub.status !== "active" || delivery.payload === undefined || !(await mayDeliver(ctx, sub, delivery))) {
      await ctx.db.patch("webhookDeliveries", delivery._id, { status: "cancelled", nextAttemptAt: undefined, updatedAt: Date.now() });
      return null;
    }
    const secrets = [sub.secretCiphertext];
    if (sub.previousSecretCiphertext && (sub.previousSecretExpiresAt ?? 0) > Date.now()) secrets.push(sub.previousSecretCiphertext);
    return { url: sub.url, body: delivery.payload, event: delivery.event, attempt: delivery.attempts + 1, secretCiphertexts: secrets, allowLocalhost: allowLocalhost() };
  },
});

export const recordAttempt = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    attempt: v.number(),
    outcome: outcomeValidator,
    statusCode: v.optional(v.number()),
    durationMs: v.number(),
    detail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get("webhookDeliveries", args.deliveryId);
    if (!delivery) return null;
    const now = Date.now();
    await ctx.db.insert("webhookAttempts", {
      deliveryId: delivery._id, subscriptionId: delivery.subscriptionId, attempt: args.attempt, at: now,
      durationMs: Math.max(0, Math.round(args.durationMs)), statusCode: args.statusCode, outcome: args.outcome,
      detail: args.detail?.slice(0, 80),
    });
    const success = args.outcome === "success";
    const retry = !success && !delivery.manual && args.attempt < MAX_ATTEMPTS && isRetryable(args.outcome, args.statusCode);
    const delay = retry ? backoffDelay(args.attempt) : 0;
    await ctx.db.patch("webhookDeliveries", delivery._id, {
      attempts: args.attempt,
      status: success ? "succeeded" : retry ? "retrying" : "failed",
      nextAttemptAt: retry ? now + delay : undefined,
      lastStatusCode: args.statusCode,
      lastOutcome: args.outcome,
      manual: undefined,
      updatedAt: now,
    });
    if (retry) await ctx.scheduler.runAfter(delay, internal.webhookDelivery.deliver, { deliveryId: delivery._id });

    const sub = await ctx.db.get("webhookSubscriptions", delivery.subscriptionId);
    if (!sub) return null;
    const failures = success ? 0 : sub.consecutiveFailures + 1;
    const disable = !success && sub.status === "active" && failures >= AUTO_DISABLE_AFTER;
    await ctx.db.patch("webhookSubscriptions", sub._id, {
      consecutiveFailures: failures,
      lastAttemptAt: now,
      lastOutcome: args.outcome,
      ...(success ? { lastSuccessAt: now } : { lastFailureAt: now }),
      ...(disable ? { status: "disabled" as const, disabledReason: "failures" as const } : {}),
    });
    if (disable) {
      const host = (() => { try { return new URL(sub.url).host; } catch { return sub.url; } })();
      await notify(ctx, sub.ownerId, "webhook", `Webhook to ${host} was switched off after ${failures} failed deliveries in a row. Fix the endpoint, then resume it in Connections.`, `webhook-disabled:${sub._id}:${now}`);
    }
    return null;
  },
});

// ── Retention ───────────────────────────────────────────────────────────────

const PRUNE_BATCH = 200;
/** Leave transaction headroom even when payloads contain large answer sets. */
const PRUNE_BYTES = 2 * 1024 * 1024;
const RETRY_PAYLOAD_GRACE_MS = 2 * 86_400_000;

/**
 * Erases payloads after their retention (24 h when they contain answers, 7 days
 * otherwise), deletes history older than 30 days and forgets expired rotation secrets.
 */
export const pruneHistory = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    let more = false;
    const expired = await ctx.db.query("webhookDeliveries")
      .withIndex("by_payloadExpiresAt", (q) => q.gt("payloadExpiresAt", undefined).lt("payloadExpiresAt", now))
      .paginate({ numItems: PRUNE_BATCH, cursor: null, maximumBytesRead: PRUNE_BYTES });
    for (const d of expired.page) {
      const waiting = d.status === "pending" || d.status === "retrying";
      // Move retained retries out of this scan; they cannot starve later expired payloads.
      if (d.payload !== undefined && waiting && d.createdAt + RETRY_PAYLOAD_GRACE_MS > now) {
        await ctx.db.patch("webhookDeliveries", d._id, { payloadExpiresAt: d.createdAt + RETRY_PAYLOAD_GRACE_MS });
        continue;
      }
      // Legacy cleared rows may still carry an expiry. Remove it too, and stop bodyless retries.
      await ctx.db.patch("webhookDeliveries", d._id, {
        payload: undefined, payloadExpiresAt: undefined,
        ...(waiting ? { status: "failed" as const, nextAttemptAt: undefined } : {}),
      });
    }
    more ||= !expired.isDone;
    // Convex allows only one paginate call per execution. Bound the other scans by
    // both row count and actual transaction reads (one document may cross the byte cap).
    let historyStart = (await ctx.meta.getTransactionMetrics()).bytesRead.used;
    let count = 0;
    for await (const d of ctx.db.query("webhookDeliveries").withIndex("by_createdAt", (q) => q.lt("createdAt", now - HISTORY_RETENTION_MS))) {
      await ctx.db.delete("webhookDeliveries", d._id);
      count++;
      if (count >= PRUNE_BATCH || (await ctx.meta.getTransactionMetrics()).bytesRead.used - historyStart >= PRUNE_BYTES) {
        more = true;
        break;
      }
    }
    historyStart = (await ctx.meta.getTransactionMetrics()).bytesRead.used;
    count = 0;
    for await (const a of ctx.db.query("webhookAttempts").withIndex("by_at", (q) => q.lt("at", now - HISTORY_RETENTION_MS))) {
      await ctx.db.delete("webhookAttempts", a._id);
      count++;
      if (count >= PRUNE_BATCH || (await ctx.meta.getTransactionMetrics()).bytesRead.used - historyStart >= PRUNE_BYTES) {
        more = true;
        break;
      }
    }
    if (more) await ctx.scheduler.runAfter(1000, internal.webhooks.pruneHistory, {});
    return null;
  },
});

export const purgeSubscription = internalMutation({
  args: { subscriptionId: v.id("webhookSubscriptions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const deliveries = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_subscriptionId_and_createdAt", (q) => q.eq("subscriptionId", args.subscriptionId))
      .take(50);
    for (const d of deliveries) {
      const attempts = await ctx.db.query("webhookAttempts").withIndex("by_deliveryId_and_attempt", (q) => q.eq("deliveryId", d._id)).take(MAX_ATTEMPTS + 20);
      for (const a of attempts) await ctx.db.delete("webhookAttempts", a._id);
      await ctx.db.delete("webhookDeliveries", d._id);
    }
    if (deliveries.length === 50) await ctx.scheduler.runAfter(0, internal.webhooks.purgeSubscription, args);
    return null;
  },
});

/** Called when a connection is revoked: its webhooks stop at once. */
export async function disableConnectionWebhooks(ctx: MutationCtx, tokenId: Id<"integrationTokens">) {
  const subs = await ctx.db.query("webhookSubscriptions").withIndex("by_connectionId", (q) => q.eq("connectionId", tokenId)).take(100);
  for (const s of subs) await ctx.db.patch("webhookSubscriptions", s._id, { status: "disabled", disabledReason: "connection_revoked", updatedAt: Date.now() });
}

// ── Integration API (generic; any connection with webhooks:manage) ──────────

const ok = (body: unknown, status = 200): ApiResult => ({ status, body });
const fail = (status: number, code: string, message: string, details?: unknown): ApiResult => ({
  status, body: { error: details === undefined ? { code, message } : { code, message, details } },
});

async function activeToken(ctx: Ctx, tokenId: Id<"integrationTokens">, now: number) {
  return await activeIntegrationToken(ctx, tokenId, now);
}

function apiView(s: Subscription) {
  return {
    id: s._id, url: s.url, description: s.description, events: s.events, status: s.status,
    health: health(s), secretHint: s.secretHint,
    previousSecretExpiresAt: s.previousSecretCiphertext ? (s.previousSecretExpiresAt ?? null) : null,
    lastSuccessAt: s.lastSuccessAt ?? null, lastFailureAt: s.lastFailureAt ?? null, createdAt: s.createdAt,
  };
}

async function connectionSubscription(ctx: Ctx, tokenId: Id<"integrationTokens">, id: string): Promise<Subscription | null> {
  const subId = ctx.db.normalizeId("webhookSubscriptions", id);
  const sub = subId ? await ctx.db.get("webhookSubscriptions", subId) : null;
  return sub && sub.connectionId === tokenId ? sub : null;
}

const notFound = () => fail(404, "NOT_FOUND", "This webhook does not exist or was not created by this connection.");

function errorResult(error: unknown): ApiResult {
  const raw = error instanceof Error ? error.message : String(error);
  const match = /^([A-Z_]+): ([\s\S]*)$/.exec(raw);
  if (match?.[1] === "WEBHOOKS_NOT_CONFIGURED") return fail(503, match[1], match[2]);
  if (match?.[1] === "RATE_LIMITED") return fail(429, match[1], match[2]);
  if (match?.[1] === "WEBHOOK_INACTIVE" || match?.[1] === "WEBHOOK_LIMIT") return fail(409, match[1], match[2]);
  return fail(400, "VALIDATION_FAILED", match ? match[2] : "The request is invalid.");
}

export const apiListWebhooks = internalQuery({
  args: { tokenId: v.id("integrationTokens"), now: v.number() },
  handler: async (ctx, args): Promise<ApiResult> => {
    const token = await activeToken(ctx, args.tokenId, args.now);
    if (!token) return fail(401, "TOKEN_REVOKED", "This connection was revoked.");
    if (!token.scopes.includes("webhooks:manage")) return fail(403, "INSUFFICIENT_SCOPE", "This connection does not have the webhooks:manage permission.");
    const subs = await ctx.db.query("webhookSubscriptions").withIndex("by_connectionId", (q) => q.eq("connectionId", token._id)).take(50);
    return ok({ webhooks: subs.map(apiView), eventTypes: webhookEventTypes });
  },
});

export const apiCreateWebhook = internalMutation({
  args: { tokenId: v.id("integrationTokens"), idempotencyKey: v.string(), requestHash: v.string(), body: v.any() },
  handler: async (ctx, args): Promise<ApiResult> => {
    const token = await activeToken(ctx, args.tokenId, Date.now());
    if (!token) return fail(401, "TOKEN_REVOKED", "This connection was revoked.");
    if (!token.scopes.includes("webhooks:manage")) return fail(403, "INSUFFICIENT_SCOPE", "This connection does not have the webhooks:manage permission.");
    const prior = await findIdempotent(ctx, token._id, args.idempotencyKey);
    if (prior) {
      if (prior.requestHash !== args.requestHash) return fail(422, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was used for a different request. Use a new key for a new request.");
      // Replays never repeat the secret; it is not stored anywhere.
      return { status: 200, body: JSON.parse(prior.body), headers: { "Idempotent-Replayed": "true" } };
    }
    const b = (args.body ?? {}) as { url?: unknown; events?: unknown; description?: unknown };
    if (typeof b.url !== "string") return fail(400, "VALIDATION_FAILED", "url is required.");
    if (!Array.isArray(b.events) || b.events.some((e) => typeof e !== "string" || !webhookEventTypes.includes(e as WebhookEventType))) {
      return fail(400, "VALIDATION_FAILED", `events must list some of: ${webhookEventTypes.join(", ")}.`);
    }
    const own = await ctx.db.query("webhookSubscriptions").withIndex("by_connectionId", (q) => q.eq("connectionId", token._id)).take(MAX_SUBSCRIPTIONS_PER_CONNECTION + 1);
    if (own.length >= MAX_SUBSCRIPTIONS_PER_CONNECTION) return fail(409, "WEBHOOK_LIMIT", `A connection can keep at most ${MAX_SUBSCRIPTIONS_PER_CONNECTION} webhooks.`);
    let created;
    try {
      created = await insertSubscription(ctx, {
        ownerId: token.ownerId,
        url: validUrl(b.url),
        description: (typeof b.description === "string" ? b.description : token.label).trim().slice(0, 80),
        events: validEvents(b.events as WebhookEventType[]),
        target: "connection",
        itemRefs: [],
        includeAnswers: false,
        connectionId: token._id,
      });
    } catch (error) {
      return errorResult(error);
    }
    const view = apiView((await ctx.db.get("webhookSubscriptions", created.subscriptionId))!);
    await ctx.db.insert("integrationIdempotency", {
      tokenId: token._id, key: args.idempotencyKey, requestHash: args.requestHash, status: 201,
      body: JSON.stringify({ webhook: view, secret: null }), createdAt: Date.now(),
    });
    await logConnectionActivity(ctx, token._id, "webhook.created");
    return ok({ webhook: view, secret: created.secret }, 201);
  },
});

export const apiWebhookAction = internalMutation({
  args: { tokenId: v.id("integrationTokens"), id: v.string(), action: v.union(v.literal("delete"), v.literal("rotate"), v.literal("test")) },
  handler: async (ctx, args): Promise<ApiResult> => {
    const token = await activeToken(ctx, args.tokenId, Date.now());
    if (!token) return fail(401, "TOKEN_REVOKED", "This connection was revoked.");
    if (!token.scopes.includes("webhooks:manage")) return fail(403, "INSUFFICIENT_SCOPE", "This connection does not have the webhooks:manage permission.");
    const sub = await connectionSubscription(ctx, token._id, args.id);
    if (!sub) return notFound();
    try {
      await logConnectionActivity(ctx, token._id, `webhook.${args.action === "delete" ? "deleted" : args.action === "rotate" ? "rotated" : "tested"}`);
      if (args.action === "delete") {
        await removeSubscription(ctx, sub);
        return ok({ deleted: true });
      }
      if (args.action === "rotate") {
        const r = await rotate(ctx, sub);
        return ok({ webhook: apiView((await ctx.db.get("webhookSubscriptions", sub._id))!), secret: r.secret, previousSecretExpiresAt: r.previousSecretExpiresAt });
      }
      const deliveryId = await queueTest(ctx, sub);
      return ok({ deliveryId }, 202);
    } catch (error) {
      return errorResult(error);
    }
  },
});
