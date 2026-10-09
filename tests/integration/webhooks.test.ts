import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FunctionArgs } from "convex/server";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { emptyDefinition } from "@/convex/formLogic";
import type { FormDefinition } from "@/convex/formLogic";
import { transport } from "@/convex/webhookDelivery";
import type { ResolvedAddress, SendRequest, SendResult } from "@/convex/webhookDelivery";
import { verifySignature } from "@/convex/webhookCrypto";
import { AUTO_DISABLE_AFTER, MAX_ATTEMPTS, ROTATION_GRACE_MS } from "@/convex/webhookModel";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

type T = ReturnType<typeof createTestConvex>;

const HOOK_URL = "https://hooks.example.com/chaos";
const realResolve = transport.resolve;
const realSend = transport.send;

/** Records every request the delivery action makes; answers with `reply`. */
function mockNetwork(reply: (req: SendRequest) => SendResult = () => ({ statusCode: 200 }), dns: Record<string, string[]> = {}) {
  const sent: SendRequest[] = [];
  transport.resolve = async (hostname: string): Promise<ResolvedAddress[]> => {
    const answers = dns[hostname] ?? ["93.184.216.34"];
    return answers.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  transport.send = async (req: SendRequest) => {
    sent.push(req);
    return reply(req);
  };
  return sent;
}

/** Runs the scheduled functions that are due now (one delivery step). */
async function step(t: T) {
  vi.runOnlyPendingTimers();
  await t.finishInProgressScheduledFunctions();
}

function definition(): FormDefinition {
  const def = emptyDefinition("Event feedback");
  def.fields = [
    { id: "attend", type: "choice", label: "Did you attend?", required: true, options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] },
    { id: "email", type: "email", label: "Email", required: false },
  ];
  return def;
}

async function setup(t: T) {
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { definition: definition() });
  return { owner, formId };
}

async function publish(owner: ReturnType<T["withIdentity"]>, formId: Id<"forms">) {
  const form = await owner.query(api.forms.getFormForEditor, { formId });
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: form!.draftRevision });
  return (await owner.query(api.forms.getFormForEditor, { formId }))!.shareId;
}

async function submit(t: T, shareId: string, key = "submission-0001") {
  return await t.mutation(api.respond.submitResponse, {
    shareId, submissionKey: key, answers: { attend: "yes", email: "person@example.org" }, language: "en", final: true, startedAt: Date.now() - 60_000,
  });
}

async function hook(owner: ReturnType<T["withIdentity"]>, overrides: Partial<FunctionArgs<typeof api.webhooks.createWebhook>> = {}) {
  return await owner.mutation(api.webhooks.createWebhook, {
    url: HOOK_URL, description: "Test", events: ["response.completed", "response.graded", "form.published", "form.closed", "form.reopened"],
    target: "all", itemRefs: [], includeAnswers: false, ...overrides,
  });
}

async function deliveries(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("webhookDeliveries").collect());
}

beforeEach(() => {
  process.env.CHAOS_WEBHOOK_KEY = "test-webhook-key-0123456789abcdef0123456789";
});
afterEach(() => {
  transport.resolve = realResolve;
  transport.send = realSend;
  delete process.env.CHAOS_WEBHOOK_KEY;
  delete process.env.CHAOS_WEBHOOK_ALLOW_LOCALHOST;
});

