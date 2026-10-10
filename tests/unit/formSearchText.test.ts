import { describe, expect, it } from "vitest";
import { blankField, emptyDefinition } from "../../convex/formLogic";
import { searchText } from "../../convex/formSearchText";

describe("form creator search text", () => {
  it("includes descriptions, field labels and placeholders", () => {
    const def = emptyDefinition("My survey");
    def.description = "A creator description";
    const field = blankField("text");
    field.label = "Patient full name";
    field.placeholder = "Your full name";
    def.fields.push(field);
    expect(searchText(def)).toContain("A creator description");
    expect(searchText(def)).toContain("Patient full name");
    expect(searchText(def)).toContain("Your full name");
  });

  it("bounds indexed text to the same 20,000 characters", () => {
    const def = emptyDefinition("Length");
    def.description = "a".repeat(50_000);
    expect(searchText(def).length).toBe(20_000);
  });

  it("does not index the form title or blank values", () => {
    const def = emptyDefinition("Title that is not in the search blob");
    def.description = "";
    expect(searchText(def)).toBe("");
  });
});
