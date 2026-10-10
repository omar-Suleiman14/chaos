import { describe, expect, it } from "vitest";
import { answerText, isEmptyAnswer } from "../../convex/formLogic";
import type { FormField } from "../../convex/formLogic";

const field = (type: FormField["type"]) => ({ id: "field", label: "Fixture", type, options: [{ id: "x", label: "Choice X" }, { id: "y", label: "Choice Y" }] }) as FormField;

describe("shared form answer formatting", () => {
  it("preserves blank semantics for partial and invalid numeric answers", () => {
    expect(isEmptyAnswer(undefined)).toBe(true);
    expect(isEmptyAnswer("  ")).toBe(true);
    expect(isEmptyAnswer(Number.NaN)).toBe(true);
    expect(isEmptyAnswer([])).toBe(true);
    expect(isEmptyAnswer("0")).toBe(false);
  });
  it("renders option labels in choice, multi-choice and ranking answers", () => {
    expect(answerText(field("choice"), "x")).toBe("Choice X");
    expect(answerText(field("multi_choice"), ["x", "y"])).toBe("Choice X, Choice Y");
    expect(answerText(field("ranking"), ["y", "x"])).toBe("1. Choice Y; 2. Choice X");
  });
  it("keeps file values count-only and suppresses empty values", () => {
    expect(answerText(field("file"), ["storage1", "storage2"])).toBe("2 files");
    expect(answerText(field("text"), " ")).toBe("");
  });
});
