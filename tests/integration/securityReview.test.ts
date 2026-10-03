/**
 * Regression tests for the pre-1.0 security review (#62), the privacy review (#212) and the
 * integration security review (#213). The written reviews are kept privately by the maintainers.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { emptyDefinition } from "@/convex/formLogic";
import type { FormDefinition } from "@/convex/formLogic";
import { defaultFormSettings } from "@/convex/formModel";
import { signPayload, verifySignature } from "@/convex/webhookCrypto";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

type T = ReturnType<typeof createTestConvex>;

const collaboratorIdentity = {
  subject: "user_collaborator_3",
  issuer: "https://chaos.test.clerk.accounts.dev",
  tokenIdentifier: "https://chaos.test.clerk.accounts.dev|user_collaborator_3",
  email: "helper@example.com",
  emailVerified: true,
  name: "Harper Helper",
  nickname: "helper",
};

function definition(): FormDefinition {
  const def = emptyDefinition("Staff survey");
  def.fields = [
    { id: "team", type: "choice", label: "Team?", required: true, options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] },
    { id: "note", type: "textarea", label: "Anything else?", required: false },
  ];
  return def;
}

async function ownerWithForm(t: T, publish = true) {
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { definition: definition() });
  let shareId = "";
  if (publish) {
    const form = await owner.query(api.forms.getFormForEditor, { formId });
    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: form!.draftRevision });
    shareId = (await owner.query(api.forms.getFormForEditor, { formId }))!.shareId;
  }
  return { owner, formId, shareId };
}

let keyCounter = 0;
const submit = (shareId: string, answers: Record<string, string> = { team: "a" }, extra: Record<string, unknown> = {}) => ({
  shareId, submissionKey: `submission-${String(++keyCounter).padStart(6, "0")}`, answers, language: "en" as const, final: true, startedAt: Date.now() - 60_000, ...extra,
});

beforeEach(() => {
  process.env.CHAOS_WEBHOOK_KEY = "test-webhook-key-0123456789abcdef0123456789";
});
afterEach(() => {
  delete process.env.CHAOS_WEBHOOK_KEY;
});

// ── #62: public surface ─────────────────────────────────────────────────────

describe("security review: no public user lookup", () => {
  it("no longer exposes getUserByUsername, which returned whole user rows (email, account id, moderation)", async () => {
    const t = createTestConvex();
    await t.withIdentity(creatorIdentity).mutation(api.quizFunctions.getOrCreateUser, {});
    // The function is deleted; calling it by name must fail rather than return a row.
    const byName = t.query as unknown as (name: string, args: Record<string, unknown>) => Promise<unknown>;
    await expect(byName("quizFunctions:getUserByUsername", { username: "creator" })).rejects.toThrow();
  });
});

describe("security review: every form operation refuses the wrong person", () => {
  it("refuses an outsider on every read and write, a viewer on editor writes and an editor on owner writes", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await ownerWithForm(t);
    await t.mutation(api.respond.submitResponse, submit(shareId, { team: "a", note: "private note" }));
    const responseId = (await owner.query(api.formResults.listResponses, { formId, filter: {}, paginationOpts: { numItems: 5, cursor: null } })).page[0]._id as Id<"formResponses">;
    const outsider = t.withIdentity(otherCreatorIdentity);
    await outsider.mutation(api.quizFunctions.getOrCreateUser, {});
    const page = { numItems: 10, cursor: null };
    const revision = (await owner.query(api.forms.getFormForEditor, { formId }))!.draftRevision;

    // Reads return nothing.
    expect(await outsider.query(api.forms.getFormForEditor, { formId })).toBeNull();
    expect(await outsider.query(api.forms.getVersion, { formId, version: 1 })).toBeNull();
    expect(await outsider.query(api.forms.listCollaborators, { formId })).toEqual([]);
    expect(await outsider.query(api.forms.listComments, { formId })).toEqual([]);
    expect(await outsider.query(api.forms.listActivity, { formId })).toEqual([]);
    expect(await outsider.query(api.forms.exportDefinition, { formId })).toBeNull();
    expect((await outsider.query(api.formResults.listResponses, { formId, filter: {}, paginationOpts: page })).page).toEqual([]);
    expect(await outsider.query(api.formResults.getResponse, { responseId })).toBeNull();
    expect(await outsider.query(api.formResults.listTags, { formId })).toEqual([]);
    expect(await outsider.query(api.formResults.listSavedViews, { formId })).toEqual([]);
    expect(await outsider.query(api.formResults.getAnalysis, { formId })).toBeNull();
    expect(await outsider.query(api.formResults.exportResponses, { formId, includePartial: true, includeSpam: true, paginationOpts: page })).toBeNull();
    expect(await outsider.query(api.embed.getEmbedSettings, { formId })).toBeNull();
    const anonymous = await t.query(api.formResults.getResponse, { responseId });
    expect(anonymous).toBeNull();

    // Writes throw and change nothing.
    const writes: [string, () => Promise<unknown>][] = [
      ["saveFormDraft", () => outsider.mutation(api.forms.saveFormDraft, { formId, expectedRevision: revision, definition: definition() })],
      ["updateFormSettings", () => outsider.mutation(api.forms.updateFormSettings, { formId, settings: defaultFormSettings })],
      ["publishForm", () => outsider.mutation(api.forms.publishForm, { formId, expectedRevision: revision })],
      ["setFormStatus", () => outsider.mutation(api.forms.setFormStatus, { formId, status: "closed" })],
      ["restoreVersion", () => outsider.mutation(api.forms.restoreVersion, { formId, version: 1, expectedRevision: revision })],
      ["duplicateForm", () => outsider.mutation(api.forms.duplicateForm, { formId })],
      ["deleteForm", () => outsider.mutation(api.forms.deleteForm, { formId })],
      ["inviteCollaborator", () => outsider.mutation(api.forms.inviteCollaborator, { formId, email: "x@example.com", role: "editor" })],
      ["addComment", () => outsider.mutation(api.forms.addComment, { formId, body: "hi" })],
      ["saveAsTemplate", () => outsider.mutation(api.forms.saveAsTemplate, { formId, name: "Copy", category: "x" })],
      ["setReviewed", () => outsider.mutation(api.formResults.setReviewed, { formId, responseIds: [responseId], reviewed: true })],
      ["setTags", () => outsider.mutation(api.formResults.setTags, { formId, responseIds: [responseId], add: "x" })],
      ["setSpam", () => outsider.mutation(api.formResults.setSpam, { formId, responseIds: [responseId], spam: true })],
      ["deleteResponses", () => outsider.mutation(api.formResults.deleteResponses, { formId, responseIds: [responseId] })],
      ["saveView", () => outsider.mutation(api.formResults.saveView, { formId, name: "v", filter: {} })],
      ["setEmbedSettings", () => outsider.mutation(api.embed.setEmbedSettings, { formId, enabled: true, origins: [], anyOrigin: true })],
      ["setFormSlug", () => outsider.mutation(api.links.setFormSlug, { formId, slug: "stolen" })],
    ];
    for (const [name, call] of writes) await expect(call(), name).rejects.toThrow();
    const after = await owner.query(api.forms.getFormForEditor, { formId });
    expect(after?.status).toBe("live");
    expect(after?.draftRevision).toBe(revision);
    expect((await owner.query(api.formResults.getResponse, { responseId }))?.spam).toBe(false);

    // A viewer reads but cannot edit; an editor edits but cannot change owner settings or delete.
    await owner.mutation(api.forms.inviteCollaborator, { formId, email: collaboratorIdentity.email, role: "viewer" });
    const collaborator = t.withIdentity(collaboratorIdentity);
    await collaborator.mutation(api.quizFunctions.getOrCreateUser, {});
    expect(await collaborator.query(api.forms.getFormForEditor, { formId })).not.toBeNull();
    await expect(collaborator.mutation(api.forms.saveFormDraft, { formId, expectedRevision: revision, definition: definition() })).rejects.toThrow();
    await expect(collaborator.mutation(api.formResults.setSpam, { formId, responseIds: [responseId], spam: true })).rejects.toThrow();
    await expect(collaborator.mutation(api.embed.setEmbedSettings, { formId, enabled: true, origins: [], anyOrigin: true })).rejects.toThrow();
    await owner.mutation(api.forms.inviteCollaborator, { formId, email: collaboratorIdentity.email, role: "editor" });
    await collaborator.mutation(api.forms.saveFormDraft, { formId, expectedRevision: revision, definition: definition() });
    for (const call of [
      () => collaborator.mutation(api.forms.updateFormSettings, { formId, settings: defaultFormSettings }),
      () => collaborator.mutation(api.forms.setFormStatus, { formId, status: "archived" }),
      () => collaborator.mutation(api.forms.inviteCollaborator, { formId, email: "friend@example.com", role: "editor" }),
      () => collaborator.mutation(api.formResults.deleteResponses, { formId, responseIds: [responseId] }),
      () => collaborator.mutation(api.links.setFormSlug, { formId, slug: "mine" }),
    ]) await expect(call()).rejects.toThrow();
  });

  it("keeps webhooks, connections and notifications to their owner", async () => {
    const t = createTestConvex();
    const { owner } = await ownerWithForm(t, false);
    const { subscriptionId } = await owner.mutation(api.webhooks.createWebhook, {
      url: "https://hooks.example.com/x", description: "", events: ["form.published"], target: "all", itemRefs: [], includeAnswers: true,
    });
    const { tokenId } = await owner.mutation(api.integrations.createConnection, { label: "Max", scopes: ["items:read"], access: "all", itemRefs: [] });
    const outsider = t.withIdentity(otherCreatorIdentity);
    await outsider.mutation(api.quizFunctions.getOrCreateUser, {});
    expect(await outsider.query(api.webhooks.listWebhooks, {})).toEqual([]);
    expect(await outsider.query(api.webhooks.listDeliveries, { subscriptionId })).toEqual([]);
    expect(await outsider.query(api.integrations.listConnections, {})).toEqual([]);
    for (const call of [
      () => outsider.mutation(api.webhooks.updateWebhook, { subscriptionId, url: "https://attacker.example.com/x" }),
      () => outsider.mutation(api.webhooks.rotateWebhookSecret, { subscriptionId }),
      () => outsider.mutation(api.webhooks.sendTestWebhook, { subscriptionId }),
      () => outsider.mutation(api.webhooks.deleteWebhook, { subscriptionId }),
      () => outsider.mutation(api.webhooks.setWebhookPaused, { subscriptionId, paused: true }),
      () => outsider.mutation(api.integrations.updateConnection, { tokenId, scopes: ["items:read", "webhooks:manage"] }),
      () => outsider.mutation(api.integrations.revokeConnection, { tokenId }),
    ]) await expect(call()).rejects.toThrow();
    expect((await owner.query(api.webhooks.listWebhooks, {}))[0]).toMatchObject({ url: "https://hooks.example.com/x", status: "active" });
    expect((await owner.query(api.integrations.listConnections, {}))[0]).toMatchObject({ scopes: ["items:read"], revokedAt: null });
  });
});

describe("security review: access codes", () => {
  it("serves nothing but the title without the code and refuses submissions with a wrong code", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await ownerWithForm(t);
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, access: "code" }, accessCode: "open-sesame" });
    const locked = await t.query(api.respond.getPublicForm, { shareId });
    expect(locked.state).toBe("code");
    expect(JSON.stringify(locked)).not.toContain("Team?");
    expect((await t.query(api.respond.getPublicForm, { shareId, accessCode: "wrong" })).state).toBe("code");
    await expect(t.mutation(api.respond.submitResponse, submit(shareId, { team: "a" }, { accessCode: "wrong" }))).rejects.toThrow(/ACCESS_CODE_REQUIRED/);
    await expect(t.mutation(api.respond.generateUploadUrl, { shareId, fieldId: "team", accessCode: "wrong" })).rejects.toThrow(/ACCESS_CODE_REQUIRED/);
    // The raw code is never accepted directly (a query can't count guesses); unlockForm swaps it for a pass.
    expect((await t.query(api.respond.getPublicForm, { shareId, accessCode: "open-sesame" })).state).toBe("code");
    expect(await t.mutation(api.respond.unlockForm, { shareId, code: "wrong" })).toEqual({ ok: false });
    const unlocked = await t.mutation(api.respond.unlockForm, { shareId, code: " open-sesame " });
    if (!unlocked.ok) throw new Error("expected a pass");
    expect((await t.query(api.respond.getPublicForm, { shareId, accessCode: unlocked.grant })).state).toBe("open");
    await t.mutation(api.respond.submitResponse, submit(shareId, { team: "a" }, { accessCode: unlocked.grant }));
    // The code is never returned to the editor, only whether one is set.
    const editor = await owner.query(api.forms.getFormForEditor, { formId });
    expect(JSON.stringify(editor)).not.toContain("open-sesame");
    expect(editor?.settings.hasAccessCode).toBe(true);
    expect(editor?.settings.accessCodeHash).toBeUndefined();
  });

  it("locks code guessing after 20 tries in 10 minutes, and a pass works only for its own form", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await ownerWithForm(t);
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, access: "code" }, accessCode: "open-sesame" });
    for (let i = 0; i < 20; i++) expect(await t.mutation(api.respond.unlockForm, { shareId, code: `guess-${i}` })).toEqual({ ok: false });
    await expect(t.mutation(api.respond.unlockForm, { shareId, code: "open-sesame" })).rejects.toThrow(/RATE_LIMITED/);
    const other = await ownerWithForm(t);
    await other.owner.mutation(api.forms.updateFormSettings, { formId: other.formId, settings: { ...defaultFormSettings, access: "code" }, accessCode: "another-code" });
    const pass = await t.mutation(api.respond.unlockForm, { shareId: other.shareId, code: "another-code" });
    if (!pass.ok) throw new Error("expected a pass");
    expect((await t.query(api.respond.getPublicForm, { shareId, accessCode: pass.grant })).state).toBe("code");
    await expect(owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, access: "code" }, accessCode: "1234" })).rejects.toThrow(/6–100/);
  });

  it("stops a burst of public submissions at the per-form rate limit", async () => {
    const t = createTestConvex();
    const { formId, shareId } = await ownerWithForm(t);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("rateWindows", { key: `submit:${formId}`, windowStart: now - (now % 60_000), count: 120 });
    });
    await expect(t.mutation(api.respond.submitResponse, submit(shareId))).rejects.toThrow(/RATE_LIMITED/);
    expect(await t.run((ctx) => ctx.db.query("formResponses").collect())).toHaveLength(0);
  });
});

// ── #212: privacy ───────────────────────────────────────────────────────────

describe("privacy review: respondents stay anonymous unless the form requires sign-in", () => {
  it("does not link a signed-in person's account to an answer on a public form", async () => {
    const t = createTestConvex();
    const { owner, shareId } = await ownerWithForm(t);
    const respondent = t.withIdentity(otherCreatorIdentity);
    await respondent.mutation(api.quizFunctions.getOrCreateUser, {});
    await respondent.mutation(api.respond.submitResponse, submit(shareId));
    const stored = await t.run((ctx) => ctx.db.query("formResponses").collect());
    expect(stored[0].respondentId).toBeUndefined();
    const detail = await owner.query(api.formResults.getResponse, { responseId: stored[0]._id });
    expect(detail?.respondent).toBeNull();
    expect(JSON.stringify(detail)).not.toContain(otherCreatorIdentity.nickname);
    expect(JSON.stringify(detail)).not.toContain(otherCreatorIdentity.subject);
  });

  it("links the account (as a display name) only when the form requires sign-in", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await ownerWithForm(t);
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, access: "signed_in", onePerPerson: true } });
    const respondent = t.withIdentity(otherCreatorIdentity);
    await respondent.mutation(api.quizFunctions.getOrCreateUser, {});
    await respondent.mutation(api.respond.submitResponse, submit(shareId));
    const stored = await t.run((ctx) => ctx.db.query("formResponses").collect());
    expect(stored[0].respondentId).toBe(otherCreatorIdentity.subject);
    const detail = await owner.query(api.formResults.getResponse, { responseId: stored[0]._id });
    // Display name as synced at sign-in (the nickname here), never the email address.
    expect(detail?.respondent).toBe(otherCreatorIdentity.nickname);
    expect(JSON.stringify(detail)).not.toContain(otherCreatorIdentity.email);
    // One response per person still works with the account link.
    await expect(respondent.mutation(api.respond.submitResponse, submit(shareId))).rejects.toThrow(/ALREADY_RESPONDED/);
  });
});

describe("privacy review: public payloads", () => {
  it("never sends provenance, unpublished draft text, settings secrets or answer keys to respondents", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const { token } = await owner.mutation(api.integrations.createConnection, { label: "Max HR space", scopes: ["drafts:create"], access: "selected", itemRefs: [] });
    const created = await t.fetch("/api/integrations/v1/drafts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": "p1" },
      body: JSON.stringify({ kind: "form", title: "Pulse", fields: [{ id: "q1", type: "choice", label: "Mood?", options: ["Good", "Bad"] }], source: { label: "Salary review notes" } }),
    });
    const formId = (await created.json()).item.id.replace("form_", "") as Id<"forms">;
    const form = await owner.query(api.forms.getFormForEditor, { formId });
    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: form!.draftRevision });
    // An unpublished edit after publication, and owner-only settings.
    const editor = (await owner.query(api.forms.getFormForEditor, { formId }))!;
    const draft = { ...editor.draft, fields: [...editor.draft.fields, { id: "secret", type: "text" as const, label: "UNPUBLISHED QUESTION", required: false }] };
    await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: editor.draftRevision, definition: draft });
    await owner.mutation(api.forms.updateFormSettings, {
      formId, settings: { ...defaultFormSettings, notifyRules: [{ id: "r", message: "ALERT HR", rule: { match: "all", conditions: [] } }], closedMessage: "Closed." },
    });
    const payload = JSON.stringify(await t.query(api.respond.getPublicForm, { shareId: editor.shareId }));
    for (const secret of ["Salary review notes", "Max HR space", "UNPUBLISHED QUESTION", "ALERT HR", "connectionId", "ownerId", creatorIdentity.subject]) {
      expect(payload, secret).not.toContain(secret);
    }
    expect(payload).toContain("Mood?");
  });
});

describe("privacy review: withheld quiz results", () => {
  async function withheldQuiz(t: T) {
    return await t.run(async (ctx) => {
      const quizId = await ctx.db.insert("quizzes", {
        title: "Exam", slug: "exam", creatorId: creatorIdentity.subject, creatorUsername: "creator", isPublished: true,
        resultRelease: "manual", createdAt: 0, updatedAt: 0,
      });
      const sessions: Id<"quizSessions">[] = [];
      for (const [name, score] of [["Ana", 9], ["Ben", 4], ["Cy", 7]] as const) {
        sessions.push(await ctx.db.insert("quizSessions", {
          quizId, playerName: name, status: "completed", score, totalPoints: 10, answers: [], startedAt: 1, completedAt: 2,
        }));
      }
      return { quizId, sessions };
    });
  }

  it("hides the leaderboard and percentile from respondents until the creator releases results", async () => {
    const t = createTestConvex();
    const { quizId, sessions } = await withheldQuiz(t);
    expect(await t.query(api.quizFunctions.getQuizLeaderboard, { quizId })).toEqual([]);
    expect(await t.withIdentity(otherCreatorIdentity).query(api.quizFunctions.getQuizLeaderboard, { quizId })).toEqual([]);
    expect(await t.query(api.quizFunctions.getPlayerPercentile, { sessionId: sessions[0] })).toBeNull();
    // The creator still sees the ranking while results are held.
    const owner = t.withIdentity(creatorIdentity);
    expect((await owner.query(api.quizFunctions.getQuizLeaderboard, { quizId })).map((r) => r.playerName)).toEqual(["Ana", "Cy", "Ben"]);

    await owner.mutation(api.quizFunctions.setResultsReleased, { quizId, released: true });
    expect(await t.query(api.quizFunctions.getQuizLeaderboard, { quizId })).toHaveLength(3);
    expect(await t.query(api.quizFunctions.getPlayerPercentile, { sessionId: sessions[0] })).toBe(100);
  });
});

// ── #213: integration API ───────────────────────────────────────────────────

describe("integration review: credentials", () => {
  const scopes = ["items:read", "drafts:create", "drafts:update", "summaries:read", "definitions:read", "webhooks:manage"] as const;
  type Scope = (typeof scopes)[number];

  function client(t: T, token: string) {
    return async (method: string, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) => {
      const response = await t.fetch(`/api/integrations/v1${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const text = await response.text();
      return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
    };
  }

  const draft = { kind: "form", title: "Imported", fields: [{ id: "q1", type: "choice", label: "Pick", options: ["A", "B"] }] };

  /** Every endpoint with the scope it needs (null: any valid token). */
  function endpoints(ref: string, hookId: string): { scope: Scope | null; method: string; path: string; body?: unknown; headers?: Record<string, string> }[] {
    return [
      { scope: null, method: "GET", path: "/capabilities" },
      { scope: "items:read", method: "GET", path: "/items" },
      { scope: "items:read", method: "GET", path: `/items/${ref}` },
      { scope: "summaries:read", method: "GET", path: `/items/${ref}/summary` },
      { scope: "definitions:read", method: "GET", path: `/items/${ref}/definition` },
      { scope: "drafts:update", method: "PATCH", path: `/items/${ref}`, body: draft, headers: { "Idempotency-Key": `p-${ref}`, "If-Match": "1" } },
      { scope: "drafts:create", method: "POST", path: "/drafts", body: draft, headers: { "Idempotency-Key": "d-1" } },
      { scope: "webhooks:manage", method: "GET", path: "/webhooks" },
      { scope: "webhooks:manage", method: "POST", path: "/webhooks", body: { url: "https://hooks.example.com/x", events: ["form.published"] }, headers: { "Idempotency-Key": "w-1" } },
      { scope: "webhooks:manage", method: "POST", path: `/webhooks/${hookId}/rotate` },
      { scope: "webhooks:manage", method: "POST", path: `/webhooks/${hookId}/test` },
      { scope: "webhooks:manage", method: "DELETE", path: `/webhooks/${hookId}` },
    ];
  }

  it("refuses every endpoint whose permission the connection lacks", async () => {
    const t = createTestConvex();
    const { owner, formId } = await ownerWithForm(t);
    const ref = `form_${formId}`;
    for (const missing of scopes) {
      const { token } = await owner.mutation(api.integrations.createConnection, {
        label: `without ${missing}`, scopes: scopes.filter((s) => s !== missing), access: "all", itemRefs: [],
      });
      const call = client(t, token);
      for (const e of endpoints(ref, "missing").filter((x) => x.scope === missing)) {
        const result = await call(e.method, e.path, e);
        expect(result.status, `${e.method} ${e.path} without ${missing}`).toBe(403);
        expect(result.body.error.code).toBe("INSUFFICIENT_SCOPE");
      }
      await owner.mutation(api.integrations.revokeConnection, { tokenId: (await owner.query(api.integrations.listConnections, {}))[0]._id });
    }
    // Nothing was created by the refused calls.
    expect(await t.run((ctx) => ctx.db.query("webhookSubscriptions").collect())).toHaveLength(0);
    expect((await owner.query(api.forms.listMyForms, {})).owned).toHaveLength(1);
  });

  it("fails every operation at once after revocation, expiry or an account ban", async () => {
    const t = createTestConvex();
    const { owner, formId } = await ownerWithForm(t);
    const ref = `form_${formId}`;
    const make = async (label: string) => owner.mutation(api.integrations.createConnection, { label, scopes: [...scopes], access: "all", itemRefs: [] });

    const revoked = await make("revoked");
    const hook = await client(t, revoked.token)("POST", "/webhooks", { body: { url: "https://hooks.example.com/r", events: ["form.published"] }, headers: { "Idempotency-Key": "r-1" } });
    expect(hook.status).toBe(201);
    await owner.mutation(api.integrations.revokeConnection, { tokenId: revoked.tokenId });
    for (const e of endpoints(ref, hook.body.webhook.id)) {
      const result = await client(t, revoked.token)(e.method, e.path, e);
      expect(result.status, `${e.method} ${e.path} after revoke`).toBe(401);
      expect(result.body.error.code).toBe("TOKEN_REVOKED");
    }

    const expired = await make("expired");
    await t.run(async (ctx) => { await ctx.db.patch("integrationTokens", expired.tokenId, { expiresAt: Date.now() - 1 }); });
    for (const e of endpoints(ref, "x")) expect((await client(t, expired.token)(e.method, e.path, e)).status).toBe(401);

    const banned = await make("banned");
    await t.run(async (ctx) => {
      const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", creatorIdentity.subject)).first();
      await ctx.db.patch("users", user!._id, { isBanned: true });
    });
    for (const e of endpoints(ref, "x")) expect((await client(t, banned.token)(e.method, e.path, e)).status).toBe(401);
    // No write got through.
    expect(await t.run((ctx) => ctx.db.query("integrationCreatedItems").collect())).toHaveLength(0);
  });

  it("never reaches beyond the granting person's own items, even forms they can edit as a collaborator", async () => {
    const t = createTestConvex();
    const { owner, formId } = await ownerWithForm(t);
    await owner.mutation(api.forms.inviteCollaborator, { formId, email: collaboratorIdentity.email, role: "editor" });
    const collaborator = t.withIdentity(collaboratorIdentity);
    await collaborator.mutation(api.quizFunctions.getOrCreateUser, {});
    await expect(collaborator.mutation(api.integrations.createConnection, {
      label: "Mine", scopes: ["items:read"], access: "selected", itemRefs: [`form_${formId}`],
    })).rejects.toThrow(/INVALID_ITEM/);
    const { token } = await collaborator.mutation(api.integrations.createConnection, { label: "All", scopes: [...scopes], access: "all", itemRefs: [] });
    const call = client(t, token);
    expect((await call("GET", "/items")).body.items).toEqual([]);
    for (const e of endpoints(`form_${formId}`, "x").filter((x) => x.path.startsWith("/items/"))) {
      expect((await call(e.method, e.path, e)).status, `${e.method} ${e.path}`).toBe(404);
    }
    // A selected-items connection cannot be widened to someone else's item either.
    const own = await collaborator.mutation(api.integrations.createConnection, { label: "Sel", scopes: ["items:read"], access: "selected", itemRefs: [] });
    await expect(collaborator.mutation(api.integrations.updateConnection, { tokenId: own.tokenId, itemRefs: [`form_${formId}`] })).rejects.toThrow(/INVALID_ITEM/);
  });

  it("creates one draft for concurrent retries and rejects a reused key with a different body", async () => {
    const t = createTestConvex();
    const { owner } = await ownerWithForm(t, false);
    const { token } = await owner.mutation(api.integrations.createConnection, { label: "Max", scopes: ["drafts:create", "items:read"], access: "selected", itemRefs: [] });
    const call = client(t, token);
    const post = (body: unknown) => call("POST", "/drafts", { body, headers: { "Idempotency-Key": "same-key" } });
    const [a, b] = await Promise.all([post(draft), post(draft)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.item.id).toBe(b.body.item.id);
    const conflicting = await Promise.all([post({ ...draft, title: "Other" }), post({ ...draft, title: "Third" })]);
    expect(conflicting.map((r) => r.status)).toEqual([422, 422]);
    expect((await owner.query(api.forms.listMyForms, {})).owned.filter((f) => f.title === "Imported")).toHaveLength(1);
    expect((await owner.query(api.forms.listMyForms, {})).owned.some((f) => f.title === "Other" || f.title === "Third")).toBe(false);
  });

  it("holds the per-connection rate limit and tells the caller when to retry", async () => {
    const t = createTestConvex();
    const { owner } = await ownerWithForm(t, false);
    const first = await owner.mutation(api.integrations.createConnection, { label: "A", scopes: ["drafts:create"], access: "selected", itemRefs: [] });
    const second = await owner.mutation(api.integrations.createConnection, { label: "B", scopes: ["drafts:create"], access: "selected", itemRefs: [] });
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("rateWindows", { key: `api:write:${first.tokenId}`, windowStart: now - (now % 60_000), count: 10_000 });
    });
    const limited = await client(t, first.token)("POST", "/drafts", { body: draft, headers: { "Idempotency-Key": "k" } });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await t.run((ctx) => ctx.db.query("integrationCreatedItems").collect())).toHaveLength(0);
    // Each connection has its own budget.
    expect((await client(t, second.token)("POST", "/drafts", { body: draft, headers: { "Idempotency-Key": "k" } })).status).toBe(201);
  });

  it("refuses source labels that carry addresses, private paths or tokens", async () => {
    const t = createTestConvex();
    const { owner } = await ownerWithForm(t, false);
    const { token } = await owner.mutation(api.integrations.createConnection, { label: "Max", scopes: ["drafts:create"], access: "selected", itemRefs: [] });
    const call = client(t, token);
    let n = 0;
    for (const label of ["https://max.example.com/p/secret-page", "/private/workspace/notes", "C:\\Users\\me\\hr.docx", "max.example.com/pages/42", "Page ?token=abc123"]) {
      const result = await call("POST", "/drafts", { body: { ...draft, source: { label } }, headers: { "Idempotency-Key": `src-${n++}` } });
      expect(result.status, label).toBe(400);
      expect(result.body.error.code).toBe("VALIDATION_FAILED");
    }
    // Unknown source keys are refused outright, so no private body can slip in.
    const refused = await call("POST", "/drafts", { body: { ...draft, source: { label: "Onboarding page", content: "SECRET BODY" } }, headers: { "Idempotency-Key": "src-extra" } });
    expect(refused.status).toBe(400);
    const ok = await call("POST", "/drafts", { body: { ...draft, source: { label: "Onboarding page", type: "page", url: "https://max.example.com/p/1?session=abc" } }, headers: { "Idempotency-Key": "src-ok" } });
    expect(ok.status).toBe(201);
    const forms = await t.run((ctx) => ctx.db.query("forms").collect());
    expect(JSON.stringify(forms)).not.toContain("SECRET BODY");
    expect(JSON.stringify(forms)).not.toContain("session=abc");
  });

  it("answers a malformed address with 404, not a server error", async () => {
    const t = createTestConvex();
    const { owner } = await ownerWithForm(t, false);
    const { token } = await owner.mutation(api.integrations.createConnection, { label: "Max", scopes: ["items:read"], access: "all", itemRefs: [] });
    const response = await t.fetch("/api/integrations/v1/items/%E0%A4%A", { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(404);
  });
});

