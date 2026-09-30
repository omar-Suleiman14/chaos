import { describe, expect, it } from "vitest";
import { checkDefinition, describeRule, emptyDefinition, explainVisibility, newId, type FormDefinition, type FormField } from "@/convex/formLogic";
import { publicationErrors } from "@/convex/quizModel";
import { localizeActivityAction, localizeActivityDetail, localizeMessage } from "@/lib/messages";

const ARABIC = /[؀-ۿ]/;
const ar = (m: string) => localizeMessage("ar", m);

function field(over: Partial<FormField> & { id: string; type: FormField["type"] }): FormField {
  return { label: "", required: false, ...over } as FormField;
}

function brokenDefinition(): FormDefinition {
  const def = emptyDefinition("");
  def.description = "x".repeat(6000);
  def.theme = { ...def.theme, accent: "red", logoUrl: "http://x.test/a.png" };
  def.fields = [
    field({ id: "a", type: "choice", label: "Colour", options: [{ id: "o1", label: "Red" }, { id: "o2", label: "Red" }] }),
    field({ id: "b", type: "choice", label: "Size", options: [{ id: "o1", label: "" }] }),
    field({ id: "c", type: "matrix", label: "Rows", rows: [], options: [{ id: "p", label: "A" }, { id: "q", label: "B" }] }),
    field({ id: "d", type: "rating", label: "Stars", max: 20, min: 5 }),
    field({ id: "e", type: "text", label: "Later", showIf: { match: "all", conditions: [{ fieldId: "z", op: "equals", value: "1" }, { fieldId: "f", op: "equals", value: "1" }] } }),
    field({ id: "f", type: "text", label: "Name" }),
    field({ id: "g", type: "statement", label: "", required: true }),
    field({ id: "h", type: "file", label: "CV", max: 9 }),
  ];
  def.endings = [{ id: newId("e"), title: "", message: "", showIf: { match: "all", conditions: [{ fieldId: "a", op: "answered" }] } } as FormDefinition["endings"][number]];
  return def;
}

describe("localizeMessage", () => {
  it("returns English unchanged", () => {
    const def = brokenDefinition();
    const report = checkDefinition(def);
    for (const m of [...report.errors, ...report.warnings, "Something unknown."]) expect(localizeMessage("en", m)).toBe(m);
  });

  it("translates every checkDefinition message it produces", () => {
    const report = checkDefinition(brokenDefinition());
    const all = [...report.errors, ...report.warnings];
    expect(all.length).toBeGreaterThan(15);
    for (const m of all) {
      const out = ar(m);
      expect(out, m).not.toBe(m);
      expect(out, m).toMatch(ARABIC);
    }
  });

  it("keeps dynamic parts", () => {
    expect(ar("Field 2 (“Colour”): add at least 2 options.")).toBe("الحقل 2 (“Colour”): أضف خيارين على الأقل.");
    expect(ar("Field 3: use at most 50 rows.")).toContain("50");
    expect(ar("The title can have at most 200 characters.")).toContain("200");
    expect(ar("Ending 1: add a title or message.")).toContain("شاشة النهاية 1");
    expect(ar("Field 1 (“Later”): can never be shown because “Name” cannot equal two answers at once.")).toContain("“Name”");
  });

  it("translates describeRule and explainVisibility", () => {
    const def = emptyDefinition("T");
    def.fields = [
      field({ id: "a", type: "choice", label: "Colour", options: [{ id: "r", label: "Red" }, { id: "b", label: "Blue" }] }),
      field({ id: "n", type: "number", label: "Age" }),
      field({ id: "x", type: "text", label: "Why", showIf: { match: "any", conditions: [{ fieldId: "a", op: "equals", value: "r" }, { fieldId: "n", op: "gte", value: 18 }] } }),
    ];
    const rule = describeRule(def.fields[2].showIf!, def);
    expect(rule).toBe("“Colour” is “Red” or “Age” is at least “18”");
    const arRule = ar(rule);
    expect(arRule).toMatch(ARABIC);
    expect(arRule).toContain("“Red”");
    expect(arRule).toContain("“18”");
    expect(arRule).not.toContain(" is ");
    const reasons = explainVisibility(def, {}).map((e) => e.reason);
    expect(reasons[0]).toBe("Always shown.");
    expect(ar(reasons[0])).toMatch(ARABIC);
    const hidden = reasons[2];
    expect(hidden).toMatch(/^Hidden: requires /);
    expect(ar(hidden)).toContain("“Colour”");
    expect(ar(hidden)).toMatch(ARABIC);
    expect(ar("Hidden because section “Intro” is hidden.")).toContain("“Intro”");
  });

  it("translates quiz publication errors and editor problems", () => {
    const errors = publicationErrors("", [
      { type: "mcq", questionText: "", options: ["a", "a"], points: 0, order: 0, timeLimit: -1 },
      { type: "true_false", questionText: "q", points: 1, order: 1 },
      { type: "written", questionText: "q", keywords: [" "], points: 1, order: 2 },
      { type: "multi_select", questionText: "q", options: ["a", "b"], correctAnswers: [], points: 1, order: 3 },
    ]);
    expect(errors.length).toBeGreaterThanOrEqual(8);
    for (const m of errors) {
      const out = ar(m);
      expect(out, m).not.toBe(m);
      expect(out, m).toMatch(ARABIC);
    }
    expect(ar("Question 12: enter the question text.")).toBe("السؤال 12: أدخل نص السؤال.");
    expect(ar("Question 3: timer must be between 5 and 3600 seconds.")).toContain("3600");
    expect(ar("The question pool draws 9 questions but the quiz has 4.")).toMatch(/9.*4/);
    expect(ar("Passing threshold must be between 0 and 100.")).toMatch(ARABIC);
    expect(ar("A quiz can contain at most 200 questions.")).toContain("200");
  });

  it("translates server errors, including a publication-blocked list", () => {
    expect(ar("This form changed elsewhere. Reload first.")).toMatch(ARABIC);
    expect(ar("Too many requests. Try again in 7 seconds.")).toContain("7");
    expect(ar("Award between 0 and 5 marks.")).toContain("5");
    expect(ar("Free includes 5 forms or quizzes per calendar month (UTC). Contact khomod14@gmail.com for Pro.")).toContain("khomod14@gmail.com");
    expect(ar("DRAFT_CONFLICT: This quiz changed elsewhere. Reload before publishing.")).not.toContain("DRAFT_CONFLICT");
    const list = ar("\nEnter a form title.\nField 1: enter a label.");
    expect(list.split("\n")).toHaveLength(3);
    expect(list).toContain("الحقل 1");
  });

  it("translates activity entries and falls back for unknown text", () => {
    expect(localizeActivityAction("ar", "published")).toMatch(ARABIC);
    expect(localizeActivityDetail("ar", "Version 4")).toContain("4");
    expect(localizeActivityDetail("ar", "a@b.co as editor")).toContain("a@b.co");
    expect(localizeActivityDetail("ar", "3 responses")).toContain("3");
    expect(localizeActivityAction("en", "published")).toBe("published");
    expect(localizeActivityAction("ar", "brand new action")).toBe("brand new action");
    expect(ar("A message nobody wrote a template for.")).toBe("A message nobody wrote a template for.");
  });
});
