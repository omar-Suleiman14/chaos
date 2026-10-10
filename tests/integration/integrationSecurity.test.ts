import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { emptyDefinition } from "@/convex/formLogic";
import { sha256Hex } from "@/convex/serverUtils";
import { transport } from "@/convex/webhookDelivery";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

const resolve = transport.resolve;
const send = transport.send;
beforeEach(() => { process.env.CHAOS_WEBHOOK_KEY = "test-integration-security-0123456789abcdef"; });
afterEach(() => {
  transport.resolve = resolve;
  transport.send = send;
  delete process.env.CHAOS_WEBHOOK_KEY;
});

async function setup() {
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { definition: emptyDefinition("Integration checks") });
  const connection = await owner.mutation(api.integrations.createConnection, {
    label: "Checks", scopes: ["items:read", "definitions:read", "summaries:read", "drafts:create", "drafts:update", "webhooks:manage"],
    access: "selected", itemRefs: [`form_${formId}`],
  });
  return { t, owner, formId, ref: `form_${formId}`, ...connection };
}

describe("integration operation permissions", () => {
  it("checks expiry using the explicit query timestamp", async () => {
    const { t, tokenId, ref } = await setup();
    const expiresAt = Date.now() + 60_000;
    await t.run((ctx) => ctx.db.patch("integrationTokens", tokenId, { expiresAt }));
    expect((await t.query(internal.integrations.getDefinition, { tokenId, ref, now: expiresAt - 1 })).status).toBe(200);
    expect((await t.query(internal.integrations.getDefinition, { tokenId, ref, now: expiresAt })).status).toBe(401);
    expect((await t.query(internal.webhooks.apiListWebhooks, { tokenId, now: expiresAt })).status).toBe(401);
  });

  it.each([NaN, Infinity, -Infinity])("rejects a nonfinite query timestamp %s", async (now) => {
    const { t, tokenId, ref } = await setup();
    expect((await t.query(internal.integrations.getDefinition, { tokenId, ref, now })).status).toBe(401);
    expect((await t.query(internal.webhooks.apiListWebhooks, { tokenId, now })).status).toBe(401);
  });

  it("uses current scopes for reads and writes", async () => {
    const { t, owner, tokenId, token, ref } = await setup();
    const auth = await t.mutation(internal.integrations.authenticate, { tokenHash: await sha256Hex(token), scope: "definitions:read" });
    expect(auth.ok).toBe(true);
    await owner.mutation(api.integrations.updateConnection, { tokenId, scopes: ["items:read"] });
    expect((await t.query(internal.integrations.getItem, { tokenId, now: Date.now(), ref })).status).toBe(200);
    const before = await t.run((ctx) => ctx.db.query("forms").collect());
    const results = [
      await t.query(internal.integrations.getDefinition, { tokenId, now: Date.now(), ref }),
      await t.query(internal.integrations.getSummary, { tokenId, now: Date.now(), ref }),
      await t.mutation(internal.integrations.createDraft, { tokenId, idempotencyKey: "new", requestHash: "new", body: { kind: "form", title: "New", fields: [] } }),
      await t.mutation(internal.integrations.updateDraft, { tokenId, ref, ifMatch: "1", idempotencyKey: "edit", requestHash: "edit", body: {} }),
      await t.query(internal.webhooks.apiListWebhooks, { tokenId, now: Date.now() }),
      await t.mutation(internal.webhooks.apiCreateWebhook, { tokenId, idempotencyKey: "hook", requestHash: "hook", body: { url: "https://hooks.example.com/", events: ["response.completed"] } }),
      await t.mutation(internal.webhooks.apiWebhookAction, { tokenId, id: "missing", action: "test" }),
    ];
    expect(results.map((r) => r.status)).toEqual(Array(7).fill(403));
    expect(await t.run((ctx) => ctx.db.query("forms").collect())).toEqual(before);
    expect(await t.run((ctx) => ctx.db.query("webhookSubscriptions").collect())).toHaveLength(0);
    await owner.mutation(api.integrations.updateConnection, { tokenId, scopes: ["drafts:create"] });
    expect((await t.query(internal.integrations.listItems, { tokenId, now: Date.now() })).status).toBe(403);
    expect((await t.query(internal.integrations.getItem, { tokenId, now: Date.now(), ref })).status).toBe(403);
  });

  it.each(["expiry", "ban", "suspension"])("uses current account and token state: %s", async (change) => {
    const { t, tokenId, token, ref } = await setup();
    expect((await t.mutation(internal.integrations.authenticate, { tokenHash: await sha256Hex(token) })).ok).toBe(true);
    await t.run(async (ctx) => {
      if (change === "expiry") await ctx.db.patch("integrationTokens", tokenId, { expiresAt: Date.now() });
      else {
        const user = (await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", creatorIdentity.subject)).unique())!;
        await ctx.db.patch("users", user._id, change === "ban" ? { isBanned: true } : { suspendedUntil: Date.now() + 60_000 });
      }
    });
    expect((await t.query(internal.integrations.getDefinition, { tokenId, now: Date.now(), ref })).status).toBe(401);
    expect((await t.query(internal.webhooks.apiListWebhooks, { tokenId, now: Date.now() })).status).toBe(401);
    expect((await t.mutation(internal.integrations.createDraft, { tokenId, idempotencyKey: "state", requestHash: "state", body: {} })).status).toBe(401);
  });

  it("treats a token whose owner account no longer exists as revoked", async () => {
    const { t, tokenId, token } = await setup();
    const tokenHash = await sha256Hex(token);
    expect((await t.mutation(internal.integrations.authenticate, { tokenHash })).ok).toBe(true);
    await t.run(async (ctx) => {
      const row = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", creatorIdentity.subject)).first();
      await ctx.db.delete("users", row!._id);
    });
    expect(await t.mutation(internal.integrations.authenticate, { tokenHash })).toMatchObject({ ok: false, code: "TOKEN_REVOKED" });
    expect((await t.mutation(internal.integrations.createDraft, { tokenId, idempotencyKey: "orphan", requestHash: "orphan", body: {} })).status).toBe(401);
  });

  it("requires the presented rotation credential to remain current", async () => {
    const { t, owner, tokenId, token } = await setup();
    const tokenHash = await sha256Hex(token);
    expect((await t.mutation(internal.integrations.authenticate, { tokenHash })).ok).toBe(true);
    const rotated = await owner.mutation(api.integrations.rotateConnection, { tokenId });
    await owner.mutation(api.integrations.endRotationGrace, { tokenId });
    expect((await t.mutation(internal.integrations.apiRotate, { tokenId, tokenHash })).status).toBe(401);
    expect((await t.mutation(internal.integrations.authenticate, { tokenHash: await sha256Hex(rotated.token) })).ok).toBe(true);
  });
});

describe("webhook current answer selection", () => {
  it.each(["pending", "retrying", "manual"] as const)("uses current answer selection for %s deliveries", async (kind) => {
    const { t, owner, formId, ref } = await setup();
    const { subscriptionId } = await owner.mutation(api.webhooks.createWebhook, {
      url: "https://hooks.example.com/", description: "Checks", events: ["response.completed"], target: "all", itemRefs: [], includeAnswers: true,
    });
    const deliveryId = await t.run((ctx) => ctx.db.insert("webhookDeliveries", {
      subscriptionId, ownerId: creatorIdentity.subject, event: "response.completed", eventId: "evt_selection", itemRef: ref,
      payload: '{"answers":{"synthetic":"value"}}', containsAnswers: true, payloadExpiresAt: Date.now() + 60_000,
      status: kind === "manual" ? "succeeded" : kind, attempts: kind === "pending" ? 0 : 1, createdAt: Date.now(), updatedAt: Date.now(),
    }));
    if (kind !== "manual") expect(await t.mutation(internal.webhooks.claimAttempt, { deliveryId })).not.toBeNull();
    await owner.mutation(api.webhooks.updateWebhook, { subscriptionId, includeAnswers: false });
    if (kind === "manual") await owner.mutation(api.webhooks.resendDelivery, { deliveryId });
    const resolveMock = vi.fn(async () => [{ address: "93.184.216.34", family: 4 as const }]);
    const sendMock = vi.fn(async () => ({ statusCode: 200 }));
    transport.resolve = resolveMock;
    transport.send = sendMock;
    await t.action(internal.webhookDelivery.deliver, { deliveryId });
    expect(resolveMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.get("webhookDeliveries", deliveryId))).toMatchObject({ status: "cancelled" });
    expect(await t.run((ctx) => ctx.db.get("forms", formId))).not.toBeNull();
  });
});

