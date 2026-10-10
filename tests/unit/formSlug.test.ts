import { describe, expect, it } from "vitest";
import { slugify } from "../../lib/forms/formSlug";

describe("custom-link slugify", () => {
  it("trims, lowercases and collapses separator runs", () => {
    expect(slugify("  My Form -- 2026!  ")).toBe("my-form-2026");
  });

  it("retains the existing ASCII-only semantics", () => {
    expect(slugify("أهلا")).toBe("");
    expect(slugify("Café & Notes")).toBe("caf-notes");
  });

  it("limits the slug to 64 characters", () => {
    expect(slugify("A".repeat(100))).toBe("a".repeat(64));
  });
});
