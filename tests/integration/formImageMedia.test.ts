import { afterEach, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { api } from "../../convex/_generated/api";
import { sha256Hex } from "../../convex/serverUtils";
import { emptyDefinition } from "../../convex/formLogic";
import { SOURCE_STORAGE_QUOTA } from "../../convex/sourceStorage";
import type { Id } from "../../convex/_generated/dataModel";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const reserve = makeFunctionReference<"mutation", {
  formId: Id<"forms">; bytes: number; mimeType: string;
}, Id<"formImageMedia">>("formImageMedia:reserveUpload");
const markReady = makeFunctionReference<"mutation", { mediaId: Id<"formImageMedia">; etag: string }, null>("formImageMedia:markReady");
const getReady = makeFunctionReference<"query", { id: string; responseId?: string; receiptCode?: string; grant?: string; editToken?: string }, {
  key: string; etag: string; mimeType: string; bytes: number;
} | null>("formImageMedia:getReady");
const remove = makeFunctionReference<"mutation", { mediaId: Id<"formImageMedia"> }, null>("formImageMedia:remove");
const etag = '"1234567890abcdef1234567890abcdef"';
const origin = "https://test.convex.site/forms/images/content?mediaId=";

it("reserves shared storage bytes atomically and releases them only after physical cleanup", async () => {
  const { t, owner, formId } = await fixture();
  const mediaId = await owner.mutation(reserve, { formId, bytes: 18, mimeType: "image/png" });
  const usage = () => t.run(ctx => ctx.db.query("sourceStorageUsage").withIndex("by_ownerId", q => q.eq("ownerId", creatorIdentity.subject)).unique());
  expect((await usage())?.bytes).toBe(18);
  const row = await usage();
  await t.run(ctx => ctx.db.patch("sourceStorageUsage", row!._id, { bytes: SOURCE_STORAGE_QUOTA - 1 }));
  await expect(owner.mutation(reserve, { formId, bytes: 18, mimeType: "image/png" })).rejects.toThrow("STORAGE_QUOTA");
  expect((await usage())?.bytes).toBe(SOURCE_STORAGE_QUOTA - 1);
  await owner.mutation(remove, { mediaId });
  expect((await usage())?.bytes).toBe(SOURCE_STORAGE_QUOTA - 1);
  vi.stubEnv("CHAOS_R2_ACCOUNT_ID", "a".repeat(32)); vi.stubEnv("CHAOS_R2_BUCKET", "test-private");
  vi.stubEnv("CHAOS_R2_ACCESS_KEY_ID", "test-key"); vi.stubEnv("CHAOS_R2_SECRET_ACCESS_KEY", "test-secret");
  const cleanup = makeFunctionReference<"action", { kind: "form"; id: string }, null>("r2MediaCleanup:cleanup");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  await t.action(cleanup, { kind: "form", id: mediaId });
  expect((await usage())?.bytes).toBe(SOURCE_STORAGE_QUOTA - 19);
  await t.action(cleanup, { kind: "form", id: mediaId });
  expect((await usage())?.bytes).toBe(SOURCE_STORAGE_QUOTA - 19);
  vi.unstubAllGlobals();
});

async function fixture() {
  vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site");
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  const other = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await other.mutation(api.quizFunctions.getOrCreateUser, {});
  const definition = emptyDefinition("Illustrated quiz");
  definition.quiz = { enabled: true };
  definition.fields = [{
    id: "image_q1", label: "Identify the image", type: "choice", required: true,
    options: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    quiz: { correctOptionIds: ["a"], points: 2 },
  }];
  const formId = await owner.mutation(api.forms.createForm, { definition });
  return { t, owner, other, formId, definition };
}

it("allows only editors to reserve form-bound images, enforcing size and MIME", async () => {
  const { t, owner, other, formId } = await fixture();
  const args = { formId, bytes: 18, mimeType: "image/png" };
  await expect(t.mutation(reserve, args)).rejects.toThrow();
  await expect(other.mutation(reserve, args)).rejects.toThrow("FORM_NOT_FOUND");
  await expect(owner.mutation(reserve, { ...args, bytes: 0 })).rejects.toThrow("INVALID_IMAGE");
  await expect(owner.mutation(reserve, { ...args, bytes: 5 * 1024 * 1024 + 1 })).rejects.toThrow("INVALID_IMAGE");
  await expect(owner.mutation(reserve, { ...args, mimeType: "text/html" })).rejects.toThrow("INVALID_IMAGE");
  const id = await owner.mutation(reserve, args);
  await expect(other.mutation(markReady, { mediaId: id, etag })).rejects.toThrow();
  await owner.mutation(markReady, { mediaId: id, etag });
  expect(await t.query(getReady, { id })).toBeNull();
  expect(await other.query(getReady, { id })).toBeNull();
  await expect(other.mutation(remove, { mediaId: id })).rejects.toThrow();
});

it("serves images only when referenced in a live public, published, released form", async () => {
  const { t, owner, formId, definition } = await fixture();
  const mediaId = await owner.mutation(reserve, { formId, bytes: 18, mimeType: "image/png" });
  await owner.mutation(markReady, { mediaId, etag });
  const url = origin + mediaId;
  expect(await t.query(getReady, { id: mediaId })).toBeNull();

  definition.fields[0].image = { url, alt: "Anatomy diagram" };
  definition.fields[0].options![0].image = { url, alt: "Choice diagram" };
  const initial = await owner.query(api.forms.getFormForEditor, { formId });
  const saved = await owner.mutation(api.forms.saveFormDraft, {
    formId, expectedRevision: initial!.draftRevision, definition,
  });
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
  expect((await t.query(getReady, { id: mediaId }))?.key).toEqual("form-images/" + mediaId);

  await t.run(async ctx => {
    const form = (await ctx.db.get("forms", formId))!;
    await ctx.db.patch("forms", formId, { settings: { ...form.settings, access: "code" } });
  });
  expect(await t.query(getReady, { id: mediaId })).toBeNull();
  await t.run(async ctx => {
    const form = (await ctx.db.get("forms", formId))!;
    await ctx.db.patch("forms", formId, { settings: { ...form.settings, access: "public" }, status: "closed" });
  });
  expect(await t.query(getReady, { id: mediaId })).toBeNull();
  await owner.mutation(remove, { mediaId });
  expect(await t.query(getReady, { id: mediaId })).toBeNull();
});

it("does not reveal explanation images without a completed response and matching receipt proof", async () => {
  const { t, owner, formId, definition } = await fixture();
  const mediaId = await owner.mutation(reserve, { formId, bytes: 23, mimeType: "image/jpeg" });
  await owner.mutation(markReady, { mediaId, etag });
  definition.fields[0].quiz!.explanationImage = { url: origin + mediaId, alt: "Worked answer" };
  const initial = await owner.query(api.forms.getFormForEditor, { formId });
  const saved = await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: initial!.draftRevision, definition });
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });

  const responseId = await t.run(ctx => ctx.db.insert("formResponses", {
    formId, version: 1, status: "completed", answers: { image_q1: "a" },
    language: "en", submissionKey: "image-proof-001", receiptCode: "RECEIPT1",
    startedAt: Date.now() - 10000, submittedAt: Date.now(), updatedAt: Date.now(),
    reviewed: false, tags: [], spam: false, searchText: "",
  }));
  expect(await t.query(getReady, { id: mediaId })).toBeNull();
  expect(await t.query(getReady, { id: mediaId, responseId, receiptCode: "WRONG" })).toBeNull();
  expect((await t.query(getReady, { id: mediaId, responseId, receiptCode: "RECEIPT1" }))?.key)
    .toEqual("form-images/" + mediaId);
  await t.run(async ctx => {
    const version = (await ctx.db.query("formVersions")
      .withIndex("by_formId_and_version", q => q.eq("formId", formId).eq("version", 1)).unique())!;
    await ctx.db.patch("formVersions", version._id, {
      definition: { ...definition, quiz: { enabled: true, showAnswers: false } },
    });
  });
  expect(await t.query(getReady, { id: mediaId, responseId, receiptCode: "RECEIPT1" })).toBeNull();
});