describe("MCP collaborator identity", () => {
  it("uses an account-bound invitation only for its account", async () => {
    const { t, formId, ref } = await setup();
    const bound = "user_bound";
    const other = otherCreatorIdentity.subject;
    await t.mutation(internal.mcp.begin, { userId: bound, profile: { name: "Bound", email: "bound@example.com" } });
    await t.mutation(internal.mcp.begin, { userId: other, profile: { name: "Other", email: otherCreatorIdentity.email } });
    await t.run((ctx) => ctx.db.insert("formCollaborators", {
      formId, userId: bound, email: otherCreatorIdentity.email, role: "editor", createdAt: Date.now(), invitedBy: creatorIdentity.subject,
    }));
    for (const fn of [internal.mcp.getForm, internal.mcp.getResults, internal.mcp.listResponses]) {
      await expect(t.query(fn, { userId: other, id: ref })).rejects.toThrow(/NOT_FOUND/);
    }
    expect((await t.query(internal.mcp.searchForms, { userId: other })).items).toHaveLength(0);
    await expect(t.mutation(internal.mcp.updateForm, { userId: other, id: ref, input: { title: "Changed" } })).rejects.toThrow(/NOT_FOUND/);
    expect((await t.query(internal.mcp.getForm, { userId: bound, id: ref })).role).toBe("editor");
    expect((await t.query(internal.mcp.searchForms, { userId: bound })).items.map((i) => i.id)).toContain(ref);
  });
});