describe("webhooks: subscriptions and secrets", () => {
  it("shows the secret once and stores it only encrypted", async () => {
    const t = createTestConvex();
    const { owner } = await setup(t);
    const { subscriptionId, secret } = await hook(owner);
    expect(secret).toMatch(/^whsec_[a-f0-9]{64}$/);
    const row = await t.run(async (ctx) => await ctx.db.get("webhookSubscriptions", subscriptionId));
    expect(JSON.stringify(row)).not.toContain(secret.slice(6));
    const listed = await owner.query(api.webhooks.listWebhooks, {});
    expect(JSON.stringify(listed)).not.toContain(secret.slice(6));
    expect(listed[0].secretHint).toBe(`${secret.slice(0, 10)}…`);
  });

  it("refuses to create webhooks when the deployment has no encryption key", async () => {
    delete process.env.CHAOS_WEBHOOK_KEY;
    const t = createTestConvex();
    const { owner } = await setup(t);
    await expect(hook(owner)).rejects.toThrow(/WEBHOOKS_NOT_CONFIGURED/);
  });

  it("keeps other creators out", async () => {
    const t = createTestConvex();
    const { owner } = await setup(t);
    const { subscriptionId } = await hook(owner);
    const other = t.withIdentity(otherCreatorIdentity);
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    await expect(other.mutation(api.webhooks.deleteWebhook, { subscriptionId })).rejects.toThrow(/NOT_FOUND/);
    await expect(other.mutation(api.webhooks.rotateWebhookSecret, { subscriptionId })).rejects.toThrow(/NOT_FOUND/);
    expect(await other.query(api.webhooks.listDeliveries, { subscriptionId })).toEqual([]);
  });

  it("rejects selected items that belong to someone else", async () => {
    const t = createTestConvex();
    const { formId } = await setup(t);
    const other = t.withIdentity(otherCreatorIdentity);
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    await expect(hook(other, { target: "selected", itemRefs: [`form_${formId}`] })).rejects.toThrow(/INVALID_ITEM/);
  });

  it("does not accept classic quiz refs, even for the creator's own unconverted quiz", async () => {
    const t = createTestConvex();
    const { owner } = await setup(t);
    const quizId = await t.run(async (ctx) => await ctx.db.insert("quizzes", {
      title: "Quiz", slug: "quiz", creatorId: creatorIdentity.subject, creatorUsername: "creator", isPublished: true, createdAt: 1, updatedAt: 1,
    }));
    await expect(hook(owner, { target: "selected", itemRefs: [`quiz_${quizId}`] })).rejects.toThrow(/INVALID_ITEM/);
  });
});

describe("webhooks: SSRF protection", () => {
  const badUrls = [
    "http://hooks.example.com/chaos",
    "ftp://hooks.example.com/chaos",
    "not a url",
    "https://127.0.0.1/hook",
    "https://2130706433/hook",
    "https://0x7f.0.0.1/hook",
    "https://127.1/hook",
    "https://10.0.0.8/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://100.64.0.1/hook",
    "https://[::1]/hook",
    "https://[::ffff:169.254.169.254]/hook",
    "https://[fd00:ec2::254]/hook",
    "https://localhost/hook",
    "https://api.localhost/hook",
    "https://printer.local/hook",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://service/hook",
    "https://user:pass@hooks.example.com/hook",
    "https://hooks.example.com:22/hook",
    "http://localhost:3000/hook",
  ];
  it.each(badUrls)("rejects %s", async (url) => {
    const t = createTestConvex();
    const { owner } = await setup(t);
    await expect(hook(owner, { url })).rejects.toThrow(/INVALID_URL/);
  });

  it("allows http://localhost only behind the development flag", async () => {
    process.env.CHAOS_WEBHOOK_ALLOW_LOCALHOST = "1";
    const t = createTestConvex();
    const { owner } = await setup(t);
    await expect(hook(owner, { url: "http://localhost:3000/hook" })).resolves.toBeTruthy();
    await expect(hook(owner, { url: "http://10.0.0.1/hook" })).rejects.toThrow(/INVALID_URL/);
  });

  const privateAnswers: [string, string[]][] = [
    ["private IPv4", ["10.1.2.3"]],
    ["loopback", ["127.0.0.1"]],
    ["cloud metadata", ["169.254.169.254"]],
    ["carrier-grade NAT", ["100.100.1.1"]],
    ["multicast", ["239.1.1.1"]],
    ["IPv6 loopback", ["::1"]],
    ["IPv6 unique local", ["fd12:3456::1"]],
    ["IPv6 link-local", ["fe80::1"]],
    ["IPv4-mapped IPv6", ["::ffff:192.168.1.1"]],
    ["NAT64 metadata", ["64:ff9b::a9fe:a9fe"]],
    ["one private among public", ["93.184.216.34", "10.0.0.1"]],
  ];
  it.each(privateAnswers)("does not connect when DNS answers with %s", async (_label, answers) => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    await hook(owner);
    const sent = mockNetwork(undefined, { "hooks.example.com": answers });
    await publish(owner, formId);
    await step(t);
    expect(sent).toHaveLength(0);
    const [d] = await deliveries(t);
    expect(d.status).toBe("failed");
    expect(d.lastOutcome).toBe("blocked_address");
  });

  it("connects to the checked public address and never follows redirects", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    await hook(owner);
    const sent = mockNetwork(() => ({ statusCode: 302 }), { "hooks.example.com": ["2606:2800:220:1:248:1893:25c8:1946"] });
    await publish(owner, formId);
    await step(t);
    expect(sent).toHaveLength(1);
    expect(sent[0].address).toEqual({ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 });
    const [d] = await deliveries(t);
    expect(d.lastOutcome).toBe("redirect");
    expect(d.status).toBe("retrying");
  });
});

