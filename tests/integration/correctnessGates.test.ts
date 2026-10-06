import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { emptyDefinition, type FormDefinition } from "@/convex/formLogic";

/**
 * Correctness before speed (perf/README.md). These are the failures no
 * performance win can pay for, stated once, end to end through Convex:
 *
 * - a form that loses answers;
 * - a publication that exposes a draft;
 * - a read that shows deleted, archived or unpublished content.
 *
 * `pnpm test:correctness` runs this file with the other correctness suites
 * before every perf measurement; a failure here fails the perf check.
 */

function definition(title = "Gate form"): FormDefinition {
  const def = emptyDefinition(title);
  def.fields = [
    { id: "name", type: "text", label: "Your name", required: true },
    { id: "pick", type: "choice", label: "Pick one", required: true, options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] },
    { id: "notes", type: "textarea", label: "Anything else?", required: false },
  ];
  return def;
}

async function publishedForm(t: ReturnType<typeof createTestConvex>) {
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { definition: definition() });
  const form = (await owner.query(api.forms.getFormForEditor, { formId }))!;
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: form.draftRevision });
  const editor = (await owner.query(api.forms.getFormForEditor, { formId }))!;
  return { owner, formId, shareId: editor.shareId, draftRevision: editor.draftRevision };
}

const submit = (shareId: string, key: string, answers: Record<string, string>) => ({ shareId, submissionKey: key, answers, language: "en" as const, final: true, startedAt: Date.now() - 60_000 });

describe("correctness gate: answers are never lost", { timeout: 60_000 }, () => {
  it("stores every answer exactly, including while the owner edits the draft", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId, draftRevision } = await publishedForm(t);
    const answers = Array.from({ length: 12 }, (_, i) => ({ name: `Respondent ${i} ${"x".repeat(i * 40)} ✓ "quoted"`, pick: i % 2 ? "a" : "b", notes: i % 3 ? `Note ${i}` : "" }));

    // Responses arrive between and after draft saves of the same form.
    let revision = draftRevision;
    for (const [i, a] of answers.entries()) {
      const clean = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== ""));
      await t.mutation(api.respond.submitResponse, submit(shareId, `gate-key-${String(i).padStart(4, "0")}`, clean));
      if (i % 4 === 0) {
        const saved = await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: revision, definition: { ...definition(), title: `Draft ${i}` } });
        revision = saved.draftRevision;
      }
    }

    const page = await owner.query(api.formResults.listResponses, { formId, filter: {}, paginationOpts: { numItems: 50, cursor: null } });
    expect(page.page).toHaveLength(answers.length);
    const stored = JSON.stringify(await Promise.all(page.page.map((r) => owner.query(api.formResults.getResponse, { responseId: r._id }))));
    for (const a of answers) {
      expect(stored).toContain(JSON.stringify(a.name).slice(1, -1));
      if (a.notes) expect(stored).toContain(a.notes);
    }
    expect((await owner.query(api.forms.getFormForEditor, { formId }))!.responseCount).toBe(answers.length);
  });
});

describe("correctness gate: drafts are never published by accident", () => {
  it("serves the published form version while a newer draft exists", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId, draftRevision } = await publishedForm(t);
    const secret = "DRAFT-ONLY question nobody should see yet";
    const draft = definition("Draft title nobody should see");
    draft.fields = [...draft.fields, { id: "secret", type: "text", label: secret, required: false }];
    await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: draftRevision, definition: draft });

    const publicView = JSON.stringify(await t.query(api.respond.getPublicForm, { shareId }));
    expect(publicView).toContain("Gate form");
    expect(publicView).not.toContain(secret);
    expect(publicView).not.toContain("Draft title nobody should see");
    // An answer to the draft-only question is refused or dropped, never stored.
    await t.mutation(api.respond.submitResponse, submit(shareId, "gate-key-draft", { name: "N", pick: "a", secret: "leak" })).catch(() => null);
    const page = await owner.query(api.formResults.listResponses, { formId, filter: {}, paginationOpts: { numItems: 5, cursor: null } });
    const stored = JSON.stringify(await Promise.all(page.page.map((r) => owner.query(api.formResults.getResponse, { responseId: r._id }))));
    expect(stored).not.toContain("leak");
  });

  it("serves the published lesson version while a newer draft exists", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const metadata = { title: "Published lesson", description: "", language: "en", tags: [] };
    const doc = (text: string) => ({ schemaVersion: 1 as const, blocks: [{ id: "b1", type: "paragraph" as const, text, citations: [], conceptIds: [] }] });
    const lessonId = await owner.mutation(api.lessons.create, { metadata, document: doc("Published words") });
    const first = await owner.query(api.lessons.getDraft, { lessonId });
    await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: first.revision, visibility: "public" });
    const current = await owner.query(api.lessons.getDraft, { lessonId });
    await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: current.revision, document: doc("Unpublished draft words") });

    const reader = t.withIdentity(otherCreatorIdentity);
    const published = JSON.stringify(await reader.query(api.lessons.getPublished, { lessonId }));
    expect(published).toContain("Published words");
    expect(published).not.toContain("Unpublished draft words");
  });
});

describe("correctness gate: removed content is never shown", () => {
  it("hides archived and deleted forms from respondents and the library", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publishedForm(t);
    await owner.mutation(api.forms.setFormStatus, { formId, status: "archived" });
    expect(await t.query(api.respond.getPublicForm, { shareId })).toEqual({ state: "unavailable" });
    await expect(t.mutation(api.respond.submitResponse, submit(shareId, "gate-key-archived", { name: "N", pick: "a" }))).rejects.toThrow();

    await owner.mutation(api.forms.deleteForm, { formId });
    expect(await t.query(api.respond.getPublicForm, { shareId })).toEqual({ state: "unavailable" });
    expect(JSON.stringify(await owner.query(api.forms.listMyForms, {}))).not.toContain(formId);
  });

  it("stops serving a lesson once it is unpublished", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity(creatorIdentity);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    const lessonId = await owner.mutation(api.lessons.create, {
      metadata: { title: "Soon gone", description: "", language: "en", tags: [] },
      document: { schemaVersion: 1, blocks: [{ id: "b1", type: "paragraph", text: "Removed words", citations: [], conceptIds: [] }] },
    });
    const draft = await owner.query(api.lessons.getDraft, { lessonId });
    await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: draft.revision, visibility: "public" });
    const reader = t.withIdentity(otherCreatorIdentity);
    expect(JSON.stringify(await reader.query(api.lessons.getPublished, { lessonId }))).toContain("Removed words");

    const now = await owner.query(api.lessons.getDraft, { lessonId });
    await owner.mutation(api.lessons.setLifecycle, { lessonId, expectedRevision: now.revision, action: "unpublish" });
    const after = await reader.query(api.lessons.getPublished, { lessonId }).catch(() => null);
    expect(JSON.stringify(after ?? null)).not.toContain("Removed words");
  });
});
