import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { LIMITS } from "@/convex/formLogic";
import { createTestConvex } from "@/tests/integration/setup";
import { measureConvex, readMetrics } from "../lib/convex";
import { formAnswers, formDefinition } from "../lib/content";
import { PERF_EPOCH, seedRandom, signIn } from "../lib/fixtures";
import { bytes, recordPerf } from "../lib/record";

/**
 * Large forms: 10, 100 and the 200-question maximum, each with conditional
 * logic, images, sections and a theme, plus collected responses. Budgets the
 * editor, the respondent page, a save, publication and results reads, and
 * checks the size limit itself holds.
 */
// Section breaks count toward the 200-field limit: 182 questions + 18 sections is the largest form.
const SIZES = [{ name: "q10", questions: 10, responses: 50 }, { name: "q100", questions: 100, responses: 50 }, { name: "max", questions: 182, responses: 25 }] as const;
beforeEach(() => { vi.setSystemTime(PERF_EPOCH); seedRandom(); });

describe("large forms", () => {
  for (const { name, questions, responses: n } of SIZES) {
    it(`${questions} questions with logic, images, sections, theme and responses`, async (ctx) => {
      const t = createTestConvex();
      const owner = await signIn(t, undefined, "perry");
      const definition = formDefinition(`Survey ${name}`, questions, { conditional: true, images: true, sections: true, theme: true });
      if (name === "max") expect(definition.fields.length).toBe(LIMITS.fields);
      const formId = await owner.mutation(api.forms.createForm, { definition });

      const editor = await measureConvex(() => owner.query(api.forms.getFormForEditor, { formId }));
      expect(editor.result?.draft.fields.length).toBe(definition.fields.length);
      const save = await measureConvex(() => owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: editor.result!.draftRevision, definition: { ...definition, title: `Survey ${name} (edited)` } }));
      const publish = await measureConvex(() => owner.mutation(api.forms.publishForm, { formId, expectedRevision: save.result.draftRevision }));
      const shareId = (await owner.query(api.forms.getFormForEditor, { formId }))!.shareId;
      const respondent = await measureConvex(() => t.query(api.respond.getPublicForm, { shareId }));
      expect((respondent.result as { state: string }).state).toBe("open");

      let submitCost = 0;
      for (let i = 0; i < n; i++) {
        if (i > 0 && i % 100 === 0) vi.setSystemTime(Date.now() + 61_000);
        const submit = await measureConvex(() => t.mutation(api.respond.submitResponse, { shareId, submissionKey: `perf-${name}-${i}`, answers: formAnswers(definition, i), language: "en", final: true, startedAt: Date.now() - 120_000 }));
        expect((submit.result as { status: string }).status).toBe("completed");
        if (i === 0) submitCost = submit.cost.bytesWritten;
      }
      const analysis = await measureConvex(() => owner.query(api.formResults.getAnalysis, { formId }));
      const page = await measureConvex(() => owner.query(api.formResults.listResponses, { formId, filter: {}, paginationOpts: { numItems: 25, cursor: null } }));
      expect((page.result as { page: unknown[] }).page.length).toBe(Math.min(25, n));

      recordPerf(ctx, {
        ...readMetrics(`forms.${name}.editor`, editor),
        ...readMetrics(`forms.${name}.respondent`, respondent),
        [`forms.${name}.save.bytesWritten`]: bytes(save.cost.bytesWritten),
        [`forms.${name}.publish.documentsWritten`]: publish.cost.documentsWritten,
        [`forms.${name}.publish.bytesWritten`]: bytes(publish.cost.bytesWritten),
        [`forms.${name}.submit.bytesWritten`]: bytes(submitCost),
        ...readMetrics(`forms.${name}.r${n}.analysis`, analysis),
        ...readMetrics(`forms.${name}.r${n}.responsesPage`, page),
      });
    });
  }

  it("rejects forms above the question limit", async () => {
    const t = createTestConvex();
    const owner = await signIn(t, undefined, "perry");
    await expect(owner.mutation(api.forms.createForm, { definition: formDefinition("Too big", 500) })).rejects.toThrow(/at most 200/);
    const formId = await owner.mutation(api.forms.createForm, { definition: formDefinition("At the limit", LIMITS.fields) });
    const draft = (await owner.query(api.forms.getFormForEditor, { formId }))!;
    await expect(owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: draft.draftRevision, definition: formDefinition("One more", LIMITS.fields + 1) })).rejects.toThrow("DRAFT_LIMIT");
  });
});