describe("webhooks: events", () => {
  it("emits form.published, form.closed and form.reopened for forms", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    await hook(owner);
    const sent = mockNetwork();
    await publish(owner, formId);
    await owner.mutation(api.forms.setFormStatus, { formId, status: "closed" });
    await owner.mutation(api.forms.setFormStatus, { formId, status: "live" });
    await step(t);
    const events = sent.map((r) => r.headers["Chaos-Event"]).sort();
    expect(events).toEqual(["form.closed", "form.published", "form.reopened"]);
    const closed = JSON.parse(sent.find((r) => r.headers["Chaos-Event"] === "form.closed")!.body);
    expect(closed).toMatchObject({ type: "form.closed", version: "1", data: { item: { id: `form_${formId}`, kind: "form", status: "closed" }, previousStatus: "live" } });
  });

  it("emits response.completed for a form without answers unless the subscription opts in", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    await hook(owner, { events: ["response.completed"] });
    await hook(owner, { events: ["response.completed"], includeAnswers: true, url: "https://hooks.example.com/with-answers" });
    const sent = mockNetwork();
    const shareId = await publish(owner, formId);
    await submit(t, shareId);
    await step(t);
    expect(sent).toHaveLength(2);
    const plain = sent.find((r) => r.url.pathname === "/chaos")!;
    const rich = sent.find((r) => r.url.pathname === "/with-answers")!;
    const body = JSON.parse(plain.body);
    expect(body.type).toBe("response.completed");
    expect(body.data.response).toMatchObject({ status: "completed", answeredCount: 2, formVersion: 1, language: "en" });
    expect(body.data.answers).toBeUndefined();
    expect(plain.body).not.toContain("person@example.org");
    expect(JSON.parse(rich.body).data.answers).toEqual(expect.arrayContaining([expect.objectContaining({ fieldId: "email", value: "person@example.org" })]));
    // Both copies describe the same event.
    expect(JSON.parse(rich.body).id).toBe(body.id);
    const rows = await deliveries(t);
    expect(rows.find((d) => d.containsAnswers)?.payloadExpiresAt).toBe(rows.find((d) => d.containsAnswers)!.createdAt + 24 * 3_600_000);
  });

  it("filters by event and by selected item, and skips paused webhooks", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    const otherForm = await owner.mutation(api.forms.createForm, { definition: definition() });
    await hook(owner, { events: ["form.closed"] });
    await hook(owner, { target: "selected", itemRefs: [`form_${otherForm}`], url: "https://hooks.example.com/other" });
    const paused = await hook(owner, { url: "https://hooks.example.com/paused" });
    await owner.mutation(api.webhooks.setWebhookPaused, { subscriptionId: paused.subscriptionId, paused: true });
    await publish(owner, formId);
    expect(await deliveries(t)).toHaveLength(0);
    await publish(owner, otherForm);
    const rows = await deliveries(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].itemRef).toBe(`form_${otherForm}`);
  });
});

