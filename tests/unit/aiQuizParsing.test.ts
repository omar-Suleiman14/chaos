import { describe, expect, it } from "vitest";
import { parseQuestionsFromAI, validateQuestions } from "@/convex/aiQuiz";

describe("parseQuestionsFromAI", () => {
  it("parses well-formed JSON into typed questions", () => {
    const raw = JSON.stringify({
      questions: [
        {
          type: "mcq",
          question: "What is 2 + 2?",
          options: ["3", "4", "5"],
          answer: "4",
          explanation: "Basic arithmetic.",
        },
        {
          type: "true_false",
          question: "The sky is blue.",
          answer: true,
          explanation: "",
        },
      ],
    });

    const result = parseQuestionsFromAI(raw);

    expect(result).toEqual([
      {
        type: "mcq",
        questionText: "What is 2 + 2?",
        options: ["3", "4", "5"],
        answer: "4",
        explanation: "Basic arithmetic.",
      },
      {
        type: "true_false",
        questionText: "The sky is blue.",
        answerBool: true,
        explanation: "",
      },
    ]);
  });

  it("strips markdown code fences before parsing", () => {
    const raw = "```json\n" + JSON.stringify({
      questions: [{ type: "true_false", question: "Water boils at 100C at sea level.", answer: "true" }],
    }) + "\n```";

    const result = parseQuestionsFromAI(raw);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("true_false");
  });

  it("recovers complete questions when the response is truncated mid-object", () => {
    // Simulates a provider response cut off mid-stream: one complete question
    // followed by the start of a second that never closes.
    const truncated =
      `{"questions": [` +
      `{"type": "mcq", "question": "Complete?", "options": ["A", "B"], "answer": "A"}, ` +
      `{"type": "mcq", "question": "Trunc`;

    const result = parseQuestionsFromAI(truncated);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "mcq", questionText: "Complete?", answer: "A" });
  });

  it("drops entries with no question text", () => {
    const raw = JSON.stringify({
      questions: [{ type: "mcq", question: "", options: ["A", "B"], answer: "A" }],
    });

    expect(parseQuestionsFromAI(raw)).toHaveLength(0);
  });

  it("returns an empty array for input with no recognizable questions", () => {
    expect(parseQuestionsFromAI("not json at all")).toEqual([]);
  });
});

describe("validateQuestions", () => {
  it("keeps an MCQ whose answer matches one of its options", () => {
    const [result] = validateQuestions([
      { type: "mcq", questionText: "2 + 2?", options: ["3", "4"], answer: "4", explanation: "" },
    ]);

    expect(result).toMatchObject({ questionText: "2 + 2?", answer: "4" });
  });

  it("normalizes the answer to the option's exact casing/whitespace", () => {
    const [result] = validateQuestions([
      { type: "mcq", questionText: "2 + 2?", options: [" Four ", "5"], answer: "four", explanation: "" },
    ]);

    expect(result?.answer).toBe(" Four ");
  });

  it("drops an MCQ whose answer matches none of its options", () => {
    const result = validateQuestions([
      { type: "mcq", questionText: "2 + 2?", options: ["3", "5"], answer: "4", explanation: "" },
    ]);

    expect(result).toHaveLength(0);
  });

  it("drops an MCQ with fewer than two options", () => {
    const result = validateQuestions([
      { type: "mcq", questionText: "2 + 2?", options: ["4"], answer: "4", explanation: "" },
    ]);

    expect(result).toHaveLength(0);
  });

  it("drops a true/false question with no resolved boolean answer", () => {
    const result = validateQuestions([
      { type: "true_false", questionText: "The sky is blue.", explanation: "" },
    ]);

    expect(result).toHaveLength(0);
  });

  it("deduplicates questions by normalized question text", () => {
    const result = validateQuestions([
      { type: "true_false", questionText: "The sky is blue.", answerBool: true, explanation: "" },
      { type: "true_false", questionText: "the   sky is blue.  ", answerBool: false, explanation: "" },
    ]);

    expect(result).toHaveLength(1);
  });
});
