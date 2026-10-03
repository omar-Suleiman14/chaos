/// <reference types="vite/client" />
import { expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "@/convex/schema";
import { api } from "@/convex/_generated/api";
import { emptyDefinition } from "@/convex/formLogic";
import { defaultFormSettings } from "@/convex/formModel";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import "./setup";

const modules = import.meta.glob("../../convex/**/*.*s");

it.each(["public", "signed_in"] as const)("only signed_in form attempts can become account study evidence (%s)", async (access) => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const owner = t.withIdentity(creatorIdentity);
  const person = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await person.mutation(api.quizFunctions.getOrCreateUser, {});
  const def = emptyDefinition("Study quiz");
  def.quiz = { enabled: true };
  def.fields = [{ id: "q1", type: "choice", label: "Question", required: true, options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }], quiz: { correctOptionIds: ["yes"], points: 1 } }];
  const formId = await owner.mutation(api.forms.createForm, { definition: def });
  await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, access, notifyOnResponse: false } });
  const editor = (await owner.query(api.forms.getFormForEditor, { formId }))!;
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: editor.draftRevision });
  const conceptId = await t.run((ctx) => ctx.db.insert("learnConcepts", { slug: "study-quiz", title: "Study concept", description: "", createdBy: "admin" }));
  await owner.mutation(api.learnPractice.mapField, { formId, version: 1, fieldId: "q1", conceptId });

  expect(await person.query(api.respond.getPublicForm, { shareId: editor.shareId })).toMatchObject({ state: "open", signedIn: true, responseIdentityLinked: access === "signed_in" });
  const result = await person.mutation(api.respond.submitResponse, { shareId: editor.shareId, answers: { q1: "yes" }, language: "en", submissionKey: "study-progress-attempt", final: true, startedAt: Date.now() - 1000 });
  expect(result.status).toBe("completed");
  const stored = await t.run((ctx) => ctx.db.get("formResponses", result.responseId));
  expect(stored?.respondentId).toBe(access === "signed_in" ? otherCreatorIdentity.subject : undefined);
  expect(await t.run((ctx) => ctx.db.query("learnPracticeEvidence").collect())).toHaveLength(0);

  if (access === "signed_in") {
    expect(await person.mutation(api.learnPractice.ingestResponse, { formResponseId: result.responseId })).toEqual({ evidenceCount: 1 });
    expect(await t.run((ctx) => ctx.db.query("learnPracticeEvidence").collect())).toHaveLength(1);
  } else {
    await expect(person.mutation(api.learnPractice.ingestResponse, { formResponseId: result.responseId })).rejects.toThrow("Own authenticated completed response required");
    expect(await t.run((ctx) => ctx.db.query("learnPracticeEvidence").collect())).toHaveLength(0);
  }
});