describe("webhooks: signing and rotation", () => {
  it("signs t.body with HMAC-SHA256 and sends event and delivery headers", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    const { secret } = await hook(owner);
    const sent = mockNetwork();
    await publish(owner, formId);
    await step(t);
    const [req] = sent;
    const [d] = await deliveries(t);
    expect(req.headers["Chaos-Delivery"]).toBe(d._id);
    expect(req.headers["Chaos-Event"]).toBe("form.published");
    expect(req.headers["Chaos-Signature"]).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(await verifySignature(secret, req.headers["Chaos-Signature"], req.body)).toBe(true);
    expect(await verifySignature(secret, req.headers["Chaos-Signature"], req.body.replace("form", "f0rm"))).toBe(false);
    expect(await verifySignature("whsec_wrong", req.headers["Chaos-Signature"], req.body)).toBe(false);
    // Replay protection: the same signature is refused once the timestamp is old.
    const ts = Number(/t=(\d+)/.exec(req.headers["Chaos-Signature"])![1]);
    expect(await verifySignature(secret, req.headers["Chaos-Signature"], req.body, { nowSeconds: ts + 301 })).toBe(false);
  });

  it("signs with both secrets during the rotation grace period, then only the new one", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    const { subscriptionId, secret: oldSecret } = await hook(owner);
    const rotated = await owner.mutation(api.webhooks.rotateWebhookSecret, { subscriptionId });
    expect(rotated.secret).not.toBe(oldSecret);
    expect(rotated.previousSecretExpiresAt).toBe(Date.now() + ROTATION_GRACE_MS);
    const sent = mockNetwork();
    await owner.mutation(api.webhooks.sendTestWebhook, { subscriptionId });
    await step(t);
    const during = sent[0].headers["Chaos-Signature"];
    expect(during.match(/v1=/g)).toHaveLength(2);
    expect(await verifySignature(oldSecret, during, sent[0].body)).toBe(true);
    expect(await verifySignature(rotated.secret, during, sent[0].body)).toBe(true);
    expect(JSON.parse(sent[0].body).type).toBe("webhook.test");

    vi.advanceTimersByTime(ROTATION_GRACE_MS + 1000);
    await publish(owner, formId);
    await step(t);
    const after = sent[1].headers["Chaos-Signature"];
    expect(after.match(/v1=/g)).toHaveLength(1);
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(await verifySignature(rotated.secret, after, sent[1].body, { nowSeconds })).toBe(true);
    expect(await verifySignature(oldSecret, after, sent[1].body, { nowSeconds })).toBe(false);
  });
});

