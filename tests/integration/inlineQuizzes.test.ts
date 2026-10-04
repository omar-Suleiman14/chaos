import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity, questionFixtures, quizFixture } from "../fixtures";
import { createTestConvex } from "./setup";
afterEach(() => vi.unstubAllEnvs());

it("keeps public inline form quiz metadata frozen and responses on the original assessment", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { title: "Checkpoint", quizMode: true });
  const draft = (await owner.query(api.forms.getFormForEditor, { formId }))!;
  const definition = { ...draft.draft, fields: [{ id: "answer", type: "choice" as const, label: "Choose", required: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], quiz: { correctOptionIds: ["a"], points: 4 } }] };
  const saved = await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: draft.draftRevision, definition });
  expect(await t.query(api.learnFrontend.embeddedQuiz, { asset: { kind: "form", id: formId } })).toBeNull();
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
  const meta = (await t.query(api.learnFrontend.embeddedQuiz, { asset: { kind: "form", id: formId } }))!;
  expect(meta).toMatchObject({ title: "Checkpoint", questionCount: 1, href: `/f/${draft.shareId}`, shareId: draft.shareId });
  await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: saved.draftRevision, definition: { ...definition, title: "Private draft title" } });
  expect((await t.query(api.learnFrontend.embeddedQuiz, { asset: { kind: "form", id: formId } }))?.title).toBe("Checkpoint");
  const result = await t.mutation(api.respond.submitResponse, { shareId: meta.shareId!, submissionKey: "inline-checkpoint-1", answers: { answer: "a" }, language: "en", final: true, startedAt: Date.now() - 1000 });
  expect(result).toMatchObject({ quizScore: 4, quizMaxScore: 4 });
  expect(await t.run(async ctx => (await ctx.db.query("formResponses").collect()).map(r => r.formId))).toEqual([formId]);
  const userId = await t.run(async ctx => (await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", creatorIdentity.subject)).unique())!._id);
  await t.run(ctx => ctx.db.patch("users", userId, { isBanned: true }));
  expect(await t.query(api.learnFrontend.embeddedQuiz, { asset: { kind: "form", id: formId } })).toBeNull();
  await t.run(ctx => ctx.db.patch("users", userId, { isBanned: false }));
  await owner.mutation(api.forms.setFormStatus, { formId, status: "closed" });
  expect(await t.query(api.learnFrontend.embeddedQuiz, { asset: { kind: "form", id: formId } })).toBeNull();
  expect(await t.query(api.learnFrontend.embeddedQuiz, { asset: { kind: "form", id: "invalid" } })).toBeNull();
});

it("pages owner quiz choices without exposing another creator and keeps classic snapshot URLs", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), other = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await other.mutation(api.quizFunctions.getOrCreateUser, {});
  await owner.mutation(api.forms.createForm, { title: "Own draft", quizMode: true });
  await other.mutation(api.forms.createForm, { title: "Other secret", quizMode: true });
  const options = { numItems: 20, cursor: null };
  const choices = await owner.query(api.learnLibrary.quizChoices, { kind: "form", paginationOpts: options });
  expect(choices.page.map(q => q.title)).toEqual(["Own draft"]);
  expect(choices.page[0].published).toBe(false);
  await expect(t.query(api.learnLibrary.quizChoices, { kind: "form", paginationOpts: options })).rejects.toThrow();
  await expect(owner.query(api.learnLibrary.quizChoices, { kind: "quiz", paginationOpts: { numItems: 101, cursor: null } })).rejects.toThrow("1..100");
  const quizId = await t.run(async ctx => {
    const id = await ctx.db.insert("quizzes", { ...quizFixture, title: "Private changed draft", creatorId: creatorIdentity.subject, creatorUsername: "creator" });
    const question = await ctx.db.insert("questions", { ...questionFixtures.mcq, quizId: id });
    await ctx.db.patch("quizzes", id, { publishedSnapshot: { title: "Published checkpoint", questions: [{ ...questionFixtures.mcq, _id: question }] } });
    return id;
  });
  expect(await t.query(api.learnFrontend.embeddedQuiz, { asset: { kind: "quiz", id: quizId } })).toEqual({ title: "Published checkpoint", shareId: null, href: "/creator/fixture-quiz", questionCount: 1 });
  expect((await owner.query(api.learnLibrary.quizChoices, { kind: "quiz", paginationOpts: options })).page[0]).toMatchObject({ id: quizId, published: true });
  await t.run(ctx => ctx.db.patch("quizzes", quizId, { isBanned: true }));
  expect(await t.query(api.learnFrontend.embeddedQuiz, { asset: { kind: "quiz", id: quizId } })).toBeNull();
  expect(await t.query(api.learnFrontend.embeddedQuiz, { asset: { kind: "quiz", id: "invalid" } })).toBeNull();
});
