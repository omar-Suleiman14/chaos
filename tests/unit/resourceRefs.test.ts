import { describe, expect, it } from "vitest";
import { parseResourceRef } from "../../convex/resourceRefs";

describe("connector resource reference parsing", () => {
  it("accepts only matching typed references", () => {
    for (const kind of ["form", "quiz", "lesson", "collection", "source"] as const) {
      expect(parseResourceRef(`${kind}_abc123`, kind)).toBe("abc123");
      expect(parseResourceRef(`${kind}_abc123`, "form" === kind ? "source" : "form")).toBeNull();
    }
  });
  it("rejects bare, malformed, mismatched and suffix-extended ids", () => {
    for (const ref of ["abc123", "", "form_", "form_ab-c", "form_abc/other", "Form_abc", "form_abc ", "form_abc_more", "legacy_abc"]) {
      expect(parseResourceRef(ref, "form")).toBeNull();
    }
  });
});
