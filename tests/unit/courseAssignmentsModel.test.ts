import { expect, it } from "vitest";
import { assignmentState, validateAssignment } from "../../convex/courseAssignmentsModel";

const valid = { title: "   مراجعة تشريح ", instructions: "Read lecture", outcome: "Brain stem 1",
  opensAt: 2000, dueAt: 3000 };
it("validates bilingual assignment metadata and strict deadlines", () => {
  expect(validateAssignment(valid).title).toBe("مراجعة تشريح");
  expect(validateAssignment({ ...valid, outcome: "الجهاز العصبي" }).outcome).toBe("الجهاز العصبي");
  expect(() => validateAssignment({ ...valid, dueAt: 2000 })).toThrow("INVALID_DEADLINE");
  expect(() => validateAssignment({ ...valid, opensAt: Number.NaN })).toThrow("INVALID_DEADLINE");
  expect(() => validateAssignment({ ...valid, title: "" })).toThrow("INVALID_ASSIGNMENT");
  expect(() => validateAssignment({ ...valid, outcome: "<script>" })).toThrow("INVALID_ASSIGNMENT");
});
it("classifies upcoming, missed, late and completed work using server timestamps", () => {
  expect(assignmentState(1000, 2000, 3000, null)).toBe("upcoming");
  expect(assignmentState(2500, 2000, 3000, null)).toBe("due");
  expect(assignmentState(3001, 2000, 3000, null)).toBe("missed");
  expect(assignmentState(5000, 2000, 3000, 2900)).toBe("completed");
  expect(assignmentState(5000, 2000, 3000, 3100)).toBe("completed_late");
});
