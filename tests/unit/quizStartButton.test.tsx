import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import QuizRoute from "@/app/[lang]/(app)/[username]/[quizname]/page";

// Test double for the Convex hooks: queries answer from a table keyed by function name,
// mutations are plain spies so a test can decide when they settle.
const startSession = vi.fn();
const gradeAnswer = vi.fn();
const completeSession = vi.fn();
const openQuestion = vi.fn().mockResolvedValue(null);
const attemptQuery = vi.fn();
let routeParams = { username: "creator", quizname: "quiz" };
const playerData = { isPublished: true, title: "Quiz", questions: [], totalPoints: 0, questionCount: 0, usesPool: false, resultsWithheld: false };
const queryResults: Record<string, unknown> = {
  "links:resolveLink": null,
  "quizFunctions:getQuizByUsernameSlug": { _id: "quiz1", title: "Quiz", slug: "quiz", creatorUsername: "creator", isPublished: true },
  "quizFunctions:getQuizForPlayer": {
    isPublished: true, title: "Quiz", questions: [], totalPoints: 0, questionCount: 0, usesPool: false, resultsWithheld: false,
  },
};

vi.mock("convex/react", () => ({
  useQuery: (ref: never, args: unknown) => (args === "skip" ? undefined : queryResults[getFunctionName(ref)]),
  useMutation: (ref: never) => ({ "quizFunctions:startQuizSession": startSession, "quizFunctions:gradeAnswer": gradeAnswer, "quizFunctions:completeQuizSession": completeSession, "quizFunctions:openQuestion": openQuestion })[getFunctionName(ref)],
  useConvex: () => ({ query: attemptQuery }),
}));
vi.mock("next/navigation", () => ({ useParams: () => routeParams }));
vi.mock("@/lib/sfx", () => ({ sfx: { play: vi.fn(), isEnabled: () => false, setEnabled: vi.fn() } }));
vi.mock("@/lib/haptics", () => ({
  haptics: new Proxy({}, { get: () => vi.fn() }),
}));
vi.mock("@/components/forms/formThemes.css", () => ({}));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => null }));

beforeEach(() => {
  startSession.mockReset();
  gradeAnswer.mockReset();
  completeSession.mockReset();
  attemptQuery.mockReset();
  localStorage.clear();
  routeParams = { username: "creator", quizname: "quiz" };
  queryResults["quizFunctions:getQuizForPlayer"] = playerData;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function withQuestion(type = "mcq") {
  queryResults["quizFunctions:getQuizForPlayer"] = { ...playerData, totalPoints: 10, questionCount: 1, questions: [{ _id: "q1", questionText: "Pick one", type, options: ["First", "Second"], points: 10, timeLimit: 2 }] };
}

async function beginQuiz(fakeTimers = false) {
  startSession.mockResolvedValue("session1");
  fireEvent.change(await screen.findByPlaceholderText("Your name"), { target: { value: "Guest" } });
  if (fakeTimers) vi.useFakeTimers();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Start quiz/ })); });
}

