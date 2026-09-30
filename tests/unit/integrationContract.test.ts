import { describe, expect, it } from "vitest";
import { fromFormDefinition, parseDraftBody, suppressBuckets, toFormDefinition, toQuizQuestions } from "@/convex/integrationContract";

describe("integration contract", () => {
  it("validates draft bodies", () => {
    expect("errors" in parseDraftBody({ kind: "form", title: "", fields: [] })).toBe(true);
    const bad = parseDraftBody({ kind: "form", title: "T", fields: [{ id: "1bad", type: "nope", label: "x" }] });
    expect("errors" in bad && bad.errors.length).toBe(2);
    expect("errors" in parseDraftBody({ kind: "form", title: "T", fields: [{ id: "q", type: "text", label: "x", points: 3 }] })).toBe(true);
    const ok = parseDraftBody({ kind: "quiz", title: "Quiz", fields: [{ id: "q1", type: "mcq", label: "2+2?", options: ["3", "4"], correctAnswer: "4" }] });
    expect("body" in ok).toBe(true);
  });

  it("keeps option ids, logic and translations across updates", () => {
    const first = toFormDefinition({ kind: "form", title: "T", description: "", fields: [{ id: "q1", type: "choice", label: "Pick", options: ["A", "B"] }] }).definition;
    first.fields[0].translations = { ar: { label: "اختر" } };
    const optionA = first.fields[0].options![0].id;
    const next = toFormDefinition({ kind: "form", title: "T2", description: "", fields: [{ id: "q1", type: "choice", label: "Pick one", options: ["B", "A", "C"] }] }, first);
    const field = next.definition.fields[0];
    expect(field.options!.find((o) => o.label === "A")!.id).toBe(optionA);
    expect(field.translations?.ar?.label).toBe("اختر");
    expect(next.definition.title).toBe("T2");
  });

  it("warns about quiz questions without answer keys", () => {
    const body = parseDraftBody({ kind: "quiz", title: "Q", fields: [{ id: "a", type: "mcq", label: "x", options: ["1", "2"] }, { id: "b", type: "true_false", label: "y", correctAnswer: "TRUE" }] });
    if (!("body" in body)) throw new Error("expected body");
    const { questions, warnings } = toQuizQuestions(body.body, 10);
    expect(questions[1].correctAnswer).toBe("True");
    expect(warnings).toEqual(["Question 1 has no valid answer key yet."]);
  });

  it("reports features dropped from definitions and suppresses small buckets", () => {
    const def = toFormDefinition({ kind: "form", title: "T", description: "", fields: [{ id: "q1", type: "text", label: "Name" }] }).definition;
    def.fields[0].showIf = { match: "all", conditions: [] };
    expect(fromFormDefinition(def).dropped).toContain("branching logic");
    expect(suppressBuckets([{ option: "A", count: 7 }, { option: "B", count: 2 }, { option: "C", count: 0 }], 5)).toEqual([
      { option: "A", count: 7 }, { option: "Other (fewer than 5)", count: null },
    ]);
  });
});
