import { describe, expect, it } from "vitest";
import {
  aggregateDelta, checkAnswers, checkDefinition, csvCell, emptyDefinition, explainVisibility, localizeField,
  missingTranslations, pipeText, publicSummary, selectEnding, suppressSmallBuckets, visibleFieldIds,
} from "@/convex/formLogic";
import type { FormDefinition } from "@/convex/formLogic";

function form(): FormDefinition {
  const def = emptyDefinition("Survey");
  def.languages = ["en", "ar"];
  def.fields = [
    { id: "role", type: "choice", label: "Role", required: true, options: [{ id: "student", label: "Student", score: 1 }, { id: "staff", label: "Staff", score: 3 }] },
    { id: "s1", type: "section", label: "Students", required: false, showIf: { match: "all", conditions: [{ fieldId: "role", op: "equals", value: "student" }] } },
    { id: "year", type: "number", label: "Year", required: true, min: 1, max: 6 },
    { id: "s2", type: "section", label: "Everyone", required: false },
    { id: "name", type: "text", label: "Name", required: false, translations: { ar: { label: "الاسم" } } },
  ];
  def.endings = [
    { id: "high", title: "High", message: "Score {{score}}", showIf: { match: "all", conditions: [{ fieldId: "calc:score", op: "gte", value: 3 }] } },
    { id: "default", title: "Thanks {{name}}", message: "" },
  ];
  return def;
}

describe("branching", () => {
  it("hides a section's fields when the section is hidden", () => {
    const def = form();
    expect([...visibleFieldIds(def, { role: "staff" })]).toEqual(["role", "s2", "name"]);
    expect(visibleFieldIds(def, { role: "student" }).has("year")).toBe(true);
    const why = explainVisibility(def, { role: "staff" }).find((x) => x.fieldId === "year");
    expect(why?.reason).toMatch(/section “Students” is hidden/);
  });

  it("drops hidden answers and requires only visible questions", () => {
    const def = form();
    const staff = checkAnswers(def, { role: "staff", year: 3 });
    expect(staff.errors).toEqual({});
    expect(staff.answers).toEqual({ role: "staff" });
    expect(checkAnswers(def, { role: "student" }).errors.year).toMatch(/required/);
    expect(checkAnswers(def, { role: "student", year: 9 }).errors.year).toMatch(/6 or less/);
    expect(checkAnswers(def, { role: "nobody" }).errors.role).toBeDefined();
  });

  it("selects endings by calculated score and pipes answers", () => {
    const def = form();
    expect(selectEnding(def, { role: "staff" })?.id).toBe("high");
    expect(selectEnding(def, { role: "student", year: 2 })?.id).toBe("default");
    expect(pipeText("Score {{score}}", def, { role: "staff" }, "en")).toBe("Score 3");
    expect(pipeText("Thanks {{name}}", def, { role: "staff", name: "Mona" }, "en")).toBe("Thanks Mona");
  });
});

describe("publication checks", () => {
  it("reports references to later questions and impossible rules", () => {
    const def = form();
    def.fields[0] = { ...def.fields[0], showIf: { match: "all", conditions: [{ fieldId: "name", op: "answered" }] } };
    expect(checkDefinition(def).errors.join(" ")).toMatch(/comes later/);

    const impossible = form();
    impossible.fields[4] = { ...impossible.fields[4], showIf: { match: "all", conditions: [
      { fieldId: "role", op: "equals", value: "student" }, { fieldId: "role", op: "equals", value: "staff" },
    ] } };
    expect(checkDefinition(impossible).errors.join(" ")).toMatch(/can never be shown/);
  });

  it("treats missing translations as warnings with fallback", () => {
    const def = form();
    expect(checkDefinition(def).errors).toEqual([]);
    expect(missingTranslations(def).ar.length).toBeGreaterThan(0);
    expect(localizeField(def.fields[4], "ar", def).label).toBe("الاسم");
    expect(localizeField(def.fields[2], "ar", def).label).toBe("Year");
  });
});

describe("aggregates and privacy", () => {
  it("suppresses small groups and never exposes free text", () => {
    const def = form();
    let agg = {};
    for (let i = 0; i < 6; i++) agg = aggregateDelta(def, { role: "student", year: 2, name: `Person ${i}` }, 1, agg);
    agg = aggregateDelta(def, { role: "staff", name: "Secret" }, 1, agg);
    const summary = publicSummary(def, agg, 7);
    const role = summary.questions.find((q) => q.fieldId === "role")!;
    // 7 answered = 6 Student + 1 Staff. Showing "Student: 6" would reveal Staff = 1 by subtraction,
    // so the only other bucket is merged into "Other" as well.
    expect(role.answeredCount).toBe(7);
    expect(role.distribution).toEqual([{ option: "Other (fewer than 5)", count: null }]);
    expect(JSON.stringify(summary)).not.toContain("Person");
    expect(publicSummary(def, agg, 4).suppressed).toBe(true);
  });

  it("never leaves a single hidden bucket that subtraction would reveal", () => {
    const b = (option: string, count: number) => ({ option, count });
    // One small bucket: the smallest shown bucket is merged with it.
    expect(suppressSmallBuckets([b("A", 20), b("B", 9), b("C", 1)], 5)).toEqual([b("A", 20), { option: "Other (fewer than 5)", count: null }]);
    // A zero bucket is merged when it is the smallest, which still leaves two unknowns.
    expect(suppressSmallBuckets([b("A", 7), b("B", 2), b("C", 0)], 5)).toEqual([b("A", 7), { option: "Other (fewer than 5)", count: null }]);
    // Two or more small buckets already hide each other.
    expect(suppressSmallBuckets([b("A", 9), b("B", 2), b("C", 1)], 5)).toEqual([b("A", 9), { option: "Other (fewer than 5)", count: null }]);
    // Nothing small: nothing hidden.
    expect(suppressSmallBuckets([b("A", 9), b("B", 5), b("C", 0)], 5)).toEqual([b("A", 9), b("B", 5), b("C", 0)]);
    // Whatever is shown, no hidden bucket is the only unknown.
    for (const buckets of [[b("A", 6), b("B", 1)], [b("A", 30), b("B", 30), b("C", 4)], [b("A", 5), b("B", 0), b("C", 3), b("D", 0)]]) {
      const shown = suppressSmallBuckets(buckets, 5);
      const hiddenCount = buckets.length - shown.filter((x) => x.count !== null).length;
      expect(hiddenCount === 0 || hiddenCount >= 2).toBe(true);
    }
  });

  it("neutralises spreadsheet formulas in CSV", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell('say "hi"')).toBe(`"say ""hi"""`);
    expect(csvCell(3)).toBe(`"3"`);
  });
});
