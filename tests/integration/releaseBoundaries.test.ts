import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { defaultFormSettings } from "../../convex/formModel";
import { emptyDefinition } from "../../convex/formLogic";
import { sha256Hex } from "../../convex/serverUtils";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity, questionFixtures, quizFixture } from "../fixtures";

async function formFixture() {
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const definition = emptyDefinition("Release boundaries");
  definition.fields = [{ id: "text", type: "text", label: "Text", required: false }, { id: "file", type: "file", label: "File", required: false }];
  const formId = await owner.mutation(api.forms.createForm, { definition });
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: 1 });
  const { shareId } = (await owner.query(api.forms.getFormForEditor, { formId }))!;
  return { t, owner, formId, shareId };
}

describe("respondent account boundaries", () => {
  it("keeps signed-in partials and confirmations with their respondent", async () => {
    const { t, owner, formId, shareId } = await formFixture();
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, access: "signed_in", collectPartial: true } });
    const person = t.withIdentity(creatorIdentity);
    const other = t.withIdentity(otherCreatorIdentity);
    const args = { shareId, submissionKey: "respondent-private-key", answers: { text: "private" }, language: "en" as const, final: false, startedAt: Date.now() - 60_000 };
    const partial = await person.mutation(api.respond.submitResponse, args);
    await expect(other.mutation(api.respond.submitResponse, { ...args, answers: { text: "replacement" } })).rejects.toThrow("SUBMISSION_UNAUTHORIZED");
    expect((await t.run((ctx) => ctx.db.get("formResponses", partial.responseId)))?.answers).toEqual({ text: "private" });
    await person.mutation(api.respond.submitResponse, { ...args, final: true });
    await expect(other.mutation(api.respond.submitResponse, { ...args, final: true })).rejects.toThrow("SUBMISSION_UNAUTHORIZED");
    await expect(t.mutation(api.respond.submitResponse, { ...args, final: true })).rejects.toThrow("SUBMISSION_UNAUTHORIZED");
    await owner.mutation(api.forms.setFormStatus, { formId, status: "closed" });
    expect(await person.mutation(api.respond.submitResponse, { ...args, final: true })).toMatchObject({ responseId: partial.responseId, duplicate: true });
  });

  it("does not transfer an account-bound collaborator invitation through an email match", async () => {
    const { t, owner, formId } = await formFixture();
    const invitee = t.withIdentity({ ...otherCreatorIdentity, emailVerified: true });
    await invitee.mutation(api.quizFunctions.getOrCreateUser, {});
    await owner.mutation(api.forms.inviteCollaborator, { formId, email: otherCreatorIdentity.email, role: "editor" });
    const collaboratorId = (await invitee.query(api.forms.listMyForms, {})).invites![0].collaboratorId;
    await invitee.mutation(api.forms.acceptInvite, { collaboratorId });
    const unrelated = t.withIdentity({ ...otherCreatorIdentity, subject: "another-account", tokenIdentifier: `${otherCreatorIdentity.issuer}|another-account` });
    expect(await unrelated.query(api.forms.getFormForEditor, { formId })).toBeNull();
    expect((await unrelated.query(api.forms.listMyForms, {})).shared).toEqual([]);
    expect(await unrelated.query(api.forms.searchIndex, {})).toEqual([]);
    await expect(unrelated.mutation(api.forms.saveFormDraft, { formId, expectedRevision: 1, definition: emptyDefinition("Changed") })).rejects.toThrow("FORM_NOT_FOUND");
    expect(await invitee.query(api.forms.getFormForEditor, { formId })).not.toBeNull();
  });
});

describe("upload ticket lifecycle", () => {
  it.each(["closed", "draft", "archived"] as const)("invalidates upload tickets when the form becomes %s", async (status) => {
    const { t, owner, formId, shareId } = await formFixture();
    const url = await t.mutation(api.respond.generateUploadUrl, { shareId, fieldId: "file" });
    const token = new URL(url, "https://example.test").searchParams.get("ticket")!;
    expect(await t.query(internal.respond.checkUploadTicket, { token, now: Date.now() })).toBe(true);
    await owner.mutation(api.forms.setFormStatus, { formId, status });
    expect(await t.query(internal.respond.checkUploadTicket, { token, now: Date.now() })).toBe(false);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["file"], { type: "text/plain" })));
    await expect(t.mutation(internal.respond.recordUpload, { token, storageId, name: "file.txt", contentType: "text/plain", size: 4 })).rejects.toThrow("UPLOAD_TICKET_INVALID");
    expect(await t.run((ctx) => ctx.db.query("formUploads").collect())).toHaveLength(0);
  });
});