describe("integration review: webhooks", () => {
  it("stops a connection's deliveries when it loses webhooks:manage or its owner is restricted", async () => {
    const t = createTestConvex();
    const { owner, formId } = await ownerWithForm(t, false);
    const { token, tokenId } = await owner.mutation(api.integrations.createConnection, { label: "Max", scopes: ["webhooks:manage"], access: "all", itemRefs: [] });
    const created = await t.fetch("/api/integrations/v1/webhooks", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": "h" },
      body: JSON.stringify({ url: "https://hooks.example.com/max", events: ["form.published", "form.closed", "form.reopened"] }),
    });
    expect(created.status).toBe(201);
    const deliveries = async () => (await t.run((ctx) => ctx.db.query("webhookDeliveries").collect())).filter((d) => d.event !== "webhook.test").length;

    const form = await owner.query(api.forms.getFormForEditor, { formId });
    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: form!.draftRevision });
    expect(await deliveries()).toBe(1);

    await owner.mutation(api.integrations.updateConnection, { tokenId, scopes: ["items:read"] });
    await owner.mutation(api.forms.setFormStatus, { formId, status: "closed" });
    expect(await deliveries()).toBe(1);

    await owner.mutation(api.integrations.updateConnection, { tokenId, scopes: ["webhooks:manage"] });
    await owner.mutation(api.forms.setFormStatus, { formId, status: "live" });
    expect(await deliveries()).toBe(2);

    await t.run(async (ctx) => {
      const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", creatorIdentity.subject)).first();
      await ctx.db.patch("users", user!._id, { suspendedUntil: Date.now() + 86_400_000 });
    });
    // Emission is reached through an internal path here because a suspended owner cannot close forms from the dashboard.
    await t.run(async (ctx) => {
      const { emitWebhookEvent, formItem } = await import("@/convex/webhookEvents");
      const doc = (await ctx.db.get("forms", formId))!;
      await emitWebhookEvent(ctx, doc.ownerId, "form.closed", `form_${formId}`, () => ({ base: { item: formItem(doc, "closed") } }));
    });
    expect(await deliveries()).toBe(2);
  });

  it("rejects replayed, stale and tampered deliveries with the documented verifier", async () => {
    const secret = "whsec_" + "a".repeat(64);
    const body = JSON.stringify({ id: "evt_1", type: "form.published" });
    const now = 1_800_000_000;
    const header = `t=${now},v1=${await signPayload(secret, now, body)}`;
    expect(await verifySignature(secret, header, body, { nowSeconds: now + 10 })).toBe(true);
    // The same signed request replayed after the 5-minute tolerance is refused.
    expect(await verifySignature(secret, header, body, { nowSeconds: now + 301 })).toBe(false);
    // A timestamp moved forward to look fresh breaks the signature.
    expect(await verifySignature(secret, header.replace(`t=${now}`, `t=${now + 400}`), body, { nowSeconds: now + 400 })).toBe(false);
    expect(await verifySignature(secret, header, body.replace("published", "closed"), { nowSeconds: now })).toBe(false);
    expect(await verifySignature("whsec_" + "b".repeat(64), header, body, { nowSeconds: now })).toBe(false);
  });
});
