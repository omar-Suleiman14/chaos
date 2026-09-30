import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import PrintQuizPage from "@/app/print/[quizId]/page";

const results: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: never) => results[getFunctionName(ref)],
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ quizId: "q1" }) }));

const questions = [
  { _id: "a", type: "mcq", questionText: "Two plus two?", options: ["3", "4"], correctAnswer: "4", points: 1 },
  { _id: "b", type: "true_false", questionText: "Sky is blue", correctAnswer: "true", points: 1 },
  { _id: "c", type: "multi_select", questionText: "Primaries", options: ["Red", "Green", "Blue"], correctAnswers: ["Red", "Blue"], points: 2 },
  { _id: "d", type: "written", questionText: "Explain", keywords: ["secretkeyword"], points: 3 },
];

beforeEach(() => {
  results["quizFunctions:getQuiz"] = { _id: "q1", title: "Paper" };
  results["quizFunctions:getQuestionsForOwner"] = questions;
});

describe("print page", () => {
  it("prints no answer key by default and only adds it when the creator ticks the box", () => {
    const { container } = render(<PrintQuizPage />);
    expect(screen.queryByTestId("answer-key")).toBeNull();
    expect(container.textContent).not.toContain("secretkeyword");
    expect(container.textContent).not.toContain("INSTRUCTOR COPY");
    for (const text of ["Two plus two?", "Sky is blue", "Primaries", "Explain"]) expect(container.textContent).toContain(text);
    fireEvent.click(screen.getByLabelText("Include the answer key"));
    expect(screen.getByTestId("answer-key").textContent).toContain("secretkeyword");
    expect(screen.getByTestId("answer-key").textContent).toContain("a) Red, c) Blue");
    fireEvent.click(screen.getByLabelText("Include the answer key"));
    expect(screen.queryByTestId("answer-key")).toBeNull();
  });

  it("shows an explicit message, not a spinner, when the viewer may not read the quiz", () => {
    results["quizFunctions:getQuiz"] = null;
    render(<PrintQuizPage />);
    expect(screen.getByRole("alert").textContent).toContain("can't print");
  });
});
