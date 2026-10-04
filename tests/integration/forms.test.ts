import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { emptyDefinition } from "@/convex/formLogic";
import type { FormDefinition } from "@/convex/formLogic";

function sampleDefinition(): FormDefinition {
  const def = emptyDefinition("Event feedback");
  def.languages = ["en", "ar"];
  def.translations = { ar: { title: "تقييم الفعالية" } };
  def.fields = [
    { id: "attend", type: "choice", label: "Did you attend?", required: true, options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] },
    { id: "rating", type: "rating", label: "Rate it", required: true, max: 5, showIf: { match: "all", conditions: [{ fieldId: "attend", op: "equals", value: "yes" }] } },
    { id: "why", type: "textarea", label: "Why not?", required: false, showIf: { match: "all", conditions: [{ fieldId: "attend", op: "equals", value: "no" }] } },
    { id: "email", type: "email", label: "Email", required: false },
  ];
  return def;
}

async function publishedForm(t: ReturnType<typeof createTestConvex>) {
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { definition: sampleDefinition() });
  const form = await owner.query(api.forms.getFormForEditor, { formId });
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: form!.draftRevision });
  const shareId = (await owner.query(api.forms.getFormForEditor, { formId }))!.shareId;
  return { owner, formId, shareId };
}

const submission = (key: string, answers: Record<string, string | number>) => ({
  shareId: "",
  submissionKey: key,
  answers,
  language: "en" as const,
  final: true,
  startedAt: Date.now() - 60_000,
});

