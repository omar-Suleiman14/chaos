import { describe, expect, it } from "vitest";
import { emptyDefinition } from "@/convex/formLogic";
import { gradeQuiz } from "@/convex/formQuiz";

describe("quiz-mode forms", () => {
  const def = () => {
    const d = emptyDefinition("Quiz");
    d.quiz = { enabled: true };
    d.fields = [
      { id: "s", type: "choice", label: "S", required: false, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], quiz: { correctOptionIds: ["a"], points: 2 } },
      { id: "d", type: "dropdown", label: "D", required: false, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], quiz: { correctOptionIds: ["b"], points: 2 } },
      { id: "m", type: "multi_choice", label: "M", required: false, options: [{ id: "x", label: "X" }, { id: "y", label: "Y" }], quiz: { correctOptionIds: ["x", "y"], points: 3 } },
    ];
    return d;
  };
  it("scores unanswered questions 0 and never exceeds the max", () => {
    expect(gradeQuiz(def(), {})).toMatchObject({ score: 0, maxScore: 7 });
    const full = gradeQuiz(def(), { s: "a", d: "b", m: ["x", "y"] })!;
    expect(full.score).toBe(7);
    expect(full.score).toBeLessThanOrEqual(full.maxScore);
  });
  it("ignores duplicates in checkboxes and requires the exact set", () => {
    expect(gradeQuiz(def(), { m: ["x", "x"] })!.score).toBe(0);
    expect(gradeQuiz(def(), { m: ["x", "x", "y"] })!.score).toBe(3);
    expect(gradeQuiz(def(), { m: ["x"] })!.score).toBe(0);
  });
  it("does not accept a list for a single-choice field", () => {
    expect(gradeQuiz(def(), { s: ["a", "a"] })!.score).toBe(0);
    expect(gradeQuiz(def(), { s: ["a", "b"] })!.score).toBe(0);
  });
});
