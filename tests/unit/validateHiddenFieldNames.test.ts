import { describe, expect, it } from "vitest";
import { HIDDEN_FIELD_LIMITS } from "../../convex/formRespondent";
import { validateHiddenFieldNames } from "../../lib/forms/validateHiddenFieldNames";

describe("builder hidden field validation", () => {
  it("accepts empty and distinct declared fields", () => {
    expect(validateHiddenFieldNames([])).toBeNull();
    expect(validateHiddenFieldNames(["source", "campaign"])).toBeNull();
  });
  it("rejects case-insensitive duplicates and returns the repeated name", () => {
    expect(validateHiddenFieldNames(["Source", "source"])).toEqual({ kind: "duplicate", name: "source" });
  });
  it("checks length before any individual field errors", () => {
    expect(validateHiddenFieldNames(Array(HIDDEN_FIELD_LIMITS.count + 1).fill("source"))).toEqual({ kind: "too-many" });
  });
});
