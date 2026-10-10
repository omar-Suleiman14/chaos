import { describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";

type T = ReturnType<typeof createTestConvex>;
const HOUR = 3_600_000;

/** Start each test at the beginning of a rate-limit minute so windows do not roll over mid-test. */
function startOfMinute() {
  vi.setSystemTime(new Date("2026-09-29T10:00:00.000Z"));
}

async function connect(t: T, scopes: string[] = ["items:read", "drafts:create", "drafts:update"]) {
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const created = await owner.mutation(api.integrations.createConnection, {
    label: "Max", scopes: scopes as never, access: "selected", itemRefs: [],
  });
  return { owner, token: created.token, tokenId: created.tokenId as Id<"integrationTokens"> };
}

function caller(t: T, token: () => string) {
  return async (method: string, path: string, init: { body?: unknown; rawBody?: string; headers?: Record<string, string> } = {}) => {
    const response = await t.fetch(`/api/integrations/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...init.headers },
      body: init.rawBody ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
}

const draft = { kind: "form", title: "Onboarding survey", fields: [{ id: "q1", type: "choice", label: "Team?", options: ["Sales", "Support"] }] };

describe("integration API: token rotation", () => {
  it("issues a new token, keeps the old one for 24 hours, then refuses it", async () => {
    startOfMinute();
    const t = createTestConvex();
    const { owner, token: oldToken, tokenId } = await connect(t);
    const rotated = await owner.mutation(api.integrations.rotateConnection, { tokenId });
    expect(rotated.token).toMatch(/^chaos_[a-f0-9]{64}$/);
    expect(rotated.token).not.toBe(oldToken);
    expect(rotated.previousTokenExpiresAt).toBe(Date.now() + 24 * HOUR);

    const asOld = caller(t, () => oldToken);
    const asNew = caller(t, () => rotated.token);
    expect((await asNew("GET", "/capabilities")).status).toBe(200);
    const during = await asOld("GET", "/capabilities");
    expect(during.status).toBe(200);
    expect(during.headers.get("Chaos-Token-Expires")).toBe(new Date(rotated.previousTokenExpiresAt).toISOString());

    // Only hashes are stored: neither secret is recoverable from the table.
    const stored = JSON.stringify(await t.run((ctx) => ctx.db.query("integrationTokens").collect()));
    expect(stored).not.toContain(oldToken);
    expect(stored).not.toContain(rotated.token);

    const listed = await owner.query(api.integrations.listConnections, {});
    expect(listed[0].previousTokenExpiresAt).toBe(rotated.previousTokenExpiresAt);
    expect(listed[0].activity.map((a) => a.action)).toContain("token.rotated");
    expect(JSON.stringify(listed)).not.toContain(rotated.token);

    vi.setSystemTime(Date.now() + 24 * HOUR + 1000);
    expect((await asOld("GET", "/capabilities")).body.error.code).toBe("UNAUTHORIZED");
    expect((await asNew("GET", "/capabilities")).status).toBe(200);
  });

  it("does not let a token the owner replaced mint a successor", async () => {
    startOfMinute();
    const t = createTestConvex();
    const { owner, token: leaked, tokenId } = await connect(t);
    const replaced = await owner.mutation(api.integrations.rotateConnection, { tokenId });
    const asLeaked = caller(t, () => leaked);
    // The replaced token still reads during its grace period...
    expect((await asLeaked("GET", "/capabilities")).status).toBe(200);
    // ...but cannot rotate itself into a fresh credential or displace the owner's token.
    const attempt = await asLeaked("POST", "/connection/rotate");
    expect(attempt.status).toBe(403);
    expect(attempt.body.error.code).toBe("TOKEN_REPLACED");
    expect((await caller(t, () => replaced.token)("GET", "/capabilities")).status).toBe(200);
    vi.setSystemTime(replaced.previousTokenExpiresAt + 1000);
    expect((await asLeaked("GET", "/capabilities")).status).toBe(401);
    expect((await caller(t, () => replaced.token)("GET", "/capabilities")).status).toBe(200);
  });

  it("keeps the owner's containment after the connection rotated itself first", async () => {
    startOfMinute();
    const t = createTestConvex();
    const { owner, token: original, tokenId } = await connect(t);
    const self = await caller(t, () => original)("POST", "/connection/rotate");
    expect(self.status).toBe(200);
    const replaced = await owner.mutation(api.integrations.rotateConnection, { tokenId });
    // The client's own token is now the replaced one; the original is gone entirely.
    expect((await caller(t, () => self.body.token)("POST", "/connection/rotate")).body.error.code).toBe("TOKEN_REPLACED");
    expect((await caller(t, () => original)("POST", "/connection/rotate")).status).toBe(401);
    expect((await caller(t, () => replaced.token)("GET", "/capabilities")).status).toBe(200);
    // A later self-rotation with the owner's token restores ordinary retry safety.
    const next = await caller(t, () => replaced.token)("POST", "/connection/rotate");
    expect(next.status).toBe(200);
    expect((await caller(t, () => replaced.token)("POST", "/connection/rotate")).status).toBe(200);
  });

  it("rotates through the API; a retry with the old token never locks the client out", async () => {
    startOfMinute();
    const t = createTestConvex();
    const { token: original } = await connect(t);
    const asOriginal = caller(t, () => original);
    const first = await asOriginal("POST", "/connection/rotate");
    expect(first.status).toBe(200);
    // The client lost the response and retries with the token it still has.
    const retry = await asOriginal("POST", "/connection/rotate");
    expect(retry.status).toBe(200);
    expect(retry.body.previousTokenExpiresAt).toBe(first.body.previousTokenExpiresAt);
    expect((await asOriginal("GET", "/capabilities")).status).toBe(200);
    expect((await caller(t, () => retry.body.token)("GET", "/capabilities")).status).toBe(200);
    // The token issued by the lost response was replaced.
    expect((await caller(t, () => first.body.token)("GET", "/capabilities")).status).toBe(401);
  });

  it("lets the owner stop the old token early, and revocation stops both at once", async () => {
    startOfMinute();
    const t = createTestConvex();
    const { owner, token: oldToken, tokenId } = await connect(t);
    const rotated = await owner.mutation(api.integrations.rotateConnection, { tokenId });
    await owner.mutation(api.integrations.endRotationGrace, { tokenId });
    expect((await caller(t, () => oldToken)("GET", "/capabilities")).status).toBe(401);
    expect((await caller(t, () => rotated.token)("GET", "/capabilities")).status).toBe(200);

    const again = await owner.mutation(api.integrations.rotateConnection, { tokenId });
    await owner.mutation(api.integrations.revokeConnection, { tokenId });
    expect((await caller(t, () => rotated.token)("GET", "/capabilities")).body.error.code).toBe("TOKEN_REVOKED");
    expect((await caller(t, () => again.token)("GET", "/capabilities")).body.error.code).toBe("TOKEN_REVOKED");
    await expect(owner.mutation(api.integrations.rotateConnection, { tokenId })).rejects.toThrow(/REVOKED/);
  });
});

describe("integration API: rate limits", () => {
  it("signals the limit on every response and returns 429 with Retry-After", async () => {
    startOfMinute();
    const t = createTestConvex();
    const { token } = await connect(t);
    const call = caller(t, () => token);

    const first = await call("GET", "/capabilities");
    expect(first.headers.get("RateLimit-Limit")).toBe("300");
    expect(first.headers.get("RateLimit-Remaining")).toBe("299");
    expect(first.headers.get("RateLimit-Reset")).toBe("60");
    expect(first.headers.get("RateLimit-Policy")).toBe("300;w=60");

    // Operators lower the limit without a deploy.
    await t.run(async (ctx) => { await ctx.db.insert("globalConfig", { integrationReadRatePerMinute: 3, integrationWriteRatePerMinute: 1 }); });
    vi.setSystemTime(Date.now() + 60_000);
    const remaining = [];
    for (let i = 0; i < 3; i++) remaining.push((await call("GET", "/items")).headers.get("RateLimit-Remaining"));
    expect(remaining).toEqual(["2", "1", "0"]);
    vi.setSystemTime(Date.now() + 15_000);
    const limited = await call("GET", "/items");
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(limited.headers.get("Retry-After")).toBe("45");
    expect(limited.headers.get("RateLimit-Remaining")).toBe("0");
    expect(limited.headers.get("RateLimit-Limit")).toBe("3");

    // Writes have their own budget.
    const write = await call("POST", "/drafts", { body: draft, headers: { "Idempotency-Key": "w-1" } });
    expect(write.status).toBe(201);
    expect(write.headers.get("RateLimit-Limit")).toBe("1");
    expect((await call("POST", "/drafts", { body: draft, headers: { "Idempotency-Key": "w-2" } })).status).toBe(429);

    // A new window starts fresh.
    vi.setSystemTime(Date.now() + 60_000);
    expect((await call("GET", "/items")).status).toBe(200);
  });
});

describe("integration API: idempotency", () => {
  it("replays the original response, refuses a changed body and frees the key after 24 hours", async () => {
    startOfMinute();
    const t = createTestConvex();
    const { token } = await connect(t);
    const call = caller(t, () => token);
    const key = { "Idempotency-Key": "create-onboarding-1" };

    const created = await call("POST", "/drafts", { body: draft, headers: key });
    expect(created.status).toBe(201);
    expect((await t.run(ctx => ctx.db.query("integrationIdempotency").first()))?.requestHash).toBe("76f4f64472d773cc4e0abcfe42122ac2dc41182e3a7c34e175e9230d39cd3d0c");
    expect(created.headers.get("Idempotent-Replayed")).toBeNull();

    // Same JSON with keys in another order and different whitespace is the same request.
    const reordered = `{ "fields": ${JSON.stringify(draft.fields)}, "title": "Onboarding survey", "kind": "form" }`;
    const replay = await call("POST", "/drafts", { rawBody: reordered, headers: key });
    expect(replay.status).toBe(200);
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    expect(replay.body).toEqual(created.body);

    const conflict = await call("POST", "/drafts", { body: { ...draft, title: "Other" }, headers: key });
    expect(conflict.status).toBe(422);
    expect(conflict.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    // Keys are scoped per connection across endpoints: reusing it for an update is also a conflict.
    const patch = await call("PATCH", `/items/${created.body.item.id}`, { body: draft, headers: { ...key, "If-Match": created.body.item.revision } });
    expect(patch.status).toBe(422);

    const count = async () => (await t.run((ctx) => ctx.db.query("integrationCreatedItems").collect())).length;
    expect(await count()).toBe(1);

    // After the 24-hour retention window the key is forgotten and the request runs again.
    vi.setSystemTime(Date.now() + 24 * HOUR + 1000);
    const afterExpiry = await call("POST", "/drafts", { body: draft, headers: key });
    expect(afterExpiry.status).toBe(201);
    expect(afterExpiry.body.item.id).not.toBe(created.body.item.id);
    expect(await count()).toBe(2);
  });

  it("does not store failures, and concurrent requests with one key create one draft", async () => {
    startOfMinute();
    const t = createTestConvex();
    const { token } = await connect(t);
    const call = caller(t, () => token);
    const bad = await call("POST", "/drafts", { body: { ...draft, fields: [{ id: "1bad", type: "choice", label: "x" }] }, headers: { "Idempotency-Key": "k-fail" } });
    expect(bad.status).toBe(400);
    // A failed request can be corrected and retried with the same key.
    expect((await call("POST", "/drafts", { body: draft, headers: { "Idempotency-Key": "k-fail" } })).status).toBe(201);

    const results = await Promise.all([1, 2, 3].map(() => call("POST", "/drafts", { body: { ...draft, title: "Parallel" }, headers: { "Idempotency-Key": "k-parallel" } })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(results.map((r) => r.body.item.id)).size).toBe(1);
    const forms = await t.run((ctx) => ctx.db.query("forms").collect());
    expect(forms.filter((f) => f.title === "Parallel")).toHaveLength(1);
  });
});

describe("integration API: source metadata", () => {
  it("stores a validated structured source, shows it to the creator and never to respondents", async () => {
    startOfMinute();
    const t = createTestConvex();
    const { owner, token } = await connect(t, ["items:read", "drafts:create"]);
    const call = caller(t, () => token);
    const source = {
      type: "page", id: "pg_8f2c1a", url: "https://notes.example.com/p/onboarding?session=secret#top",
      title: "Onboarding notes", fetchedAt: "2026-09-29T09:30:00.000Z",
    };
    const created = await call("POST", "/drafts", { body: { ...draft, source }, headers: { "Idempotency-Key": "src-1" } });
    expect(created.status).toBe(201);
    expect(created.body.warnings).toContain("The query string and fragment were removed from source.url.");
    const expected = { type: "page", id: "pg_8f2c1a", url: "https://notes.example.com/p/onboarding", title: "Onboarding notes", fetchedAt: Date.parse(source.fetchedAt) };
    // Returned to the connection that sent it, for reconciliation.
    expect(created.body.item.source).toEqual(expected);
    expect((await call("GET", `/items/${created.body.item.id}`)).body.source).toEqual(expected);

    const formId = created.body.item.id.replace(/^form_/, "") as Id<"forms">;
    const editor = await owner.query(api.forms.getFormForEditor, { formId });
    expect(editor!.source).toMatchObject({ kind: "integration", label: "Max: Onboarding notes", external: expected });

    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: editor!.draftRevision });
    const shareId = (await owner.query(api.forms.getFormForEditor, { formId }))!.shareId;
    const publicForm = JSON.stringify(await t.query(api.respond.getPublicForm, { shareId }));
    for (const leaked of ["pg_8f2c1a", "notes.example.com", "Onboarding notes", "Max:"]) expect(publicForm).not.toContain(leaked);
  });

  it("keeps the free-text label working and rejects private paths, private hosts and unknown fields", async () => {
    startOfMinute();
    const t = createTestConvex();
    const { owner, token } = await connect(t, ["items:read", "drafts:create"]);
    const call = caller(t, () => token);
    let n = 0;
    const post = (source: unknown) => call("POST", "/drafts", { body: { ...draft, source }, headers: { "Idempotency-Key": `src-${n++}` } });

    const legacy = await post({ label: "Onboarding page" });
    expect(legacy.status).toBe(201);
    expect(legacy.body.item.source).toBeNull();
    const formId = legacy.body.item.id.replace(/^form_/, "") as Id<"forms">;
    expect((await owner.query(api.forms.getFormForEditor, { formId }))!.source).toMatchObject({ label: "Max: Onboarding page" });

    const rejected: [unknown, RegExp][] = [
      [{ label: "/Users/amira/Documents/plan.md" }, /local file path/],
      [{ type: "document", id: "C:\\Users\\amira\\plan.docx" }, /local file path/],
      [{ type: "document", title: "~/notes/secret.md" }, /local file path/],
      [{ type: "document", url: "file:///home/amira/plan.md" }, /http or https/],
      [{ type: "document", url: "http://localhost:3000/p/1" }, /private network/],
      [{ type: "document", url: "https://192.168.1.10/p/1" }, /private network/],
      [{ type: "document", url: "https://user:pass@example.com/p" }, /user name or password/],
      [{ type: "document", workspacePath: "/srv/x" }, /not accepted/],
      [{ id: "abc" }, /source.type is required/],
      [{ type: "Bad Type" }, /source.type must match/],
      [{ type: "page", fetchedAt: "yesterday" }, /fetchedAt/],
      [{ type: "page", fetchedAt: Date.now() + 24 * HOUR }, /fetchedAt/],
      [{ type: "page", title: "x".repeat(201) }, /at most 200/],
      [{ type: "page", id: "x".repeat(150), title: "y".repeat(150), url: `https://example.com/${"z".repeat(1990)}` }, /at most 2000|at most 4096/],
      ["just a string", /must be an object/],
    ];
    for (const [source, message] of rejected) {
      const response = await post(source);
      expect(response.status, JSON.stringify(source)).toBe(400);
      expect(JSON.stringify(response.body.error.details), JSON.stringify(source)).toMatch(message);
    }
    const drafts = await t.run((ctx) => ctx.db.query("forms").collect());
    expect(drafts).toHaveLength(1);
  });
});
