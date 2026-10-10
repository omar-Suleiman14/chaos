import { describe, expect, it } from "vitest";
import { responsePreview } from "../../convex/formResultPreview";
import type { FormDefinition, Answers } from "../../convex/formLogic";

const definition = { fields: [
  { id: "a", type: "text", label: "Name" },
  { id: "upload", type: "file", label: "Private upload" },
  { id: "b", type: "text", label: "Note" },
  { id: "c", type: "text", label: "Third" },
  { id: "d", type: "text", label: "Not in preview" },
] } as unknown as FormDefinition;

describe("responsePreview", () => {
  it("returns an empty preview without a definition", () => {
    expect(responsePreview(null, {} as Answers)).toBe("");
  });
  it("ignores upload fields and limits output to three answerable values", () => {
    const answers = { a: "One", upload: "secret-file", b: "Two", c: "Three", d: "Four" } as unknown as Answers;
    expect(responsePreview(definition, answers)).toBe("One · Two · Three");
  });
  it("caps text at 200 characters", () => {
    expect(responsePreview(definition, { a: "X".repeat(250) } as unknown as Answers)).toHaveLength(200);
  });
});