describe("forms: drafts and publication", () => {
  it("creates drafts, rejects stale saves and blocks invalid publication", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const formId = await owner.mutation(api.forms.createForm, {});
    const form = await owner.query(api.forms.getFormForEditor, { formId });
    expect(form?.status).toBe("draft");

    await expect(owner.mutation(api.forms.publishForm, { formId, expectedRevision: form!.draftRevision })).rejects.toThrow(/PUBLICATION_BLOCKED/);

    const saved = await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: form!.draftRevision, definition: sampleDefinition() });
    await expect(owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: form!.draftRevision, definition: sampleDefinition() })).rejects.toThrow(/DRAFT_CONFLICT/);
    const result = await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
    expect(result).toEqual({ outcome: "published", version: 1 });
  });

  it("keeps other creators out", async () => {
    const t = createTestConvex();
    const { formId } = await publishedForm(t);
    const other = t.withIdentity(otherCreatorIdentity);
    expect(await other.query(api.forms.getFormForEditor, { formId })).toBeNull();
    await expect(other.mutation(api.forms.saveFormDraft, { formId, expectedRevision: 1, definition: sampleDefinition() })).rejects.toThrow(/FORM_NOT_FOUND/);
    expect((await other.query(api.formResults.listResponses, { formId, filter: {}, paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([]);
  });

  it("lets invited editors edit but not change settings", async () => {
    const t = createTestConvex();
    const { owner, formId } = await publishedForm(t);
    await owner.mutation(api.forms.inviteCollaborator, { formId, email: otherCreatorIdentity.email, role: "editor" });
    const editor = t.withIdentity({ ...otherCreatorIdentity, emailVerified: true });
    const form = await editor.query(api.forms.getFormForEditor, { formId });
    expect(form?.role).toBe("editor");
    await editor.mutation(api.forms.saveFormDraft, { formId, expectedRevision: form!.draftRevision, definition: { ...sampleDefinition(), title: "Edited" } });
    await expect(editor.mutation(api.forms.deleteForm, { formId })).rejects.toThrow(/FORM_NOT_FOUND/);
  });
});

describe("forms: responses", () => {
  it("keeps quiz answer keys private and scores a submitted version once", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const formId = await owner.mutation(api.forms.createForm, { quizMode: true });
    const initial = await owner.query(api.forms.getFormForEditor, { formId });
    const definition = {
      ...initial!.draft,
      fields: [{ id: "answer", type: "choice" as const, label: "Choose", required: true,
        options: [{ id: "right", label: "Right" }, { id: "wrong", label: "Wrong" }],
        quiz: { correctOptionIds: ["right"], points: 4 } }],
    };
    const saved = await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: initial!.draftRevision, definition });
    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
    const shareId = (await owner.query(api.forms.getFormForEditor, { formId }))!.shareId;
    const publicForm = await t.query(api.respond.getPublicForm, { shareId });
    expect(publicForm.state).toBe("open");
    if (publicForm.state !== "open") throw new Error("Quiz did not publish");
    expect(publicForm.definition.fields[0].quiz).toBeUndefined();
    const first = await t.mutation(api.respond.submitResponse, { ...submission("key-quiz-001", { answer: "right" }), shareId });
    const retry = await t.mutation(api.respond.submitResponse, { ...submission("key-quiz-001", { answer: "wrong" }), shareId });
    expect(first).toMatchObject({ quizScore: 4, quizMaxScore: 4, duplicate: false });
    expect(retry).toMatchObject({ quizScore: 4, quizMaxScore: 4, duplicate: true });
    expect((await owner.query(api.formResults.getResponse, { responseId: first.responseId }))?.quizScore).toBe(4);
  });

  it("records a submission once, even when retried", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publishedForm(t);
    const first = await t.mutation(api.respond.submitResponse, { ...submission("key-00000001", { attend: "yes", rating: 4 }), shareId });
    const retry = await t.mutation(api.respond.submitResponse, { ...submission("key-00000001", { attend: "yes", rating: 4 }), shareId });
    expect(retry.duplicate).toBe(true);
    expect(retry.responseId).toBe(first.responseId);
    const form = await owner.query(api.forms.getFormForEditor, { formId });
    expect(form?.responseCount).toBe(1);
  });

  it("drops answers to questions hidden by branching and enforces required questions", async () => {
    const t = createTestConvex();
    const { owner, shareId } = await publishedForm(t);
    await expect(t.mutation(api.respond.submitResponse, { ...submission("key-00000002", { attend: "yes" }), shareId })).rejects.toThrow(/VALIDATION_FAILED/);
    const { responseId } = await t.mutation(api.respond.submitResponse, { ...submission("key-00000003", { attend: "no", rating: 5, why: "Busy" }), shareId });
    const detail = await owner.query(api.formResults.getResponse, { responseId });
    const rating = detail?.items.find((i) => i.fieldId === "rating");
    expect(rating?.state).toBe("not_applicable");
    expect(detail?.items.find((i) => i.fieldId === "why")?.text).toBe("Busy");
  });

  it("stops at the response limit without discarding silently", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publishedForm(t);
    const current = await owner.query(api.forms.getFormForEditor, { formId });
    const { hasAccessCode: _h, accessCodeHash: _a, ...settings } = current!.settings;
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...settings, responseLimit: 1 } });
    await t.mutation(api.respond.submitResponse, { ...submission("key-00000004", { attend: "no" }), shareId });
    await expect(t.mutation(api.respond.submitResponse, { ...submission("key-00000005", { attend: "no" }), shareId })).rejects.toThrow(/FORM_FULL/);
    expect((await t.query(api.respond.getPublicForm, { shareId })).state).toBe("full");
    const notes = await owner.query(api.notifications.listNotifications, {});
    expect(notes.items.some((n) => n.kind === "limit")).toBe(true);
  });

  it("suppresses small groups in integration summaries", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publishedForm(t);
    const { token } = await owner.mutation(api.integrations.createConnection, {
      label: "Max", scopes: ["items:read", "summaries:read"], access: "selected", itemRefs: [`form_${formId}`],
    });
    const summary = async () => {
      const response = await t.fetch(`/api/integrations/v1/items/form_${formId}/summary`, { headers: { Authorization: `Bearer ${token}` } });
      return { status: response.status, body: await response.json() };
    };
    for (let i = 0; i < 4; i++) await t.mutation(api.respond.submitResponse, { ...submission(`key-small-${i}0000`, { attend: "yes", rating: 5 }), shareId });
    let result = await summary();
    expect(result.status).toBe(200);
    expect(result.body.suppressed).toBe(true);
    expect(result.body.responseCount).toBeNull();
    await t.mutation(api.respond.submitResponse, { ...submission("key-small-50000", { attend: "no", email: "private@example.com" }), shareId });
    result = await summary();
    expect(result.body.suppressed).toBe(false);
    expect(result.body.responseCount).toBe(5);
    const attend = result.body.questions.find((q: { fieldId: string }) => q.fieldId === "attend");
    // 4 "Yes" and 1 "No": both buckets are below the minimum group size.
    expect(attend.answeredCount).toBe(5);
    expect(attend.distribution).toEqual([{ option: "Other (fewer than 5)", count: null }]);
    expect(JSON.stringify(result.body)).not.toContain("private@example.com");
  });
});

