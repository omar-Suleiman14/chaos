import { describe, expect, it } from "vitest";
import { columnLabel } from "@/convex/formResultLabels";
import type { FormField } from "@/convex/formLogic";
const field = (props: Partial<FormField>): FormField => ({ id: "n", type: "scale", label: "How likely?", required: true, ...props } as FormField);
describe("form results column labels", () => {
  it("keeps ordinary labels unchanged", () => expect(columnLabel(field({ type: "text", label: "Email" }))).toBe("Email"));
  it("adds only configured scale endpoint labels", () => {
    expect(columnLabel(field({ min: 0, max: 10, minLabel: "Never", maxLabel: "Always" }))).toBe("How likely? (0 = Never; 10 = Always)");
    expect(columnLabel(field({ maxLabel: "Always" }))).toBe("How likely? (5 = Always)");
  });
  it("does not add endpoint decoration when both labels are empty", () => expect(columnLabel(field({ min: 1, max: 5 }))).toBe("How likely?"));
});
