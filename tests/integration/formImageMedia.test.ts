import { afterEach, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { api } from "../../convex/_generated/api";
import { emptyDefinition } from "../../convex/formLogic";
import type { Id } from "../../convex/_generated/dataModel";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());

const reserve = makeFunctionReference<"mutation", {
  formId: Id<"forms">; bytes: number; mimeType: string;
}, Id<"formImageMedia">>("formImageMedia:reserveUpload");
const markReady = makeFunctionReference<"mutation", { mediaId: Id<"formImageMedia">; etag: string }, null>("formImageMedia:markReady");
const getReady = makeFunctionReference<"query", { id: string; responseId?: string; receiptCode?: string }, {
  key: string; etag: string; mimeType: string; bytes: number;
} | null>("formImageMedia:getReady");
const remove = makeFunctionReference<"mutation", { mediaId: Id<"formImageMedia"> }, null>("formImageMedia:remove");
const etag = '"1234567890abcdef1234567890abcdef"';
const origin = "https://test.convex.site/forms/images/content?mediaId=";

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
