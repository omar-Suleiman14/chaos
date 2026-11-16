import { describe, expect, it } from "vitest";
import {
  gradeFrozenExam, validateExamMarking, validateExamRubric,
  type FrozenGradingQuestion, type FrozenGradingAnswer,
} from "../../convex/examGradingModel";

const q = (overrides: Partial<FrozenGradingQuestion> = {}): FrozenGradingQuestion => ({
  kind: "multiple_choice",
  choices: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
  correctChoiceIds: ["a", "b"],
  points: 2,
  ...overrides,
});
const a = (choiceIds: string[], questionIndex = 0): FrozenGradingAnswer =>
  ({ questionIndex, choiceIds, text: "" });

describe("deterministic, private exam scoring", () => {
  it("is order-independent for exact multiple choice and uses integer cents", () => {
    const first = gradeFrozenExam([q()], [a(["b", "a"])]);
    const second = gradeFrozenExam([q()], [a(["a", "b"])]);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      state: "auto_final", earnedCents: 200, maximumCents: 200,
      objectiveMaximumCents: 200, finalPercentBasisPoints: 10_000,
    });
  });

  it("awards proportional multi-select credit and cancels it for wrong selections", () => {
    const question = q({ marking: { mode: "partial", incorrectPenalty: 0.25, blankPenalty: 0 } });
    expect(gradeFrozenExam([question], [a(["a"])]).earnedCents).toBe(100);
    expect(gradeFrozenExam([question], [a(["a", "c"])]).earnedCents).toBe(0);
    expect(gradeFrozenExam([question], [a(["c"])]).earnedCents).toBe(-25);
  });

  it("supports separately configured incorrect and blank penalties, including true/false", () => {
    const tf = q({
      kind: "true_false", choices: [], correctChoiceIds: ["true"], points: 1,
      marking: { mode: "exact", incorrectPenalty: 0.5, blankPenalty: 0.2 },
    });
    expect(gradeFrozenExam([tf], [a(["true"])]).earnedCents).toBe(100);
    expect(gradeFrozenExam([tf], [a(["false"])]).earnedCents).toBe(-50);
    expect(gradeFrozenExam([tf], []).earnedCents).toBe(-20);
    expect(gradeFrozenExam([tf], [a([])]).earnedCents).toBe(-20);
  });

  it("does not auto-grade nonempty written responses, keeps rubrics as metadata", () => {
    const written = q({
      kind: "written", choices: [], correctChoiceIds: [], points: 3.5,
      rubricCriteria: [
        { id: "reason", description: "Reasoning", weightPercent: 60 },
        { id: "steps", description: "Steps", weightPercent: 40 },
      ],
    });
    const result = gradeFrozenExam([q(), written], [
      a(["a", "b"]), { questionIndex: 1, choiceIds: [], text: "Reasoned answer" },
    ]);
    expect(result).toMatchObject({
      state: "needs_manual", earnedCents: 200, objectiveMaximumCents: 200,
      maximumCents: 550, pendingWrittenCount: 1,
    });
    expect(result.finalPercentBasisPoints).toBeUndefined();
    expect(result.entries[1]).toMatchObject({ status: "needs_manual", pointsAwardedCents: 0 });
    expect(gradeFrozenExam([written], []).state).toBe("auto_final");
  });

  it("rejects unbounded penalties and malformed private rubric metadata", () => {
    expect(() => validateExamMarking({
      mode: "exact", incorrectPenalty: 2.01, blankPenalty: 0,
    }, 2)).toThrow("INVALID_GRADING");
    expect(() => validateExamMarking({
      mode: "partial", incorrectPenalty: 0.005, blankPenalty: 0,
    }, 2)).toThrow("INVALID_GRADING");
    expect(() => validateExamRubric([
      { id: "a", description: "A", weightPercent: 90 },
    ], "written")).toThrow("INVALID_RUBRIC");
    expect(() => validateExamRubric([
      { id: "a", description: "A", weightPercent: 100 },
    ], "multiple_choice")).toThrow("INVALID_RUBRIC");
  });

  it("fails closed for duplicate, tampered, cross-snapshot, and malformed answers", () => {
    expect(() => gradeFrozenExam([q()], [a(["a"]), a(["a"])])).toThrow("INVALID_GRADING");
    expect(() => gradeFrozenExam([q(), q()], [a(["a"], 2)])).toThrow("INVALID_GRADING");
    expect(() => gradeFrozenExam([q()], [a(["tampered"])] )).toThrow("INVALID_GRADING");
    expect(() => gradeFrozenExam([q()], [a(["a", "a"])] )).toThrow("INVALID_GRADING");
    expect(() => gradeFrozenExam([q()], [{...a(["a"]), text:"not a choice answer"}])).toThrow("INVALID_GRADING");
  });

  it("rounds fractional credit to 0.01 without introducing floating-score drift", () => {
    const x = q({ points: 0.01, correctChoiceIds: ["a", "b", "c"],
      marking: { mode: "partial", incorrectPenalty: 0, blankPenalty: 0 } });
    expect(gradeFrozenExam([x], [a(["a", "b"])]).earnedCents).toBe(1);
    expect(gradeFrozenExam([x], [a(["d"])]).earnedCents).toBe(0);
  });
});