describe("quiz Start control", () => {
  it("renders unavailable player data without a Start control", async () => {
    queryResults["quizFunctions:getQuizForPlayer"] = null;
    render(<QuizRoute />);
    await screen.findByText("Nothing here");
    expect(screen.queryByRole("button", { name: /Start quiz/ })).toBeNull();
    expect(startSession).not.toHaveBeenCalled();
  });

  it("resets attempts on navigation to another quiz", async () => {
    withQuestion();
    const { rerender } = render(<QuizRoute />);
    await beginQuiz();
    await screen.findByText("Pick one");
    routeParams = { username: "creator", quizname: "another" };
    queryResults["quizFunctions:getQuizForPlayer"] = { ...playerData, title: "Another quiz" };
    rerender(<QuizRoute />);
    expect(await screen.findByRole("heading", { name: "Another quiz" })).toBeInTheDocument();
    expect(screen.queryByText("Pick one")).toBeNull();
    expect(screen.getByPlaceholderText("Your name")).toHaveValue("");
  });

  it("does not play every pool question when the attempt selection is unavailable", async () => {
    withQuestion();
    queryResults["quizFunctions:getQuizForPlayer"] = { ...(queryResults["quizFunctions:getQuizForPlayer"] as object), usesPool: true };
    attemptQuery.mockResolvedValue(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<QuizRoute />);
    await beginQuiz();
    expect(await screen.findByText(/Your questions could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText("Pick one")).toBeNull();
  });

  it.each(["rejection", "null"])("reuses an allocated attempt after pool initialization %s", async (failure) => {
    withQuestion();
    queryResults["quizFunctions:getQuizForPlayer"] = { ...(queryResults["quizFunctions:getQuizForPlayer"] as object), usesPool: true };
    if (failure === "null") attemptQuery.mockResolvedValueOnce(null);
    else attemptQuery.mockRejectedValueOnce(new Error("Questions temporarily unavailable"));
    attemptQuery.mockResolvedValue(["q1"]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<QuizRoute />);
    await beginQuiz();
    expect(screen.getByRole("button", { name: /Start quiz/ })).toBeEnabled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Start quiz/ })); });
    expect(screen.getByText("Pick one")).toBeInTheDocument();
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(attemptQuery).toHaveBeenCalledTimes(2);
    for (const call of attemptQuery.mock.calls) expect(call[1]).toEqual({ sessionId: "session1" });
  });

  it("allocates a fresh attempt on deliberate Play Again", async () => {
    completeSession.mockResolvedValue({ withheld: false, score: 0, totalPoints: 0 });
    render(<QuizRoute />);
    await beginQuiz();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Submit quiz/ })); });
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    await beginQuiz();
    expect(startSession).toHaveBeenCalledTimes(2);
  });

  it("keeps held feedback neutral even if extra result fields arrive", async () => {
    withQuestion("multi_select");
    gradeAnswer.mockResolvedValue({ withheld: true, isCorrect: true, pointsEarned: 10, correctAnswers: ["Second"], explanation: "Private explanation" });
    render(<QuizRoute />);
    await beginQuiz();
    fireEvent.click(screen.getByRole("checkbox", { name: /First/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /selected/ })); });
    expect(screen.getByText("Answer saved")).toBeInTheDocument();
    expect(screen.queryByText("Private explanation")).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Second/ })).not.toHaveClass("bg-chaos");
  });

  it("uses current submission state when a timeout races a pending click", async () => {
    withQuestion();
    let reject!: (error: Error) => void;
    gradeAnswer.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    gradeAnswer.mockResolvedValue({ withheld: true });
    render(<QuizRoute />);
    await beginQuiz(true);
    fireEvent.click(screen.getByRole("radio", { name: /First/ }));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(gradeAnswer).toHaveBeenCalledTimes(1);
    await act(async () => { reject(new Error("Try again")); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });
    expect(gradeAnswer).toHaveBeenCalledTimes(2);
    expect(gradeAnswer).toHaveBeenLastCalledWith(expect.objectContaining({ answer: "First" }));
  });

  it("submits a timeout once, including under StrictMode updater checks", async () => {
    withQuestion();
    gradeAnswer.mockResolvedValue({ withheld: true });
    render(<StrictMode><QuizRoute /></StrictMode>);
    await beginQuiz(true);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(gradeAnswer).toHaveBeenCalledTimes(1);
    expect(gradeAnswer).toHaveBeenCalledWith(expect.objectContaining({ answer: "", questionId: "q1" }));
  });

  it("is disabled until a name is entered, and while the start mutation is pending", async () => {
    let settle!: (id: string) => void;
    startSession.mockReturnValue(new Promise<string>((resolve) => { settle = resolve; }));
    render(<QuizRoute />);

    const start = await screen.findByRole("button", { name: /Start quiz/ });
    expect(start).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Guest" } });
    expect(start).toBeEnabled();

    // A rapid double click (and Enter) reaches the server once.
    fireEvent.click(start);
    fireEvent.click(start);
    fireEvent.keyDown(screen.getByPlaceholderText("Your name"), { key: "Enter" });
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(startSession).toHaveBeenCalledWith({ quizId: "quiz1", playerName: "Guest" });
    expect(screen.getByRole("button", { name: /Starting/ })).toBeDisabled();

    await act(async () => { settle("session1"); });
  });

  it("shows the server's error and re-enables Start when starting fails", async () => {
    startSession.mockRejectedValue(new Error("RATE_LIMITED: Too many people are starting this quiz at once."));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<QuizRoute />);
    fireEvent.change(await screen.findByPlaceholderText("Your name"), { target: { value: "Guest" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Start quiz/ })); });
    expect(await screen.findByText(/Too many people/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start quiz/ })).toBeEnabled();
  });
});


describe("quiz device recovery", () => {
  it("resumes the same attempt and retries a saved answer without creating a new session", async () => {
    withQuestion(); gradeAnswer.mockRejectedValueOnce(new Error("Offline"));
    const first = render(<QuizRoute />); await beginQuiz();
    await act(async () => { fireEvent.click(screen.getByRole("radio",{name:/First/})); });
    expect(JSON.parse(localStorage.getItem("chaos-quiz-backup:quiz1")!).pending.answer).toBe("First");
    expect(screen.getByText("Saved on this device · waiting to send")).toBeVisible();
    first.unmount();
    attemptQuery.mockResolvedValue({completed:false,questions:[{_id:"q1",questionText:"Pick one",type:"mcq",options:["First","Second"],points:10,timeLimit:2,order:0}],opened:[],answers:[]});
    gradeAnswer.mockResolvedValue({isCorrect:true,pointsEarned:10,totalPointsPossible:10});
    render(<QuizRoute />);
    await act(async () => {fireEvent.click(await screen.findByRole("button",{name:"Resume saved quiz"}));});
    await act(async () => {fireEvent.click(screen.getByRole("button",{name:"Try again"}));});
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(gradeAnswer).toHaveBeenLastCalledWith(expect.objectContaining({sessionId:"session1",answer:"First"}));
    expect(JSON.parse(localStorage.getItem("chaos-quiz-backup:quiz1")!).pending).toBeNull();
  });
  it("keeps a failed selected answer when the timer expires instead of replacing it with a timeout", async () => {
    withQuestion(); gradeAnswer.mockRejectedValueOnce(new Error("Offline"));
    render(<QuizRoute />); await beginQuiz(true);
    await act(async () => {fireEvent.click(screen.getByRole("radio",{name:/First/}));});
    await act(async () => {await vi.advanceTimersByTimeAsync(3_000);});
    expect(gradeAnswer).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem("chaos-quiz-backup:quiz1")!).pending.answer).toBe("First");
  });
});

it("returns to a pending saved answer instead of completing an attempt", async () => {
  withQuestion();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  localStorage.setItem("chaos-quiz-backup:quiz1", JSON.stringify({ version: 1, quizId: "quiz1", sessionId: "session1", playerName: "Guest", questionIds: ["q1"], currentQ: 1, selected: { q1: "First" }, multi: {}, written: {}, opened: {}, pending: { qId: "q1", answer: "First", isTimeout: false } }));
  attemptQuery.mockResolvedValue({ completed: false, questions: [{ _id: "q1", questionText: "Pick one", type: "mcq", options: ["First", "Second"], points: 10, timeLimit: 2, order: 0 }], opened: [], answers: [] });
  render(<QuizRoute />);
  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Resume saved quiz" })); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Submit quiz" })); });
  expect(completeSession).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
});
