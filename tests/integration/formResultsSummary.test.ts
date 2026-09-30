/**
 * The results page summary (formResults.getAnalysis): number stats with a histogram, date spread,
 * written answers, quiz correctness per question and overall scores, and the inbox sort order.
 */
import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";
import { emptyDefinition } from "@/convex/formLogic";
import type { FormDefinition, FormField } from "@/convex/formLogic";

type T = ReturnType<typeof createTestConvex>;
const field = (f: Partial<FormField> & Pick<FormField, "id" | "type">): FormField => ({ label: f.id, required: false, ...f });

async function publish(t: T, def: FormDefinition) {
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { definition: def });
  const editor = await owner.query(api.forms.getFormForEditor, { formId });
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: editor!.draftRevision });
  const shareId = (await owner.query(api.forms.getFormForEditor, { formId }))!.shareId;
  return { owner, formId, shareId };
}

let n = 0;
async function submit(t: T, shareId: string, answers: Record<string, string | number | string[]>) {
  const result = await t.mutation(api.respond.submitResponse, { shareId, submissionKey: `summary-key-${String(++n).padStart(6, "0")}`, answers, language: "en", final: true, startedAt: Date.now() - 60_000 });
  // Later submissions get later timestamps, so sort order is observable.
  await t.run(async (ctx) => { await ctx.db.patch("formResponses", result.responseId, { submittedAt: 1_700_000_000_000 + n * 1000 }); });
  return result;
}

describe("results summary", () => {
  it("summarises numbers, dates and written answers", async () => {
    const t = createTestConvex();
    const def: FormDefinition = { ...emptyDefinition("Survey"), fields: [
      field({ id: "age", type: "number" }),
      field({ id: "day", type: "date" }),
      field({ id: "note", type: "textarea" }),
    ] };
    const { owner, formId, shareId } = await publish(t, def);
    await submit(t, shareId, { age: 20, day: "2026-01-05", note: "Loved it" });
    await submit(t, shareId, { age: 30, day: "2026-01-20", note: "Too long" });
    await submit(t, shareId, { age: 40 });
    const a = (await owner.query(api.formResults.getAnalysis, { formId }))!;
    const age = a.fields.find((f) => f.fieldId === "age")!;
    expect(age.numberStats).toMatchObject({ min: 20, max: 40, mean: 30, median: 30 });
    expect(age.numberStats!.bins.reduce((s, b) => s + b.count, 0)).toBe(3);
    const day = a.fields.find((f) => f.fieldId === "day")!;
    expect(day.dateStats).toMatchObject({ earliest: "2026-01-05", latest: "2026-01-20", unit: "day" });
    expect(day.skipped).toBe(1);
    const note = a.fields.find((f) => f.fieldId === "note")!;
    expect(note.texts!.map((x) => x.text)).toEqual(["Too long", "Loved it"]);
    expect(note.textCount).toBe(2);
    expect(a.quiz).toBeNull();
    expect(a.lastResponseAt).not.toBeNull();
  });

  it("reports % correct, the most common wrong answer and overall scores in quiz mode", async () => {
    const t = createTestConvex();
    const options = [{ id: "a", label: "Paris" }, { id: "b", label: "Lyon" }, { id: "c", label: "Nice" }];
    const def: FormDefinition = { ...emptyDefinition("Quiz"), quiz: { enabled: true }, fields: [
      field({ id: "capital", type: "choice", options, quiz: { correctOptionIds: ["a"], points: 2 } }),
      field({ id: "both", type: "multi_choice", options, quiz: { correctOptionIds: ["a", "b"], points: 2 } }),
    ] };
    const { owner, formId, shareId } = await publish(t, def);
    await submit(t, shareId, { capital: "a", both: ["a", "b"] }); // 4 / 4
    await submit(t, shareId, { capital: "b", both: ["a"] }); // 0 / 4
    await submit(t, shareId, { capital: "b", both: ["b", "a"] }); // 2 / 4
    await submit(t, shareId, { capital: "c", both: ["a"] }); // 0 / 4
    const a = (await owner.query(api.formResults.getAnalysis, { formId }))!;
    const capital = a.fields.find((f) => f.fieldId === "capital")!.quiz!;
    expect(capital).toMatchObject({ answered: 4, correct: 1, correctRate: 0.25, commonWrong: { label: "Lyon", count: 2 }, correctLabels: ["Paris"] });
    const both = a.fields.find((f) => f.fieldId === "both")!.quiz!;
    expect(both).toMatchObject({ answered: 4, correct: 2, commonWrong: { label: "Paris", count: 2 } });
    expect(a.quiz).toMatchObject({ graded: 4, average: 1.5, median: 1, maxScore: 4, passRate: 0.5 });
    expect(a.quiz!.bins.reduce((s, b) => s + b.count, 0)).toBe(4);
  });

  it("lists responses newest or oldest first", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, { ...emptyDefinition("Order"), fields: [field({ id: "name", type: "text" })] });
    for (const name of ["first", "second", "third"]) await submit(t, shareId, { name });
    const list = async (order?: "asc" | "desc") => (await owner.query(api.formResults.listResponses, { formId, filter: {}, order, paginationOpts: { numItems: 10, cursor: null } })).page.map((r) => r.preview);
    expect(await list()).toEqual(["third", "second", "first"]);
    expect(await list("asc")).toEqual(["first", "second", "third"]);
  });
});