it("serves hosted images to authorized respondents and editors only", async () => {
  const { t, owner, other, formId, definition } = await fixture();
  const mediaId = await owner.mutation(reserve, { formId, bytes: 18, mimeType: "image/png" });
  await owner.mutation(markReady, { mediaId, etag });
  expect(await owner.query(getReady, { id: mediaId })).not.toBeNull();
  expect(await other.query(getReady, { id: mediaId })).toBeNull();
  definition.fields[0].image = { url: origin + mediaId, alt: "Diagram" };
  const initial = await owner.query(api.forms.getFormForEditor, { formId });
  const saved = await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: initial!.draftRevision, definition });
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
  const grant = "grant_test";
  const tokenHash = await sha256Hex(grant);
  await t.run(async ctx => {
    const form = (await ctx.db.get("forms", formId))!;
    await ctx.db.patch("forms", formId, { settings: { ...form.settings, access: "code", accessCodeHash: "hash" } });
    await ctx.db.insert("formAccessGrants", { formId, tokenHash, accessCodeHash: "hash", expiresAt: Date.now() + 60_000 });
  });
  expect(await t.query(getReady, { id: mediaId })).toBeNull();
  expect(await t.query(getReady, { id: mediaId, grant: "grant_wrong" })).toBeNull();
  expect(await t.query(getReady, { id: mediaId, grant })).not.toBeNull();
  await t.run(async ctx => {
    const form = (await ctx.db.get("forms", formId))!;
    await ctx.db.patch("forms", formId, { settings: { ...form.settings, access: "signed_in" } });
  });
  expect(await t.query(getReady, { id: mediaId })).toBeNull();
  expect(await other.query(getReady, { id: mediaId })).not.toBeNull();
});


