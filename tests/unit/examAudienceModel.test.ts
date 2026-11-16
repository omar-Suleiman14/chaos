import { expect, it } from "vitest";
import { validateExamAudience } from "../../convex/examAudienceModel";
import type { Id } from "../../convex/_generated/dataModel";

it("requires one unambiguous course-scoped audience and bounded unique selections", () => {
  expect(validateExamAudience({ mode: "all", studentIds: [], groupIds: [] }).mode).toBe("all");
  expect(() => validateExamAudience({
    mode: "all", studentIds: ["student"], groupIds: [],
  })).toThrow("VALIDATION_FAILED");
  expect(() => validateExamAudience({
    mode: "students", studentIds: [], groupIds: [],
  })).toThrow("VALIDATION_FAILED");
  expect(() => validateExamAudience({
    mode: "students", studentIds: ["student", "student"], groupIds: [],
  })).toThrow("VALIDATION_FAILED");
  expect(() => validateExamAudience({
    mode: "groups", studentIds: ["student"], groupIds: ["group" as Id<"courseGroups">],
  })).toThrow("VALIDATION_FAILED");
  expect(() => validateExamAudience({
    mode: "students", studentIds: Array.from({ length: 101 }, (_, n) => String(n)),
    groupIds: [],
  })).toThrow("VALIDATION_FAILED");
});
