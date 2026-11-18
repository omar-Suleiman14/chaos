import { describe, expect, it } from "vitest";
import { preparePublishedQuizForExam } from "../../convex/examQuizImport";

type Definition = Parameters<typeof preparePublishedQuizForExam>[0];
type Allocation = Parameters<typeof preparePublishedQuizForExam>[1][number];

const allocations: Allocation[] = [
  { id: "anatomy", kind: "module", key: "anatomy", count: 1, points: 1 },
  { id: "physiology", kind: "module", key: "physiology", count: 1, points: 1 },
];

const fields = [
  {
    id: "q1", type: "choice", label: "Where does the spinal cord end?",
    options: [{ id: "a", label: "L1–L2" }, { id: "b", label: "S1–S2" }],
    quiz: { points: 1, correctOptionIds: ["a"], explanation: "Adult conus usually ends near L1–L2." },
    required: true,
  },
  {
    id: "q2", type: "multi_choice", label: "Which are CNS glial cells?",
    options: [{ id: "a", label: "Oligodendrocytes" }, { id: "b", label: "Astrocytes" }, { id: "c", label: "Schwann cells" }],
    quiz: { points: 1, correctOptionIds: ["a", "b"] },
    required: true,
  },
];

const definition = (value: unknown = fields) => ({
  quiz: { enabled: true, showAnswers: false },
  fields: value,
}) as unknown as Definition;

describe("published quiz to private exam bank", () => {
  it("maps answer-keyed choices to the correct syllabus modules without public answer leaks", () => {
    const items = preparePublishedQuizForExam(definition(), allocations);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      allocationId: "anatomy", moduleId: "anatomy",
      item: { kind: "single_choice", prompt: fields[0].label, correctChoiceIds: ["choice_1"], status: "ready" },
    });
    expect(items[1]).toMatchObject({
      allocationId: "physiology", moduleId: "physiology",
      item: { kind: "multiple_choice", correctChoiceIds: ["choice_1", "choice_2"] },
    });
    expect(items[0].item.explanation).toBe(fields[0].quiz.explanation);
  });

  it("fails on count mismatch, missing answer keys, image questions and branches", () => {
    expect(() => preparePublishedQuizForExam(definition(fields.slice(0, 1)), allocations))
      .toThrow("QUESTION_COUNT_MISMATCH");
    expect(() => preparePublishedQuizForExam(definition([{ ...fields[0], quiz: { points: 1, correctOptionIds: [] } }, fields[1]]), allocations))
      .toThrow("MISSING_ANSWER_KEY");
    expect(() => preparePublishedQuizForExam(definition([{ ...fields[0], image: { url: "https://example.com/img.png", alt: "X" } }, fields[1]]), allocations))
      .toThrow("UNSUPPORTED_QUESTION");
    expect(() => preparePublishedQuizForExam(definition([{ ...fields[0], showIf: { match: "all", conditions: [] } }, fields[1]]), allocations))
      .toThrow("UNSUPPORTED_QUESTION");
  });

  it("rejects an ungraded source, unsupported allocation or ungradable field", () => {
    expect(() => preparePublishedQuizForExam({ ...definition(), quiz: { enabled: false } }, allocations))
      .toThrow("VALIDATION_FAILED");
    expect(() => preparePublishedQuizForExam(definition(), [{ ...allocations[0], kind: "topic", count: 2 }]))
      .toThrow("UNSUPPORTED_ALLOCATION");
    expect(() => preparePublishedQuizForExam(definition([{ ...fields[0], type: "textarea" }, fields[1]]), allocations))
      .toThrow("UNSUPPORTED_QUESTION");
  });
});