describe("integration API", () => {
  it("enforces tokens, scopes, versions, idempotency and revisions", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const { token, tokenId } = await owner.mutation(api.integrations.createConnection, {
      label: "Max", scopes: ["items:read", "drafts:create", "drafts:update"], access: "selected", itemRefs: [],
    });
    const call = async (method: string, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) => {
      const response = await t.fetch(`/api/integrations/v1${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      return { status: response.status, body: await response.json() };
    };

    expect((await call("GET", "/capabilities")).body.apiVersion).toBe("1");
    expect((await call("GET", "/capabilities", { headers: { "Chaos-Api-Version": "2" } })).body.error.code).toBe("UNSUPPORTED_VERSION");
    expect((await call("GET", "/items/form_x/summary")).body.error.code).toBe("INSUFFICIENT_SCOPE");

    const draft = { kind: "form", title: "Onboarding survey", fields: [{ id: "q1", type: "choice", label: "Team?", options: ["Sales", "Support"] }], source: { label: "Onboarding page" } };
    expect((await call("POST", "/drafts", { body: draft })).body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    const created = await call("POST", "/drafts", { body: draft, headers: { "Idempotency-Key": "action-1" } });
    expect(created.status).toBe(201);
    expect(created.body.item.status).toBe("draft");
    const replay = await call("POST", "/drafts", { body: draft, headers: { "Idempotency-Key": "action-1" } });
    expect(replay.status).toBe(200);
    expect(replay.body.item.id).toBe(created.body.item.id);
    expect((await call("POST", "/drafts", { body: { ...draft, title: "Other" }, headers: { "Idempotency-Key": "action-1" } })).status).toBe(422);

    const id = created.body.item.id as string;
    const listed = await call("GET", "/items");
    expect(listed.body.items.map((i: { id: string }) => i.id)).toContain(id);

    const stale = await call("PATCH", `/items/${id}`, { body: draft, headers: { "Idempotency-Key": "edit-1", "If-Match": "999" } });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("REVISION_CONFLICT");
    const updated = await call("PATCH", `/items/${id}`, {
      body: { ...draft, fields: [{ id: "q1", type: "choice", label: "Team?", options: ["Sales", "Support", "Product"] }] },
      headers: { "Idempotency-Key": "edit-2", "If-Match": created.body.item.revision },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.item.revision).not.toBe(created.body.item.revision);

    // Other creators' items are invisible even when the id is known.
    const other = t.withIdentity(otherCreatorIdentity);
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    const foreign = await other.mutation(api.forms.createForm, {});
    expect((await call("GET", `/items/form_${foreign}`)).status).toBe(404);

    await owner.mutation(api.integrations.revokeConnection, { tokenId: tokenId as Id<"integrationTokens"> });
    expect((await call("GET", "/capabilities")).body.error.code).toBe("TOKEN_REVOKED");
    const stored = await t.run((ctx) => ctx.db.query("integrationTokens").collect());
    expect(JSON.stringify(stored)).not.toContain(token);
  });
});

describe("forms: presentation modes and themes", () => {
  it("saves and publishes swipe mode with a full theme, and serves it to respondents", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const formId = await owner.mutation(api.forms.createForm, {});
    const created = await owner.query(api.forms.getFormForEditor, { formId });
    expect(created?.draft.theme.preset).toBe("flow");

    const definition: FormDefinition = {
      ...sampleDefinition(),
      presentation: "swipe",
      theme: {
        version: 1, preset: "arcade", accent: "#ffcc00", background: "dark", font: "display", radius: "none",
        pageColor: "#1a0b3d", surfaceColor: "#2a1466", textColor: "#ffffff", layout: "flat",
        cover: "arcade", backdrop: "grid", buttons: "brutal", appearance: "fixed", sound: "arcade",
      },
    };
    const saved = await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: created!.draftRevision, definition });
    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
    const { shareId } = (await owner.query(api.forms.getFormForEditor, { formId }))!;

    const publicForm = await t.query(api.respond.getPublicForm, { shareId });
    if (publicForm.state !== "open") throw new Error(`expected an open form, got ${publicForm.state}`);
    expect(publicForm.definition.presentation).toBe("swipe");
    expect(publicForm.definition.theme).toMatchObject({ cover: "arcade", backdrop: "grid", buttons: "brutal", sound: "arcade" });

    const library = await owner.query(api.forms.listMyForms, {});
    expect(library.owned[0]).toMatchObject({ presentation: "swipe", theme: { preset: "arcade" } });
  });
});

describe("forms: deleting", () => {
  it("deletes only archived forms", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const formId = await owner.mutation(api.forms.createForm, {});
    await expect(owner.mutation(api.forms.deleteForm, { formId })).rejects.toThrow(/ARCHIVE_FIRST/);
    await owner.mutation(api.forms.setFormStatus, { formId, status: "archived" });
    await owner.mutation(api.forms.deleteForm, { formId });
    expect(await owner.query(api.forms.getFormForEditor, { formId })).toBeNull();
  });
});
