import { describe, expect, it } from "vitest";
import { answerError, checkAnswers, checkDefinition, emptyDefinition, isOnStep, parseNumberInput } from "@/convex/formLogic";
import type { FormField } from "@/convex/formLogic";

const field = (patch: Partial<FormField> & Pick<FormField, "type">): FormField => ({ id: "q1", label: "Q", required: false, ...patch });

describe("number field", () => {
  it("rejects non-finite and non-numeric values without coercing to zero", () => {
    const f = field({ type: "number" });
    expect(answerError(f, Number.NaN)).toBe("Enter a number.");
    expect(answerError(f, Number.POSITIVE_INFINITY)).toBe("Enter a number.");
    expect(answerError(f, "abc")).toBe("Enter a number.");
    expect(answerError(f, "")).toBe("Enter a number.");
    expect(answerError(f, 0)).toBeNull();
  });

  it("enforces minimum and maximum", () => {
    const f = field({ type: "number", min: 1, max: 10 });
    expect(answerError(f, 0)).toBe("Enter 1 or more.");
    expect(answerError(f, 11)).toBe("Enter 10 or less.");
    expect(answerError(f, 1)).toBeNull();
    expect(answerError(f, 10)).toBeNull();
  });

  it("enforces whole numbers only", () => {
    const f = field({ type: "number", integer: true });
    expect(answerError(f, 2.5)).toBe("Enter a whole number.");
    expect(answerError(f, -3)).toBeNull();
  });

  it("enforces the step from the minimum, without floating-point surprises", () => {
    const tenths = field({ type: "number", step: 0.1 });
    expect(answerError(tenths, 0.3)).toBeNull();
    expect(answerError(tenths, 0.25)).toBe("Enter a multiple of 0.1.");
    const fromFive = field({ type: "number", min: 5, step: 5 });
    expect(answerError(fromFive, 15)).toBeNull();
    expect(answerError(fromFive, 12)).toBe("Enter 5 plus a multiple of 5.");
    expect(isOnStep(1.1, 0.1)).toBe(true);
    expect(isOnStep(1e-7, 1e-7)).toBe(true);
  });

  it("stores decimals exactly as entered", () => {
    const def = emptyDefinition("t");
    def.fields = [field({ type: "number", step: 0.01 })];
    const { answers, errors } = checkAnswers(def, { q1: 1234.56 });
    expect(errors).toEqual({});
    expect(answers.q1).toBe(1234.56);
  });

  it("an empty optional field stores nothing, not zero", () => {
    const def = emptyDefinition("t");
    def.fields = [field({ type: "number" })];
    const { answers, errors } = checkAnswers(def, {});
    expect(errors).toEqual({});
    expect("q1" in answers).toBe(false);
  });

  it("parses typed text the same way in every language", () => {
    expect(parseNumberInput("")).toBeUndefined();
    expect(parseNumberInput("  ")).toBeUndefined();
    expect(parseNumberInput("12.5")).toBe(12.5);
    expect(parseNumberInput("12,5")).toBe(12.5);
    expect(parseNumberInput("١٢٫٥")).toBe(12.5);
    expect(parseNumberInput("۱۲")).toBe(12);
    expect(parseNumberInput("-4")).toBe(-4);
    expect(parseNumberInput("1e3")).toBe(1000);
    expect(parseNumberInput("abc")).toBeNull();
    expect(parseNumberInput("1,234,5")).toBeNull();
    expect(parseNumberInput("1..2")).toBeNull();
    expect(parseNumberInput("Infinity")).toBeNull();
    expect(parseNumberInput("1e999")).toBeNull();
  });

  it("validates authored settings", () => {
    const def = emptyDefinition("t");
    def.fields = [field({ type: "number", step: 0 })];
    expect(checkDefinition(def).errors.join(" ")).toMatch(/step must be greater than 0/);
    def.fields = [field({ type: "number", integer: true, step: 0.5 })];
    expect(checkDefinition(def).errors.join(" ")).toMatch(/whole-number/);
    def.fields = [field({ type: "number", min: 5, max: 1 })];
    expect(checkDefinition(def).errors.join(" ")).toMatch(/minimum is greater than maximum/);
  });
});