describe("access code lifecycle", () => {
  it("invalidates legacy grants without deleting stored responses", async () => {
    const { t, owner, formId, shareId } = await formFixture();
    const saved = await t.mutation(api.respond.submitResponse, { shareId, submissionKey: "preserved-response", answers: { text: "Keep" }, language: "en", final: true });
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, access: "code" }, accessCode: "first-code" });
    const grant = `grant_${"a".repeat(64)}`;
    await t.run(async (ctx) => ctx.db.insert("formAccessGrants", { formId, tokenHash: await sha256Hex(grant), expiresAt: Date.now() + 60_000 }));
    expect(await t.query(api.respond.getPublicForm, { shareId, accessCode: grant })).toMatchObject({ state: "code" });
    expect(await t.run((ctx) => ctx.db.get("formResponses", saved.responseId))).toMatchObject({ answers: { text: "Keep" }, status: "completed" });
  });

  it("requires a new grant after the owner rotates the access code", async () => {
    const { t, owner, formId, shareId } = await formFixture();
    const settings = { ...defaultFormSettings, access: "code" as const };
    await owner.mutation(api.forms.updateFormSettings, { formId, settings, accessCode: "first-code" });
    const first = await t.mutation(api.respond.unlockForm, { shareId, code: "first-code" });
    if (!first.ok) throw new Error("Expected grant");
    expect(await t.query(api.respond.getPublicForm, { shareId, accessCode: first.grant })).toMatchObject({ state: "open" });
    await owner.mutation(api.forms.updateFormSettings, { formId, settings, accessCode: "second-code" });
    expect(await t.query(api.respond.getPublicForm, { shareId, accessCode: first.grant })).toMatchObject({ state: "code" });
    await expect(t.mutation(api.respond.submitResponse, { shareId, submissionKey: "rotated-code-submit", answers: {}, language: "en", final: true, accessCode: first.grant })).rejects.toThrow("ACCESS_CODE_REQUIRED");
    const second = await t.mutation(api.respond.unlockForm, { shareId, code: "second-code" });
    if (!second.ok) throw new Error("Expected new grant");
    expect(await t.query(api.respond.getPublicForm, { shareId, accessCode: second.grant })).toMatchObject({ state: "open" });
  });
});

describe("quiz attempt isolation", () => {
  it("includes unanswered snapshot questions in a completed attempt's possible marks", async () => {
    const t = createTestConvex();
    const { quizId, questionId } = await t.run(async (ctx) => {
      const quizId = await ctx.db.insert("quizzes", { ...quizFixture, creatorId: creatorIdentity.subject, creatorUsername: creatorIdentity.nickname });
      const questionId = await ctx.db.insert("questions", { ...questionFixtures.mcq, quizId });
      await ctx.db.insert("questions", { ...questionFixtures.trueFalse, quizId });
      return { quizId, questionId };
    });
    const sessionId = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Guest" });
    await t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId, answer: "4" });
    const result = await t.mutation(api.quizFunctions.completeQuizSession, { sessionId });
    expect(result).toMatchObject({ score: 10, totalPoints: 20 });
    expect(await t.query(api.quizFunctions.getAttemptResult, { sessionId })).toMatchObject({ score: 10, totalPoints: 20 });
    expect(await t.mutation(api.quizFunctions.completeQuizSession, { sessionId })).toEqual(result);
    expect(await t.run((ctx) => ctx.db.get("quizSessions", sessionId))).toMatchObject({ score: 10, totalPoints: 20, status: "completed" });
  });

  it("keeps same-name attempts independent when answering and completing", async () => {
    const t = createTestConvex();
    const { quizId, questionId } = await t.run(async (ctx) => {
      const quizId = await ctx.db.insert("quizzes", { ...quizFixture, creatorId: creatorIdentity.subject, creatorUsername: creatorIdentity.nickname });
      const questionId = await ctx.db.insert("questions", { ...questionFixtures.mcq, quizId });
      return { quizId, questionId };
    });
    const first = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Guest" });
    const second = await t.mutation(api.quizFunctions.startQuizSession, { quizId, playerName: "Guest" });
    expect(second).not.toBe(first);
    await t.mutation(api.quizFunctions.gradeAnswer, { sessionId: second, questionId, answer: "4" });
    await t.mutation(api.quizFunctions.completeQuizSession, { sessionId: second });
    expect(await t.run((ctx) => ctx.db.get("quizSessions", first))).toMatchObject({ status: "in_progress", score: 0, answers: [] });
  });

  it("keeps stored live attempts immutable through the asynchronous quiz API", async () => {
    const t = createTestConvex();
    const { sessionId, questionId } = await t.run(async (ctx) => {
      const quizId = await ctx.db.insert("quizzes", { ...quizFixture, creatorId: creatorIdentity.subject, creatorUsername: creatorIdentity.nickname });
      const questionId = await ctx.db.insert("questions", { ...questionFixtures.mcq, quizId });
      const sessionId = await ctx.db.insert("quizSessions", { quizId, source: "live", status: "in_progress", playerName: "Guest", score: 0, totalPoints: 0, answers: [], startedAt: Date.now() });
      return { sessionId, questionId };
    });
    await expect(t.mutation(api.quizFunctions.gradeAnswer, { sessionId, questionId, answer: "4" })).rejects.toThrow("SESSION_CLOSED");
    await expect(t.mutation(api.quizFunctions.completeQuizSession, { sessionId })).rejects.toThrow("SESSION_CLOSED");
    expect(await t.run((ctx) => ctx.db.get("quizSessions", sessionId))).toMatchObject({ status: "in_progress", score: 0, answers: [] });
  });
});
