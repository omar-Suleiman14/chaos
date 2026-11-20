import { describe, expect, it } from "vitest";
import { quizExamCandidates } from "../../convex/examFromQuiz";

type Definition = Parameters<typeof quizExamCandidates>[0];
const definition = (fields: unknown[]) => ({ quiz: { enabled: true }, fields }) as unknown as Definition;
const choice = (id: string, extra: Record<string, unknown> = {}) => ({
  id, type: "choice", label: `Question ${id}`, required: true,
  options: [{ id: "a", label: "Yes" }, { id: "b", label: "No" }],
  quiz: { points: 2, correctOptionIds: ["a"] }, ...extra,
});

describe("making an exam from a published quiz", () => {
  it("keeps keyed choice questions and skips the rest instead of failing", () => {
    const result = quizExamCandidates(definition([
      { id: "intro", type: "section", label: "Part 1", required: false },
      choice("q1"),
      choice("q2", { quiz: { points: 2, correctOptionIds: [] } }),
      { id: "q3", type: "short_text", label: "Explain", required: false },
      choice("q4", { image: { url: "https://example.com/x.png", alt: "X" } }),
      { ...choice("q5"), type: "multi_choice", quiz: { points: 2, correctOptionIds: ["a", "b"] } },
    ]));
    expect(result.total).toBe(5);
    expect(result.items.map(i => i.kind)).toEqual(["single_choice", "multiple_choice"]);
    expect(result.items[0]).toMatchObject({ prompt: "Question q1", correctChoiceIds: ["choice_1"], points: 2, status: "ready" });
    expect(result.skipped).toBe(3);
  });

  it("reports nothing usable for a quiz without answer keys", () => {
    const result = quizExamCandidates(definition([choice("q1", { quiz: { points: 1, correctOptionIds: [] } })]));
    expect(result.items).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("caps an exam at 100 questions", () => {
    const result = quizExamCandidates(definition(Array.from({ length: 105 }, (_, i) => choice(`q${i}`))));
    expect(result.items).toHaveLength(100);
    expect(result.skipped).toBe(5);
  });
});
