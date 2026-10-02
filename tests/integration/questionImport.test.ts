/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { normalizeQuestionRows, readQuestionCsv, readQuestionXlsx, QuestionImportError } from "../../lib/questionImport";
import { buildXlsx } from "../../lib/xlsx";
import schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";
import { deflateRawSync } from "node:zlib";
const modules = import.meta.glob("../../convex/**/*.*s");
const csv = 'question,type,option_1,option_2,correct,points,explanation\r\n"Which, one?",choice,Yes,No,1,2,"Line one\nLine two"';
const ref = makeFunctionReference<"mutation", { title: string; input: { format: "csv"; text: string } | { format: "xlsx"; bytes: ArrayBuffer }; formId?: Id<"forms">; expectedRevision?: number }, { formId: Id<"forms">; revision: number; questionCount: number }>("questionImports:importQuestions");
describe("question import", () => {
  it("parses quoted commas, newlines, escaped quotes and BOM", () => {
    const rows = readQuestionCsv('\uFEFF' + csv); const def = normalizeQuestionRows(rows, "Quiz");
    expect(def.fields[0]).toMatchObject({ label: "Which, one?", quiz: { correctOptionIds: ["o_1"], points: 2, explanation: "Line one\nLine two" } });
    expect(readQuestionCsv('question\n"say ""yes"""')[1][0]).toBe('say "yes"');
  });
  it.each(['a\n"bad', 'a\n"bad"tail', 'a\nbad"'])("rejects malformed CSV %s", text => expect(() => readQuestionCsv(text)).toThrow(QuestionImportError));
  it("returns precise errors and never truncates rows", () => {
    try { normalizeQuestionRows(readQuestionCsv("question,option_1,option_2,correct,points\nQ,A,B,3,no"), "Quiz"); throw new Error("expected failure"); }
    catch (e) { expect(e).toBeInstanceOf(QuestionImportError); expect((e as QuestionImportError).problems).toEqual(expect.arrayContaining([expect.objectContaining({ row: 2, column: "correct" }), expect.objectContaining({ row: 2, column: "points" })])); }
    expect(() => readQuestionCsv("a\n" + "b\n".repeat(201))).toThrow();
    expect(() => readQuestionCsv("x".repeat(500001))).toThrow();
  });
  it("validates headers, option duplicates, multi-answer type and title", () => {
    for (const text of ["question,correct,wat\nQ,1,x", "question,question,correct\nQ,Q,1", "question,option_1,option_2,correct\nQ,A,A,1", "question,option_1,option_2,correct\nQ,A,B,1|2"]) expect(() => normalizeQuestionRows(readQuestionCsv(text), "Quiz")).toThrow();
    expect(() => normalizeQuestionRows(readQuestionCsv(csv), "")).toThrow();
    const def = normalizeQuestionRows(readQuestionCsv(csv.replace("choice,Yes", "multi_choice,Yes").replace(",1,2,", ",1|2,2,")), "Quiz"); expect(def.fields[0].quiz?.correctOptionIds).toEqual(["o_1", "o_2"]);
  });
  it("reads actual XLSX bytes produced by existing export writer", async () => {
    const rows = readQuestionCsv(csv); const read = await readQuestionXlsx(buildXlsx(rows, "Questions")); expect(read).toEqual(rows);
    expect(normalizeQuestionRows(read, "Quiz").fields).toHaveLength(1);
    await expect(readQuestionXlsx(new Uint8Array([1, 2]))).rejects.toThrow(QuestionImportError);
  });
  it("reads compressed XLSX and rejects formula cells", async () => {
    const zip = (xml: string) => {
      const name = new TextEncoder().encode("xl/worksheets/sheet1.xml"), raw = new TextEncoder().encode(xml), compressed = deflateRawSync(raw);
      const bytes = new Uint8Array(30 + name.length + compressed.length + 46 + name.length + 22); const v = new DataView(bytes.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(8, 8, true); v.setUint32(18, compressed.length, true); v.setUint32(22, raw.length, true); v.setUint16(26, name.length, true); bytes.set(name, 30); bytes.set(compressed, 30 + name.length);
      const c = 30 + name.length + compressed.length; v.setUint32(c, 0x02014b50, true); v.setUint16(c + 10, 8, true); v.setUint32(c + 20, compressed.length, true); v.setUint32(c + 24, raw.length, true); v.setUint16(c + 28, name.length, true); bytes.set(name, c + 46);
      const e = c + 46 + name.length; v.setUint32(e, 0x06054b50, true); v.setUint16(e + 8, 1, true); v.setUint16(e + 10, 1, true); v.setUint32(e + 16, c, true); return bytes;
    };
    expect(await readQuestionXlsx(zip('<worksheet><c r="A1" t="inlineStr"><is><t>question</t></is></c></worksheet>'))).toEqual([["question"]]);
    await expect(readQuestionXlsx(zip('<worksheet><c r="C2"><f>1+1</f><v>2</v></c></worksheet>'))).rejects.toMatchObject({ problems: [{ row: 2, column: "C", message: expect.stringContaining("Formula") }] });
  });
  it("creates only draft normal forms, rejects unauthorized/stale writes, rolls back invalid imports", async () => {
    const t = convexTest(schema, modules); const owner = t.withIdentity({ subject: "import-owner", issuer: "https://clerk.test" });
    await t.run(async ctx => { await ctx.db.insert("users", { clerkId: "import-owner", name: "Importer", email: "import@example.test", username: "importer", plan: "pro", createdAt: 0 }); });
    const args = { title: "Quiz", input: { format: "csv" as const, text: csv } };
    await expect(t.mutation(ref, args)).rejects.toThrow();
    await expect(owner.mutation(ref, { ...args, input: { format: "csv", text: csv + '\nBad,choice,A,B,9,1,' } })).rejects.toThrow("QUESTION_IMPORT_INVALID");
    await t.run(async ctx => { expect(await ctx.db.query("forms").take(1)).toEqual([]); expect(await ctx.db.query("formAggregates").take(1)).toEqual([]); });
    const result = await owner.mutation(ref, args);
    await t.run(async ctx => { const form = await ctx.db.get("forms", result.formId); expect(form).toMatchObject({ status: "draft", draftRevision: 1, responseCount: 0, draft: { quiz: { enabled: true } } }); expect(form?.publishedVersion).toBeUndefined(); });
    await expect(t.withIdentity({ subject: "other", issuer: "https://clerk.test" }).mutation(ref, { ...args, formId: result.formId, expectedRevision: 1 })).rejects.toThrow("FORM_NOT_FOUND");
    await expect(owner.mutation(ref, { ...args, formId: result.formId, expectedRevision: 0 })).rejects.toThrow("REVISION_CONFLICT");
    await expect(owner.mutation(ref, { ...args, input: { format: "csv", text: csv + '\nBad,choice,A,B,9,1,' }, formId: result.formId, expectedRevision: 1 })).rejects.toThrow("QUESTION_IMPORT_INVALID");
    await t.run(async ctx => { expect((await ctx.db.get("forms", result.formId))?.draftRevision).toBe(1); });
    expect((await owner.mutation(ref, { ...args, formId: result.formId, expectedRevision: 1 })).revision).toBe(2);
    const xlsx = buildXlsx(readQuestionCsv(csv)); expect((await owner.mutation(ref, { title: "XLSX", input: { format: "xlsx", bytes: xlsx.buffer } })).questionCount).toBe(1);
  });
});
