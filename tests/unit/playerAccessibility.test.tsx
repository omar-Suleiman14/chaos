import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { axe } from "vitest-axe";
import QuizRoute from "@/app/[username]/[quizname]/page";

const startSession = vi.fn();
const gradeAnswer = vi.fn();
const questions = [
  { _id: "q1", type: "mcq", questionText: "Pick one", options: ["A one", "B, two"], points: 1, timeLimit: 30 },
  { _id: "q2", type: "multi_select", questionText: "Pick some", options: ["Paris, France", "Lyon", "Nice"], points: 2, timeLimit: 30 },
  { _id: "q3", type: "written", questionText: "Explain", points: 2, timeLimit: 30 },
];
const queryResults: Record<string, unknown> = {
  "links:resolveLink": null,
  "quizFunctions:getQuizByUsernameSlug": { _id: "quiz1", title: "Quiz", slug: "quiz", creatorUsername: "creator", isPublished: true },
  "quizFunctions:getQuizForPlayer": { isPublished: true, title: "Quiz", questions, totalPoints: 5, questionCount: 3, usesPool: false, resultsWithheld: false },
};

vi.mock("convex/react", () => ({
  useQuery: (ref: never, args: unknown) => (args === "skip" ? undefined : queryResults[getFunctionName(ref)]),
  useMutation: (ref: never) => {
    const name = getFunctionName(ref);
    return name === "quizFunctions:startQuizSession" ? startSession : name === "quizFunctions:gradeAnswer" ? gradeAnswer : vi.fn();
  },
  useConvex: () => ({ query: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ username: "creator", quizname: "quiz" }) }));
vi.mock("@/lib/sfx", () => ({ sfx: { play: vi.fn(), isEnabled: () => false, setEnabled: vi.fn() } }));
vi.mock("@/lib/haptics", () => ({ haptics: new Proxy({}, { get: () => vi.fn() }) }));
vi.mock("@/components/forms/formThemes.css", () => ({}));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => null }));

const axeOptions = { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } };

beforeEach(() => {
  startSession.mockReset().mockResolvedValue("s1");
  gradeAnswer.mockReset().mockResolvedValue({ isCorrect: true, pointsEarned: 1, totalPointsPossible: 1 });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  Element.prototype.scrollIntoView = vi.fn();
});

async function startQuiz() {
  render(<QuizRoute />);
  fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Guest" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /START QUIZ/ })); });
  await screen.findByRole("radiogroup");
}

describe("quiz player accessibility", () => {
  it("entry screen has no axe violations", async () => {
    const { container } = render(<QuizRoute />);
    await screen.findByLabelText("Your name");
    expect((await axe(container, axeOptions)).violations).toEqual([]);
  });

  it("question screen has no axe violations and exposes groups with roles and state", async () => {
    await startQuiz();
    expect(screen.getByRole("radiogroup", { name: "Pick one" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("group", { name: "Pick some", hidden: true })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox", { hidden: true })).toHaveLength(3);
    expect(screen.getByRole("textbox", { name: "Explain", hidden: true })).toBeInTheDocument();
    expect((await axe(document.body, axeOptions)).violations).toEqual([]);
  });

  it("announces feedback, and Next moves focus to the next question without scrolling", async () => {
    await startQuiz();
    // Later questions cannot be reached by Tab before the current one is answered.
    expect(screen.getByRole("region", { name: "Question 2 of 3", hidden: true })).toHaveAttribute("inert");
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /A one/ })); });
    await waitFor(() => expect(screen.getAllByRole("status").some((el) => /Correct\. 1 marks/.test(el.textContent ?? ""))).toBe(true));
    expect(screen.getAllByRole("radio")[0]).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: /NEXT QUESTION/ }));
    await waitFor(() => expect(document.activeElement?.id).toBe("q-heading-1"));
    expect(screen.getByRole("region", { name: "Question 2 of 3" })).not.toHaveAttribute("inert");
  });

  it("sends multi-select picks as a JSON array so commas in an option are safe", async () => {
    await startQuiz();
    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /A one/ })); });
    fireEvent.click(screen.getByRole("button", { name: /NEXT QUESTION/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Paris, France/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Lyon/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /SUBMIT SELECTION/ })); });
    expect(gradeAnswer).toHaveBeenLastCalledWith(expect.objectContaining({ answer: JSON.stringify(["Paris, France", "Lyon"]) }));
  });
});
