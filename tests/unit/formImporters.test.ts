import { describe, expect, it } from "vitest";
import { importForm, parseQuestionText } from "@/lib/formImporters";
import { buildXlsx } from "@/lib/xlsx";

describe("form importers", () => {
  it("imports Google Forms API exports", () => {
    const result = importForm(JSON.stringify({
      formId: "abc",
      info: { title: "Club signup", description: "Join us" },
      items: [
        { itemId: "1", title: "Name", questionItem: { question: { required: true, textQuestion: {} } } },
        { itemId: "2", title: "Days", questionItem: { question: { choiceQuestion: { type: "CHECKBOX", options: [{ value: "Mon" }, { value: "Tue" }] } } } },
        { itemId: "3", title: "Part 2", pageBreakItem: {} },
        { itemId: "4", title: "Grid", questionGroupItem: { questions: [{ rowQuestion: { title: "Food" } }], grid: { columns: { options: [{ value: "Good" }, { value: "Bad" }] } } } },
      ],
    }));
    expect(result.source).toBe("google");
    expect(result.definition.title).toBe("Club signup");
    expect(result.definition.fields.map((f) => f.type)).toEqual(["text", "multi_choice", "section", "matrix"]);
    expect(result.definition.fields[0].required).toBe(true);
  });

  it("imports Typeform definitions and reports unsupported logic", () => {
    const result = importForm(JSON.stringify({
      title: "Feedback", type: "form", settings: {},
      fields: [
        { ref: "nps", title: "Recommend?", type: "nps", validations: { required: true } },
        { ref: "pick", title: "Pick", type: "multiple_choice", properties: { choices: [{ label: "A" }, { label: "B" }], allow_multiple_selection: true } },
      ],
      logic: [{ type: "field", ref: "nps", actions: [] }],
    }));
    expect(result.source).toBe("typeform");
    expect(result.definition.fields[0]).toMatchObject({ type: "scale", min: 0, max: 10, required: true });
    expect(result.definition.fields[1].type).toBe("multi_choice");
    expect(result.warnings.join(" ")).toMatch(/logic jumps were not imported/);
  });

  it("parses pasted questions (Microsoft Forms and documents)", () => {
    const result = parseQuestionText("# Lunch poll\n\nFavourite food? *\n- Pizza\n- Salad\n\nAllergies\n[ ] Nuts\n[ ] Dairy\n\nAny comments?");
    expect(result.definition.title).toBe("Lunch poll");
    expect(result.definition.fields.map((f) => [f.type, f.required])).toEqual([["choice", true], ["multi_choice", false], ["textarea", false]]);
  });

  it("rejects unknown JSON", () => {
    expect(() => importForm(JSON.stringify({ hello: "world" }))).toThrow(/recognises/);
  });
});

describe("xlsx writer", () => {
  it("produces a zip with a worksheet", () => {
    const bytes = buildXlsx([["Name", "Score"], ["=cmd", 3]]);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("xl/worksheets/sheet1.xml");
    expect(text).toContain('t="inlineStr"><is><t xml:space="preserve">=cmd</t>');
  });
});
