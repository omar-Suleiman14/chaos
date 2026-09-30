import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { emptyDefinition } from "@/convex/formLogic";
import { transport } from "@/convex/webhookDelivery";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

type T = ReturnType<typeof createTestConvex>;
const DAY = 86_400_000;
const realResolve = transport.resolve;
const realSend = transport.send;

beforeEach(() => {
  process.env.CHAOS_WEBHOOK_KEY = "test-webhook-hardening-key-0123456789abcdef";
});
afterEach(() => {
  transport.resolve = realResolve;
  transport.send = realSend;
  delete process.env.CHAOS_WEBHOOK_KEY;
});

async function setup(t: T, connected = false) {
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { definition: emptyDefinition("Webhook hardening") });
  const ref = `form_${formId}`;
  let tokenId: Id<"integrationTokens"> | undefined;
  let subscriptionId: Id<"webhookSubscriptions">;
  if (connected) {
    const connection = await owner.mutation(api.integrations.createConnection, {
      label: "Webhook tests", scopes: ["webhooks:manage"], access: "selected", itemRefs: [ref],
    });
    tokenId = connection.tokenId;
    const result = await t.fetch("/api/integrations/v1/webhooks", {
      method: "POST",
      headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json", "Idempotency-Key": "hardening-hook" },
      body: JSON.stringify({ url: "https://hooks.example.com/chaos", events: ["response.completed"] }),
    });
    expect(result.status).toBe(201);
    subscriptionId = (await result.json()).webhook.id;
  } else {
    ({ subscriptionId } = await owner.mutation(api.webhooks.createWebhook, {
      url: "https://hooks.example.com/chaos", description: "Hardening", events: ["response.completed"],
      target: "all", itemRefs: [], includeAnswers: false,
    }));
  }
  return { owner, formId, ref, tokenId, subscriptionId };
}

async function delivery(t: T, subscriptionId: Id<"webhookSubscriptions">, ref: string, patch: Partial<Doc<"webhookDeliveries">> = {}) {
  return await t.run(async (ctx) => await ctx.db.insert("webhookDeliveries", {
    subscriptionId, ownerId: creatorIdentity.subject, event: "response.completed", eventId: "evt_hardening", itemRef: ref,
    payload: JSON.stringify({ synthetic: "metadata" }), containsAnswers: false, payloadExpiresAt: Date.now() + 7 * DAY,
    status: "pending", attempts: 0, nextAttemptAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(), ...patch,
  }));
}

