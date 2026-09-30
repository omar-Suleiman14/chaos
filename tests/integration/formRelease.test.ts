import { describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { emptyDefinition, checkDefinition } from "@/convex/formLogic";
import { releasedDefinition } from "@/convex/formRelease";
import { creatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

const instant = 1_800_000_000_000;
function definition() {
  const def = emptyDefinition("Scheduled assessment");
  def.fields = [
    { id: "first", type: "text", label: "Available", required: true },
    { id: "later", type: "section", label: "Secret section", required: false, releasesAt: instant + 1000 },
    { id: "child", type: "text", label: "Secret child", required: true },
    { id: "upload", type: "file", label: "Secret upload", required: false },
    { id: "next", type: "section", label: "Next section", required: false },
    { id: "branch", type: "text", label: "Secret-dependent branch", required: false,
      showIf: { match: "all", conditions: [{ fieldId: "child", op: "answered" }] } },
    { id: "independent", type: "text", label: "Independent", required: false },
  ];
  return def;
}
async function fixture() {
  vi.setSystemTime(instant);
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { definition: definition() });
  const form = (await owner.query(api.forms.getFormForEditor, { formId }))!;
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: form.draftRevision });
  return { t, owner, formId, shareId: form.shareId };
}
describe("scheduled field release", () => {
  it("removes section children and dependent branching content until the exact boundary", async () => {
    const { t, shareId } = await fixture();
    const before = await t.query(api.respond.getPublicForm, { shareId });
    expect(JSON.stringify(before)).not.toContain("Secret");
    expect(before.state === "open" && before.definition.fields.map(f => f.id)).toEqual(["first", "next", "independent"]);
    vi.setSystemTime(instant + 1000);
    const after = await t.query(api.respond.getPublicForm, { shareId });
    expect(after.state === "open" && after.definition.fields.map(f => f.id)).toContain("child");
  });
  it("rejects guessed early answers and forged client start times without writes", async () => {
    const { t, shareId } = await fixture();
    const args = { shareId, submissionKey: "release-test-001", language: "en" as const, final: true,
      answers: { first: "ok", child: "spoof" }, startedAt: instant + 100000 };
    await expect(t.mutation(api.respond.submitResponse, args)).rejects.toThrow(/FIELD_NOT_RELEASED/);
    expect(await t.run(ctx => ctx.db.query("formResponses").collect())).toEqual([]);
    await t.mutation(api.respond.submitResponse, { ...args, answers: { first: "ok" } });
    vi.setSystemTime(instant + 1000);
    await expect(t.mutation(api.respond.submitResponse, { ...args, submissionKey: "release-test-002", answers: { first: "ok" } })).rejects.toThrow(/required/);
    await t.mutation(api.respond.submitResponse, { ...args, submissionKey: "release-test-003" });
  });
  it("blocks upload tickets for unreleased section children", async () => {
    const { t, shareId } = await fixture();
    await expect(t.mutation(api.respond.generateUploadUrl, { shareId, fieldId: "upload" })).rejects.toThrow(/FIELD_NOT_RELEASED/);
    expect(await t.run(ctx => ctx.db.query("formUploadTickets").collect())).toEqual([]);
  });
  it("enforces release on resume and edit writes and omits future content on edit reads", async () => {
    const { t, owner, formId, shareId } = await fixture();
    const stored = (await t.run(ctx => ctx.db.get("forms", formId)))!;
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: {
      ...stored.settings, allowEditAfterSubmit: true, allowResumeLink: true,
    } });
    const token = "a".repeat(48);
    await expect(t.mutation(api.respond.saveResumeDraft, {
      shareId, token, answers: { first: "ok", child: "early" }, language: "en",
    })).rejects.toThrow(/FIELD_NOT_RELEASED/);
    await t.mutation(api.respond.submitResponse, {
      shareId, submissionKey: "release-edit-001", editToken: token,
      answers: { first: "ok" }, language: "en", final: true,
    });
    const edit = await t.query(api.respond.getSubmissionForEdit, { shareId, editToken: token });
    expect(JSON.stringify(edit)).not.toContain("Secret child");
    await expect(t.mutation(api.respond.updateSubmission, {
      shareId, editToken: token, answers: { first: "ok", child: "early" }, language: "en",
    })).rejects.toThrow(/FIELD_NOT_RELEASED/);
  });
  it("validates UTC timestamps and preserves published history when draft schedules change", async () => {
    const bad = definition();
    bad.fields[1].releasesAt = NaN;
    expect(checkDefinition(bad).errors.join(" ")).toMatch(/release time/);
    for (const invalid of [-1, 1.5, Infinity, 8640000000000001]) {
      bad.fields[1].releasesAt = invalid;
      expect(checkDefinition(bad).errors.join(" ")).toMatch(/release time/);
    }
    const { t, owner, formId, shareId } = await fixture();
    const editor = (await owner.query(api.forms.getFormForEditor, { formId }))!;
    const draft = definition(); draft.fields[1].releasesAt = 0;
    await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: editor.draftRevision, definition: draft });
    expect(JSON.stringify(await t.query(api.respond.getPublicForm, { shareId }))).not.toContain("Secret child");
    const version = await t.run(ctx => ctx.db.query("formVersions").first());
    expect(version!.definition.fields[1].releasesAt).toBe(instant + 1000);
    const old = emptyDefinition("Legacy");
    old.fields = [{ id: "legacy", type: "text", label: "Legacy", required: true }];
    expect(releasedDefinition(old, instant)).toEqual(old);
  });
});