it("retires expired and removed uploads before storage cleanup without deleting ready images", async () => {
  const { t, owner, formId } = await fixture();
  const claim = makeFunctionReference<"mutation", { kind: "form"; id: string }, string | null>("r2MediaCleanup:claim");
  const pending = await owner.mutation(reserve, { formId, bytes: 18, mimeType: "image/png" });
  expect(await t.mutation(claim, { kind: "form", id: pending })).toBeNull();
  await t.run(ctx => ctx.db.patch("formImageMedia", pending, { expiresAt: Date.now() - 1 }));
  expect(await t.mutation(claim, { kind: "form", id: pending })).toBe("form-images/" + pending);
  await expect(owner.mutation(markReady, { mediaId: pending, etag })).rejects.toThrow();
  const ready = await owner.mutation(reserve, { formId, bytes: 18, mimeType: "image/png" });
  await owner.mutation(markReady, { mediaId: ready, etag });
  expect(await t.mutation(claim, { kind: "form", id: ready })).toBeNull();
  await owner.mutation(remove, { mediaId: ready });
  expect(await t.mutation(claim, { kind: "form", id: ready })).toBe("form-images/" + ready);
  await expect(owner.mutation(markReady, { mediaId: ready, etag })).rejects.toThrow();
});


it("deletes only retired R2 objects and leaves ready objects intact", async () => {
  const { t, owner, formId } = await fixture();
  vi.stubEnv("CHAOS_R2_ACCOUNT_ID", "0123456789abcdef0123456789abcdef");
  vi.stubEnv("CHAOS_R2_BUCKET", "test-private-media");
  vi.stubEnv("CHAOS_R2_ACCESS_KEY_ID", "test-key");
  vi.stubEnv("CHAOS_R2_SECRET_ACCESS_KEY", "test-secret");
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  const cleanup = makeFunctionReference<"action", { kind: "form"; id: string }, null>("r2MediaCleanup:cleanup");
  const ready = await owner.mutation(reserve, { formId, bytes: 18, mimeType: "image/png" });
  await owner.mutation(markReady, { mediaId: ready, etag });
  await t.action(cleanup, { kind: "form", id: ready });
  expect(fetchMock).not.toHaveBeenCalled();
  const expired = await owner.mutation(reserve, { formId, bytes: 18, mimeType: "image/png" });
  await t.run(ctx => ctx.db.patch("formImageMedia", expired, { expiresAt: Date.now() - 1 }));
  await t.action(cleanup, { kind: "form", id: expired });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  expect(await t.run(ctx => ctx.db.get("formImageMedia", expired))).toMatchObject({ status: "removed" });
});


it("serves only the response version's images to a valid after-close edit link", async () => {
  const { t, owner, formId, definition } = await fixture();
  const mediaId = await owner.mutation(reserve, { formId, bytes: 18, mimeType: "image/png" });
  await owner.mutation(markReady, { mediaId, etag });
  definition.fields[0].image = { url: origin + mediaId, alt: "Diagram" };
  const initial = await owner.query(api.forms.getFormForEditor, { formId });
  const saved = await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: initial!.draftRevision, definition });
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
  const editToken = "a".repeat(48), editTokenHash = await sha256Hex(editToken);
  const shareId = await t.run(async ctx => {
    const form = (await ctx.db.get("forms", formId))!;
    await ctx.db.patch("forms", formId, { status: "closed", settings: { ...form.settings, allowEditAfterSubmit: true, allowEditAfterClose: true } });
    await ctx.db.insert("formResponses", { formId, version: 1, status: "completed", answers: { image_q1: "a" }, language: "en", submissionKey: "edit-image-test", receiptCode: "RECEIPT1", editTokenHash, startedAt: 1, submittedAt: 2, updatedAt: 2, reviewed: false, tags: [], spam: false, searchText: "" });
    return form.shareId;
  });
  expect(await t.query(getReady, { id: mediaId })).toBeNull();
  expect(await t.query(getReady, { id: mediaId, editToken: "b".repeat(48) })).toBeNull();
  expect(await t.query(getReady, { id: mediaId, editToken })).not.toBeNull();
  const editing = await t.query(api.respond.getSubmissionForEdit, { shareId, editToken });
  expect(editing?.definition.fields[0].image?.url).toContain(`editToken=${editToken}`);
  await t.run(async ctx => { const form = (await ctx.db.get("forms", formId))!; await ctx.db.patch("forms", formId, { settings: { ...form.settings, allowEditAfterClose: false } }); });
  expect(await t.query(getReady, { id: mediaId, editToken })).toBeNull();
});