describe("webhook hardening: payload retention", () => {
  it("drains 401 payloads past legacy cleared and actively retrying rows using bounded scheduled continuations", async () => {
    const t = createTestConvex();
    const { owner, subscriptionId, ref } = await setup(t);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const base = {
        subscriptionId, ownerId: creatorIdentity.subject, event: "response.completed" as const, eventId: "evt_retention", itemRef: ref,
        containsAnswers: true, attempts: 1, updatedAt: now,
      };
      const cleared = [], retrying = [], expired = [];
      for (let i = 0; i < 201; i++) {
        cleared.push(await ctx.db.insert("webhookDeliveries", {
          ...base, status: "retrying", nextAttemptAt: now, payloadExpiresAt: now - 2 * DAY,
          createdAt: now - 3 * DAY,
        }));
        retrying.push(await ctx.db.insert("webhookDeliveries", {
          ...base, status: "retrying", nextAttemptAt: now + 100_000, payload: "synthetic retry answers",
          payloadExpiresAt: now - 3_600_000, createdAt: now - 25 * 3_600_000,
        }));
      }
      for (let i = 0; i < 401; i++) expired.push(await ctx.db.insert("webhookDeliveries", {
        ...base, status: "succeeded", payload: "synthetic expired answers", payloadExpiresAt: now - 1000,
        createdAt: now - 3 * DAY,
      }));
      return { cleared, retrying, expired };
    });
    await t.mutation(internal.webhooks.pruneHistory, {});
    const firstBatch = await t.run(async (ctx) => await ctx.db.query("webhookDeliveries").collect());
    expect(firstBatch.filter((d) => d.payloadExpiresAt === undefined)).toHaveLength(200);
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(1001);
      await t.finishInProgressScheduledFunctions();
    }
    const rows = await t.run(async (ctx) => await ctx.db.query("webhookDeliveries").collect());
    const byId = new Map(rows.map((d) => [d._id, d]));
    for (const id of ids.expired) {
      expect(byId.get(id)?.payload).toBeUndefined();
      expect(byId.get(id)?.payloadExpiresAt).toBeUndefined();
    }
    for (const id of ids.cleared) {
      expect(byId.get(id)?.status).toBe("failed");
      expect(byId.get(id)?.nextAttemptAt).toBeUndefined();
      expect(byId.get(id)?.payloadExpiresAt).toBeUndefined();
    }
    for (const id of ids.retrying) expect(byId.get(id)).toMatchObject({ status: "retrying", payload: "synthetic retry answers", payloadExpiresAt: now + 23 * 3_600_000 });
    expect(await t.run(async (ctx) => await ctx.db.query("webhookDeliveries")
      .withIndex("by_payloadExpiresAt", (q) => q.gt("payloadExpiresAt", undefined).lt("payloadExpiresAt", Date.now())).collect())).toHaveLength(0);
    vi.advanceTimersByTime(DAY);
    await t.mutation(internal.webhooks.pruneHistory, {});
    for (let i = 0; i < 2; i++) {
      vi.advanceTimersByTime(1001);
      await t.finishInProgressScheduledFunctions();
    }
    const later = await t.run(async (ctx) => await ctx.db.query("webhookDeliveries").collect());
    expect(later.every((d) => d.payload === undefined && d.payloadExpiresAt === undefined)).toBe(true);
    expect(later.filter((d) => ids.retrying.includes(d._id)).every((d) => d.status === "failed" && d.nextAttemptAt === undefined)).toBe(true);
    const history = await owner.query(api.webhooks.listDeliveries, { subscriptionId });
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((d) => !d.payloadAvailable && Number.isFinite(d.payloadExpiresAt))).toBe(true);
  });

  it("stops a large-payload page by bytes and finishes through scheduled continuations", async () => {
    const t = createTestConvex();
    const { subscriptionId, ref } = await setup(t);
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 30; i++) await ctx.db.insert("webhookDeliveries", {
        subscriptionId, ownerId: creatorIdentity.subject, event: "response.completed", eventId: `evt_large_${i}`, itemRef: ref,
        payload: "x".repeat(300_000), containsAnswers: true, payloadExpiresAt: now - 1000,
        status: "succeeded", attempts: 1, createdAt: now - 3 * DAY, updatedAt: now,
      });
    });
    await t.mutation(internal.webhooks.pruneHistory, {});
    const first = await t.run(async (ctx) => await ctx.db.query("webhookDeliveries").collect());
    const erased = first.filter((d) => d.payload === undefined).length;
    expect(erased).toBeGreaterThan(0);
    // At most one document crosses the 2-MiB read threshold.
    expect(erased).toBeLessThanOrEqual(8);
    expect(first.some((d) => d.payload !== undefined)).toBe(true);
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(1001);
      await t.finishInProgressScheduledFunctions();
    }
    const final = await t.run(async (ctx) => await ctx.db.query("webhookDeliveries").collect());
    expect(final).toHaveLength(30);
    expect(final.every((d) => d.payload === undefined && d.payloadExpiresAt === undefined)).toBe(true);
  });
});