describe("webhooks: delivery, retries and history", () => {
  it("retries with exponential backoff up to the cap", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    await hook(owner);
    const sent = mockNetwork(() => ({ statusCode: 503 }));
    await publish(owner, formId);
    await step(t);
    let [d] = await deliveries(t);
    expect(d).toMatchObject({ status: "retrying", attempts: 1, lastStatusCode: 503, lastOutcome: "http_error" });
    let delay = d.nextAttemptAt! - Date.now();
    expect(delay).toBeGreaterThanOrEqual(27_000);
    expect(delay).toBeLessThanOrEqual(33_000);
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.some((s) => s.state.kind === "pending" && s.name.includes("webhookDelivery"))).toBe(true);

    await step(t);
    [d] = await deliveries(t);
    delay = d.nextAttemptAt! - Date.now();
    expect(d.attempts).toBe(2);
    expect(delay).toBeGreaterThanOrEqual(108_000);
    expect(delay).toBeLessThanOrEqual(132_000);

    for (let i = 2; i < MAX_ATTEMPTS; i++) await step(t);
    [d] = await deliveries(t);
    expect(d.status).toBe("failed");
    expect(d.attempts).toBe(MAX_ATTEMPTS);
    expect(d.nextAttemptAt).toBeUndefined();
    expect(sent).toHaveLength(MAX_ATTEMPTS);
    await step(t);
    expect(sent).toHaveLength(MAX_ATTEMPTS);
  });

  it("does not let a failing endpoint block or fail the product action", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    await hook(owner);
    transport.resolve = async () => { throw Object.assign(new Error("boom"), { code: "ENOTFOUND" }); };
    transport.send = async () => { throw new Error("must not be called"); };
    const shareId = await publish(owner, formId);
    // The submission commits without waiting for any delivery.
    const result = await submit(t, shareId);
    expect(result.status).toBe("completed");
    expect((await owner.query(api.forms.getFormForEditor, { formId }))!.responseCount).toBe(1);
    await step(t);
    const rows = await deliveries(t);
    expect(rows.every((d) => d.status === "retrying" && d.lastOutcome === "dns_error")).toBe(true);
    // A crashing transport is recorded as an ordinary failure, too.
    transport.resolve = async () => [{ address: "93.184.216.34", family: 4 }];
    await step(t);
    expect((await deliveries(t)).every((d) => d.lastOutcome === "internal_error" && d.status === "retrying")).toBe(true);
  });

  it("records classified attempts, never endpoint bodies, and resends on request", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    const { subscriptionId } = await hook(owner);
    let status = 410;
    mockNetwork(() => ({ statusCode: status }));
    await publish(owner, formId);
    await step(t);
    let history = await owner.query(api.webhooks.listDeliveries, { subscriptionId });
    expect(history[0]).toMatchObject({ event: "form.published", status: "failed", attempts: 1, lastStatusCode: 410, payloadAvailable: true });
    expect(history[0].attemptLog[0]).toMatchObject({ attempt: 1, statusCode: 410, outcome: "http_error" });
    expect(history[0]).not.toHaveProperty("payload");
    const listed = await owner.query(api.webhooks.listWebhooks, {});
    expect(listed[0]).toMatchObject({ consecutiveFailures: 1, lastOutcome: "http_error" });

    status = 204;
    await owner.mutation(api.webhooks.resendDelivery, { deliveryId: history[0]._id });
    await step(t);
    history = await owner.query(api.webhooks.listDeliveries, { subscriptionId });
    expect(history[0]).toMatchObject({ status: "succeeded", attempts: 2 });
    expect(history[0].attemptLog.map((a) => a.outcome)).toEqual(["success", "http_error"]);
    expect((await owner.query(api.webhooks.listWebhooks, {}))[0]).toMatchObject({ consecutiveFailures: 0, health: "healthy" });
  });

  it("switches a webhook off after many failures in a row and tells the creator", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    const { subscriptionId } = await hook(owner);
    await t.run(async (ctx) => await ctx.db.patch("webhookSubscriptions", subscriptionId, { consecutiveFailures: AUTO_DISABLE_AFTER - 1 }));
    mockNetwork(() => ({ statusCode: 500 }));
    await publish(owner, formId);
    await step(t);
    const [sub] = await owner.query(api.webhooks.listWebhooks, {});
    expect(sub).toMatchObject({ status: "disabled", disabledReason: "failures", health: "disabled" });
    const notes = await owner.query(api.notifications.listNotifications, {});
    expect(notes.items.some((n) => n.kind === "webhook" && n.message.includes("hooks.example.com"))).toBe(true);
    // The pending retry is cancelled rather than sent.
    await step(t);
    expect((await deliveries(t))[0].status).toBe("cancelled");
    await owner.mutation(api.webhooks.setWebhookPaused, { subscriptionId, paused: false });
    expect((await owner.query(api.webhooks.listWebhooks, {}))[0]).toMatchObject({ status: "active", consecutiveFailures: 0 });
  });

  it("erases payloads with answers after 24 hours and history after 30 days", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    await hook(owner, { events: ["response.completed"], includeAnswers: true });
    mockNetwork();
    const shareId = await publish(owner, formId);
    await submit(t, shareId);
    await step(t);
    vi.advanceTimersByTime(25 * 3_600_000);
    await t.mutation(internal.webhooks.pruneHistory, {});
    let [d] = await deliveries(t);
    expect(d.payload).toBeUndefined();
    vi.advanceTimersByTime(30 * 86_400_000);
    await t.mutation(internal.webhooks.pruneHistory, {});
    expect(await deliveries(t)).toHaveLength(0);
    expect(await t.run(async (ctx) => await ctx.db.query("webhookAttempts").collect())).toHaveLength(0);
    [d] = await deliveries(t);
    expect(d).toBeUndefined();
  });

  it("deletes a webhook with its history", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    const { subscriptionId } = await hook(owner);
    mockNetwork();
    await publish(owner, formId);
    await step(t);
    await owner.mutation(api.webhooks.deleteWebhook, { subscriptionId });
    await step(t);
    expect(await deliveries(t)).toHaveLength(0);
    expect(await owner.query(api.webhooks.listWebhooks, {})).toEqual([]);
  });
});

