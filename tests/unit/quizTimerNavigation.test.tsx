import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FormRenderer from "@/components/forms/FormRenderer";
import { emptyDefinition } from "@/convex/formLogic";
import type { Answers } from "@/convex/formLogic";

vi.mock("@/lib/sfx", () => ({ sfx: { play: vi.fn() } }));
vi.mock("@/lib/haptics", () => ({ haptics: { error: vi.fn(), light: vi.fn(), medium: vi.fn(), select: vi.fn() } }));
vi.mock("@/components/forms/formThemes.css", () => ({}));

const definition = {
  ...emptyDefinition("Anatomy examination"),
  quiz: { enabled: true },
  presentation: "page" as const,
  fields: [
    { id: "q1", type: "choice" as const, label: "First question", required: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
    { id: "q2", type: "choice" as const, label: "Second question", required: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.useRealTimers());

it("provides a numbered answered-status navigator for ordinary page-layout quizzes", () => {
  function Quiz() {
    const [answers, setAnswers] = useState<Answers>({});
    return <FormRenderer skipCover definition={definition} language="en" answers={answers}
      onAnswer={(id, value) => setAnswers(current => ({ ...current, [id]: value! }))} onSubmit={vi.fn()} />;
  }
  render(<Quiz />);
  fireEvent.click(screen.getByRole("button", { name: /Questions 0\/2/ }));
  expect(screen.getByRole("button", { name: /Questions 1: First question\. Unanswered/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Questions 2: Second question\. Unanswered/ }));
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});

it("submits an entire-quiz timer once at expiry, even with unanswered questions", () => {
  const submit = vi.fn();
  render(<FormRenderer skipCover definition={definition} language="en" answers={{}}
    onAnswer={vi.fn()} onSubmit={submit}
    timerMode="quiz" timerSeconds={5} timerStartedAt={Date.now()} onTimeUp={submit} />);
  expect(screen.getByRole("timer")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(5300));
  expect(submit).toHaveBeenCalledTimes(1);
});

it("expires a question and advances to the next one without requiring an answer", () => {
  const submit = vi.fn();
  function TimedQuiz() {
    const [answers, setAnswers] = useState<Answers>({});
    const [starts, setStarts] = useState<Record<string, number>>({ q1: Date.now() });
    const [expired, setExpired] = useState<string[]>([]);
    return <FormRenderer skipCover definition={definition} language="en" answers={answers}
      onAnswer={(id, value) => setAnswers(current => ({ ...current, [id]: value! }))}
      onSubmit={submit} timerMode="question" timerSeconds={5} timerStartedAt={Date.now()}
      questionStartedAtById={starts} expiredQuestionIds={expired}
      onQuestionStart={id => setStarts(prev => prev[id] ? prev : { ...prev, [id]: Date.now() })}
      onQuestionTimeout={id => setExpired(prev => [...prev, id])}
      onTimeUp={submit} />;
  }
  render(<TimedQuiz />);
  expect(screen.getByRole("group", { name: /First question/ })).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(5300));
  expect(screen.getByRole("group", { name: /Second question/ })).toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Questions 0\/2/ }));
  expect(screen.getByRole("button", { name: /Questions 1: First question/ })).toBeDisabled();
});