describe("webhook hardening: authorization at delivery", () => {
  it.each(["scope", "items", "expiry", "expiry-boundary", "suspension", "ban", "token-owner", "delivery-owner", "subscription-target", "answers", "deleted-item", "item-owner", "missing-connection"] as const)(
    "cancels queued attempts after %s changes, before decrypting or contacting the endpoint",
    async (change) => {
      const t = createTestConvex();
      const { owner, tokenId, subscriptionId, formId, ref } = await setup(t, true);
      const id = await delivery(t, subscriptionId, ref, { status: "retrying", attempts: 1 });
      if (change === "scope") await owner.mutation(api.integrations.updateConnection, { tokenId: tokenId!, scopes: ["items:read"] });
      if (change === "items") await owner.mutation(api.integrations.updateConnection, { tokenId: tokenId!, itemRefs: [] });
      await t.run(async (ctx) => {
        if (change === "expiry" || change === "expiry-boundary") await ctx.db.patch("integrationTokens", tokenId!, { expiresAt: Date.now() - (change === "expiry" ? 1 : 0) });
        if (change === "suspension" || change === "ban") {
          const user = (await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", creatorIdentity.subject)).unique())!;
          await ctx.db.patch("users", user._id, change === "ban" ? { isBanned: true } : { suspendedUntil: Date.now() + DAY });
        }
        if (change === "token-owner") await ctx.db.patch("integrationTokens", tokenId!, { ownerId: otherCreatorIdentity.subject });
        if (change === "delivery-owner") await ctx.db.patch("webhookDeliveries", id, { ownerId: otherCreatorIdentity.subject });
        if (change === "subscription-target") await ctx.db.patch("webhookSubscriptions", subscriptionId, { target: "all" });
        if (change === "answers") await ctx.db.patch("webhookDeliveries", id, { containsAnswers: true });
        if (change === "deleted-item") await ctx.db.delete("forms", formId);
        if (change === "item-owner") await ctx.db.patch("forms", formId, { ownerId: otherCreatorIdentity.subject });
        if (change === "missing-connection") await ctx.db.delete("integrationTokens", tokenId!);
        // An unauthorized job must never reach decryption, even with malformed stored ciphertext.
        await ctx.db.patch("webhookSubscriptions", subscriptionId, { secretCiphertext: "invalid-ciphertext" });
      });
      const resolve = vi.fn(async () => [{ address: "93.184.216.34", family: 4 as const }]);
      const send = vi.fn(async () => ({ statusCode: 200 }));
      transport.resolve = resolve;
      transport.send = send;
      await t.action(internal.webhookDelivery.deliver, { deliveryId: id });
      expect(await t.mutation(internal.webhooks.claimAttempt, { deliveryId: id })).toBeNull();
      expect(resolve).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      const cancelled = await t.run(async (ctx) => await ctx.db.get("webhookDeliveries", id));
      expect(cancelled).toMatchObject({ status: "cancelled", attempts: 1 });
      expect(cancelled?.nextAttemptAt).toBeUndefined();
      expect(await t.run(async (ctx) => await ctx.db.query("webhookAttempts").collect())).toHaveLength(0);
    },
  );

  it("preserves selected, all-access and connection-created access, and authorized test deliveries", async () => {
    const t = createTestConvex();
    const { owner, tokenId, subscriptionId, ref } = await setup(t, true);
    const id = await delivery(t, subscriptionId, ref);
    expect(await t.mutation(internal.webhooks.claimAttempt, { deliveryId: id })).not.toBeNull();
    await owner.mutation(api.integrations.updateConnection, { tokenId: tokenId!, access: "all" });
    expect(await t.mutation(internal.webhooks.claimAttempt, { deliveryId: id })).not.toBeNull();
    await owner.mutation(api.integrations.updateConnection, { tokenId: tokenId!, access: "selected", itemRefs: [] });
    await t.run(async (ctx) => await ctx.db.insert("integrationCreatedItems", { tokenId: tokenId!, itemRef: ref, createdAt: Date.now() }));
    expect(await t.mutation(internal.webhooks.claimAttempt, { deliveryId: id })).not.toBeNull();
    const testId = await delivery(t, subscriptionId, ref, { event: "webhook.test", itemRef: undefined });
    expect(await t.mutation(internal.webhooks.claimAttempt, { deliveryId: testId })).not.toBeNull();
  });

  it("rechecks an owner's selected items and supports ordinary owner test deliveries", async () => {
    const t = createTestConvex();
    const { owner, subscriptionId, ref } = await setup(t);
    const id = await delivery(t, subscriptionId, ref);
    expect(await t.mutation(internal.webhooks.claimAttempt, { deliveryId: id })).not.toBeNull();
    const otherId = await owner.mutation(api.forms.createForm, { definition: emptyDefinition("Other item") });
    await owner.mutation(api.webhooks.updateWebhook, { subscriptionId, target: "selected", itemRefs: [`form_${otherId}`] });
    expect(await t.mutation(internal.webhooks.claimAttempt, { deliveryId: id })).toBeNull();
    const testId = await delivery(t, subscriptionId, ref, { event: "webhook.test", itemRef: undefined });
    expect(await t.mutation(internal.webhooks.claimAttempt, { deliveryId: testId })).not.toBeNull();
  });
});