describe("date and time fields", () => {
  it("validates the shape and rejects impossible dates", () => {
    const f = field({ type: "date" });
    expect(answerError(f, "2026-02-28")).toBeNull();
    expect(answerError(f, "2026-02-30")).toBe("Enter a valid date.");
    expect(answerError(f, "28/02/2026")).toBe("Enter a valid date.");
  });

  it("enforces earliest and latest dates as plain text, with no time zone conversion", () => {
    const f = field({ type: "date", minValue: "2026-01-01", maxValue: "2026-12-31" });
    expect(answerError(f, "2025-12-31")).toBe("Choose 2026-01-01 or later.");
    expect(answerError(f, "2027-01-01")).toBe("Choose 2026-12-31 or earlier.");
    expect(answerError(f, "2026-01-01")).toBeNull();
    expect(answerError(f, "2026-12-31")).toBeNull();
  });

  it("enforces earliest and latest times", () => {
    const f = field({ type: "time", minValue: "09:00", maxValue: "17:30" });
    expect(answerError(f, "08:59")).toBe("Choose 09:00 or later.");
    expect(answerError(f, "17:31")).toBe("Choose 17:30 or earlier.");
    expect(answerError(f, "09:00")).toBeNull();
    expect(answerError(f, "24:00")).toBe("Enter a valid time.");
    expect(answerError(f, "9:00")).toBe("Enter a valid time.");
  });

  it("stores exactly what was picked", () => {
    const def = emptyDefinition("t");
    def.fields = [field({ id: "d", type: "date" }), field({ id: "t", type: "time" })];
    const { answers } = checkAnswers(def, { d: "2026-03-08", t: "02:30" });
    expect(answers).toEqual({ d: "2026-03-08", t: "02:30" });
  });

  it("validates authored bounds", () => {
    const def = emptyDefinition("t");
    def.fields = [field({ type: "date", minValue: "2026-13-01" })];
    expect(checkDefinition(def).errors.join(" ")).toMatch(/earliest date is not valid/);
    def.fields = [field({ type: "date", minValue: "2026-05-01", maxValue: "2026-04-01" })];
    expect(checkDefinition(def).errors.join(" ")).toMatch(/earliest date is after the latest/);
    def.fields = [field({ type: "time", minValue: "18:00", maxValue: "09:00" })];
    expect(checkDefinition(def).errors.join(" ")).toMatch(/earliest time is after the latest/);
  });
});

describe("rating and scale fields", () => {
  it("an optional rating can be cleared: an empty answer is accepted", () => {
    const def = emptyDefinition("t");
    def.fields = [field({ type: "rating", max: 5 })];
    expect(checkAnswers(def, { q1: 4 }).answers.q1).toBe(4);
    const cleared = checkAnswers(def, {});
    expect(cleared.errors).toEqual({});
    expect("q1" in cleared.answers).toBe(false);
  });

  it("a required rating cannot be left empty", () => {
    const def = emptyDefinition("t");
    def.fields = [field({ type: "rating", required: true })];
    expect(checkAnswers(def, {}).errors.q1).toBe("This question is required.");
  });

  it("stores the numeric rating and rejects out-of-range values", () => {
    const f = field({ type: "rating", max: 5 });
    expect(answerError(f, 0)).toBe("Choose a rating.");
    expect(answerError(f, 6)).toBe("Choose a rating.");
    expect(answerError(f, 2.5)).toBe("Choose a rating.");
    expect(answerError(f, 5)).toBeNull();
  });

  it("scale respects range and step", () => {
    const f = field({ type: "scale", min: 0, max: 10, step: 5, minLabel: "Never", maxLabel: "Always" });
    expect(answerError(f, 5)).toBeNull();
    expect(answerError(f, 10)).toBeNull();
    expect(answerError(f, 3)).toBe("Choose a value on the scale.");
    expect(answerError(f, 11)).toBe("Choose a value on the scale.");
    expect(answerError(field({ type: "scale", min: 1, max: 5 }), 0)).toBe("Choose a value on the scale.");
  });

  it("validates the authored scale step", () => {
    const def = emptyDefinition("t");
    def.fields = [field({ type: "scale", min: 1, max: 5, step: 0 })];
    expect(checkDefinition(def).errors.join(" ")).toMatch(/scale step/);
  });
});

describe("email field", () => {
  it("checks the shape only", () => {
    const f = field({ type: "email" });
    expect(answerError(f, "a@b.co")).toBeNull();
    expect(answerError(f, "not an email")).toBe("Enter a valid email address.");
  });
});
