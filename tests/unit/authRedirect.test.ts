import { describe, expect, it } from "vitest";
import { safeAuthReturn } from "../../lib/auth/redirect";

describe("auth return paths", () => {
  it.each(["https://attacker.test", "//attacker.test", "/\\attacker.test", "/\nattacker", undefined])("rejects unsafe redirect %s", (value) => {
    expect(safeAuthReturn(value)).toBe("/dashboard");
  });
  it("preserves a local form receipt or workspace destination", () => {
    expect(safeAuthReturn("/creator/quiz?resume=capability#question")).toBe("/creator/quiz?resume=capability#question");
  });
});