describe("webhooks: integration API (Max or any connected app)", () => {
  async function connection(t: T, scopes: ("items:read" | "webhooks:manage")[], itemRefs: string[] = []) {
    const owner = t.withIdentity(creatorIdentity);
    const { token, tokenId } = await owner.mutation(api.integrations.createConnection, { label: "Max", scopes, access: "selected", itemRefs });
    return { token, tokenId };
  }
  const call = (t: T, token: string, method: string, path: string, body?: unknown, key?: string) =>
    t.fetch(`/api/integrations/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it("lets a connection register, list, test, rotate and delete its own webhooks", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    const { token } = await connection(t, ["webhooks:manage"], [`form_${formId}`]);
    const created = await call(t, token, "POST", "/webhooks", { url: HOOK_URL, events: ["form.published", "response.completed"] }, "key-1");
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.secret).toMatch(/^whsec_/);
    const replay = await call(t, token, "POST", "/webhooks", { url: HOOK_URL, events: ["form.published", "response.completed"] }, "key-1");
    expect(replay.status).toBe(200);
    expect((await replay.json()).secret).toBeNull();

    const list = await (await call(t, token, "GET", "/webhooks")).json();
    expect(list.webhooks).toHaveLength(1);
    expect(list.webhooks[0]).toMatchObject({ id: body.webhook.id, status: "active", events: ["response.completed", "form.published"] });

    const sent = mockNetwork();
    expect((await call(t, token, "POST", `/webhooks/${body.webhook.id}/test`)).status).toBe(202);
    await step(t);
    expect(await verifySignature(body.secret, sent[0].headers["Chaos-Signature"], sent[0].body)).toBe(true);

    const rotated = await (await call(t, token, "POST", `/webhooks/${body.webhook.id}/rotate`)).json();
    expect(rotated.secret).toMatch(/^whsec_/);

    // Events reach only items the connection can see, and never carry answers.
    const hidden = await owner.mutation(api.forms.createForm, { definition: definition() });
    await publish(owner, hidden);
    const shareId = await publish(owner, formId);
    await submit(t, shareId);
    await step(t);
    const events = sent.slice(1);
    expect(events.map((r) => JSON.parse(r.body).data.item.id)).toEqual([`form_${formId}`, `form_${formId}`]);
    expect(events.every((r) => !r.body.includes("person@example.org"))).toBe(true);

    expect((await call(t, token, "DELETE", `/webhooks/${body.webhook.id}`)).status).toBe(200);
    expect((await (await call(t, token, "GET", "/webhooks")).json()).webhooks).toEqual([]);
  });

  it("requires the webhooks:manage scope and valid destinations", async () => {
    const t = createTestConvex();
    await setup(t);
    const { token } = await connection(t, ["items:read"]);
    expect((await call(t, token, "GET", "/webhooks")).status).toBe(403);
    const { token: managed } = await connection(t, ["webhooks:manage"]);
    const bad = await call(t, managed, "POST", "/webhooks", { url: "https://169.254.169.254/", events: ["form.published"] }, "k");
    expect(bad.status).toBe(400);
    expect((await call(t, managed, "POST", "/webhooks", { url: HOOK_URL, events: ["everything"] }, "k2")).status).toBe(400);
    expect((await call(t, managed, "POST", "/webhooks", { url: HOOK_URL, events: ["form.published"] })).status).toBe(400);
  });

  it("stops a connection's webhooks when the connection is revoked", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    const { token, tokenId } = await connection(t, ["webhooks:manage"], [`form_${formId}`]);
    await call(t, token, "POST", "/webhooks", { url: HOOK_URL, events: ["form.published"] }, "key-r");
    await owner.mutation(api.integrations.revokeConnection, { tokenId });
    await publish(owner, formId);
    expect(await deliveries(t)).toHaveLength(0);
    expect((await owner.query(api.webhooks.listWebhooks, {}))[0]).toMatchObject({ status: "disabled", disabledReason: "connection_revoked" });
  });

  it("works with no webhooks at all, and Chaos has no Max package dependency", async () => {
    const t = createTestConvex();
    const { owner, formId } = await setup(t);
    const shareId = await publish(owner, formId);
    await submit(t, shareId);
    expect(await deliveries(t)).toHaveLength(0);
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /(^|[/@-])max($|[/-])/i.test(d))).toEqual([]);
  });
});
