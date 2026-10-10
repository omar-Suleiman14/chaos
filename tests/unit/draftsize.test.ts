import { describe, expect, it } from "vitest";
import { assertDraftSize } from "@/convex/formDraftSize";
import { emptyDefinition } from "@/convex/formLogic";
type Draft = Parameters<typeof assertDraftSize>[0];
describe("form draft admission", () => {
  it("accepts an ordinary draft", () => {
    expect(() => assertDraftSize(emptyDefinition("Example") as Draft)).not.toThrow();
  });
  it("rejects incompatible schema versions before any size checks", () => {
    expect(() => assertDraftSize({ ...emptyDefinition("Form"), schemaVersion: 2 } as Draft)).toThrow("UNSUPPORTED_SCHEMA");
  });
  it("preserves duplicate-language and title limit errors", () => {
    expect(() => assertDraftSize({ ...emptyDefinition("Form"), languages: ["en", "en"] } as Draft)).toThrow("Choose each language once");
    expect(() => assertDraftSize({ ...emptyDefinition("x".repeat(1000)) } as Draft)).toThrow("The title is too long");
  });
});
