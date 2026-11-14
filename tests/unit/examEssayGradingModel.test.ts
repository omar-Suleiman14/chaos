import { describe, expect, it } from "vitest";
import { calculateEssayAward, finalEssayGrade } from "../../convex/examEssayGradingModel";

const question = { kind: "written", points: 3.5,
  rubricCriteria: [
    { id: "reason", description: "Reasoning", weightPercent: 60 },
    { id: "proof", description: "Evidence", weightPercent: 40 },
  ] };
describe("rubric grading in hundredths of points", () => {
  it("uses frozen weight percentages and deterministic rounding", () => {
    expect(calculateEssayAward(question, [
      { criterionId: "reason", scorePercent: 80 },
      { criterionId: "proof", scorePercent: 50 },
    ])).toBe(238);
    expect(calculateEssayAward({ kind: "written", points: 0.01,
      rubricCriteria: [{ id: "one", description: "One", weightPercent: 100 }] },
      [{ criterionId: "one", scorePercent: 50 }])).toBe(1);
  });
  it("rejects incomplete, duplicate, malformed and inflated scores", () => {
    expect(() => calculateEssayAward(question, [{ criterionId: "reason", scorePercent: 100 }]))
      .toThrow("INVALID_MARK");
    expect(() => calculateEssayAward(question, [
      { criterionId: "reason", scorePercent: 100 }, { criterionId: "reason", scorePercent: 90 },
    ])).toThrow("INVALID_MARK");
    expect(() => calculateEssayAward(question, [
      { criterionId: "reason", scorePercent: 101 }, { criterionId: "proof", scorePercent: 50 },
    ])).toThrow("INVALID_MARK");
    expect(() => calculateEssayAward(question, [
      { criterionId: "reason", scorePercent: 80 }, { criterionId: "proof", scorePercent: 50 },
    ], 200)).toThrow("INVALID_MARK");
  });
  it("allows only bounded holistic cents without authored criteria", () => {
    const q = { kind: "written", points: 2 };
    expect(calculateEssayAward(q, [], 125)).toBe(125);
    expect(() => calculateEssayAward(q, [], 201)).toThrow("INVALID_MARK");
    expect(() => calculateEssayAward(q, [], 1.5)).toThrow("INVALID_MARK");
  });
  it("seals final marks only with every pending essay approved", () => {
    const grade = {
      state: "needs_manual" as const, earnedCents: -25, maximumCents: 300,
      pendingWrittenCount: 1, entries: [
        { questionIndex: 0, status: "needs_manual" as const, pointsAvailableCents: 200, pointsAwardedCents: 0 },
        { questionIndex: 1, status: "scored" as const, pointsAvailableCents: 100, pointsAwardedCents: -25 },
      ],
    };
    expect(finalEssayGrade(grade, [{ questionIndex: 0, pointsAwardedCents: 150 }]))
      .toMatchObject({ state: "auto_final", earnedCents: 125,
        finalPercentBasisPoints: 4167, pendingWrittenCount: 0 });
    expect(() => finalEssayGrade(grade, [])).toThrow("GRADING_CONFLICT");
    expect(() => finalEssayGrade(grade, [{ questionIndex: 1, pointsAwardedCents: 80 }]))
      .toThrow("GRADING_CONFLICT");
    expect(() => finalEssayGrade(grade, [{ questionIndex: 0, pointsAwardedCents: 250 }]))
      .toThrow("GRADING_CONFLICT");
  });
});