describe("HTTP request size", () => {
  it("accepts a streamed JSON body at the exact byte limit", async () => {
    const { t, token } = await setup();
    const text = JSON.stringify({ kind: "form", title: "Streamed", fields: [] }).padEnd(256 * 1024, " ");
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    } });
    const response = await t.fetch("/api/integrations/v1/drafts", {
      method: "POST", body, ...{ duplex: "half" }, headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": "boundary" },
    });
    expect(response.status).toBe(201);
  });

  it("rejects a declared oversized JSON body before reading", async () => {
    const { t, token } = await setup();
    const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => { controller.enqueue(new TextEncoder().encode("{}")); controller.close(); });
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    const response = await t.fetch("/api/integrations/v1/drafts", {
      method: "POST", body, ...{ duplex: "half" },
      headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": "declared", "Content-Length": "262145" },
    });
    expect(response.status).toBe(400);
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([undefined, "1"])("stops reading JSON at the byte limit with Content-Length %s", async (declared) => {
    const { t, token } = await setup();
    let reads = 0;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads++;
        if (reads > 8) { controller.close(); return; }
        controller.enqueue(new Uint8Array(64 * 1024).fill(32));
      }, cancel,
    }, { highWaterMark: 0 });
    const response = await t.fetch("/api/integrations/v1/drafts", {
      method: "POST", body, ...{ duplex: "half" },
      headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": "size", ...(declared && { "Content-Length": declared }) },
    });
    expect(response.status).toBe(400);
    expect(cancel).toHaveBeenCalledOnce();
    expect(reads).toBe(5);
    expect(await t.run((ctx) => ctx.db.query("integrationCreatedItems").collect())).toHaveLength(0);
  });

  it("stops a streamed upload at its byte limit and preserves the ticket", async () => {
    const { t, owner } = await setup();
    const def = emptyDefinition("Upload checks");
    def.fields = [{ id: "file", type: "file", label: "File", required: false, max: 1 }];
    const formId = await owner.mutation(api.forms.createForm, { definition: def });
    const form = (await owner.query(api.forms.getFormForEditor, { formId }))!;
    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: form.draftRevision });
    const url = new URL(await t.mutation(api.respond.generateUploadUrl, { shareId: form.shareId, fieldId: "file" }), "https://example.test");
    let reads = 0;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads++;
        if (reads > 8) { controller.close(); return; }
        controller.enqueue(new Uint8Array(2 * 1024 * 1024));
      }, cancel,
    }, { highWaterMark: 0 });
    const response = await t.fetch(`/forms/upload${url.search}`, {
      method: "POST", body, ...{ duplex: "half" }, headers: { "Content-Type": "text/plain", "Content-Length": "1" },
    });
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(reads).toBe(6);
    expect(await t.run((ctx) => ctx.db.query("formUploads").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(0);
    expect(await t.query(internal.respond.checkUploadTicket, { token: url.searchParams.get("ticket")!, now: Date.now() })).toBe(true);
  });
});
