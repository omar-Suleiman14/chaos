import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudentExamPlayer } from "@/components/exams/StudentExamPlayer";
import { previewQuestions } from "@/components/exams/exam-player-preview";
import {
  isPreviewAnswered, navigatorStatus, togglePreviewChoice,
} from "@/components/exams/exam-player-model";

describe("exam preview model", () => {
  it("keeps review flags and bookmarks independent of a locally answered question", () => {
    const question = previewQuestions[0];
    const answer = { choiceIds: ["b"], text: "" };
    expect(isPreviewAnswered(question, answer)).toBe(true);
    expect(navigatorStatus(question, answer, false, false)).toBe("answered");
    expect(navigatorStatus(question, answer, true, false)).toBe("saved");
    expect(navigatorStatus(question, answer, true, true)).toBe("flagged");
    expect(navigatorStatus(question, undefined, false, false)).toBe("unanswered");
  });

  it("supports multiple-choice toggling and single-choice replacement", () => {
    expect(togglePreviewChoice(["a"], "b", true)).toEqual(["a", "b"]);
    expect(togglePreviewChoice(["a", "b"], "a", true)).toEqual(["b"]);
    expect(togglePreviewChoice(["a"], "b", false)).toEqual(["b"]);
  });

  it("does not mistake whitespace-only written responses for answers", () => {
    expect(isPreviewAnswered(previewQuestions[3], { choiceIds: [], text: "   " })).toBe(false);
    expect(isPreviewAnswered(previewQuestions[3], { choiceIds: [], text: "Practice" })).toBe(true);
  });
});

describe("student exam preview UI", () => {
  const mount = (locale: "en" | "ar" = "en") =>
    render(<StudentExamPlayer title="Heart practice" locale={locale} questions={previewQuestions} />);

  it("navigates between questions and reports local answered, saved and flagged states", () => {
    mount();
    const navigator = screen.getByRole("group", { name: "Question navigator" });
    fireEvent.click(screen.getByRole("radio", { name: "Right ventricle" }));
    expect(within(navigator).getByRole("button", { name: "Question 1: Answered" })).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: "Save for later" }));
    expect(within(navigator).getByRole("button", { name: "Question 1: Saved for later" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Flag for review" }));
    expect(within(navigator).getByRole("button", { name: "Question 1: Flagged for review" })).toBeInTheDocument();
    fireEvent.click(within(navigator).getByRole("button", { name: "Question 2: Unanswered" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Heart rate" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Body temperature" }));
    expect(within(navigator).getByRole("button", { name: "Question 2: Answered" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(screen.getByRole("heading", { name: /Diastole refers to relaxation/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Write your answer" }), { target: { value: "Practice answer" } });
    expect(within(navigator).getByRole("button", { name: "Question 4: Answered" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit exam" })).toBeDisabled();
  });

  it("renders Arabic RTL controls and never exposes submission", () => {
    const { container } = mount("ar");
    expect(container.firstElementChild).toHaveAttribute("dir", "rtl");
    expect(screen.getByText(/معاينة الواجهة/)).toBeVisible();
    expect(screen.getByRole("button", { name: "تسليم الامتحان" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "السؤال 1: لم يُجب" })).toBeInTheDocument();
  });

  it("offers accessible enlargement of a synthetic case illustration", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Enlarge image" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("img", {
      name: /Simplified educational outline/,
    })).toBeInTheDocument();
  });

  it("handles empty input without rendering any fake exam attempt", () => {
    render(<StudentExamPlayer title="Empty" locale="en" questions={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("No preview questions are available");
  });
});
