import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { LiveExamPlayer } from "../../components/exams/LiveExamPlayer";

const mocks = vi.hoisted(() => ({ save: vi.fn(), prepare: vi.fn(), submit: vi.fn(), expire: vi.fn(),
  record: vi.fn(), getToken: vi.fn(), now: Date.now(), mode: "off", consent: false,
  mediaUrl: "", media: false, twoQuestions: false }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref);
      if (name === "examSubmissions:getStatus") return { state: "in_progress", deadlineAt: mocks.now + 60000,
        serverNow: mocks.now, timedOut: false, canPrepare: true, allowEarlySubmission: true, minimumSubmitAt: mocks.now, requireAllAnswers: false, answeredCount: 0, questionCount: 1 };
      if (name === "examRuntime:getMyAttempt") return { revision: 0, state: "in_progress",
        integrityMode: mocks.mode, telemetryConsented: mocks.consent };
      if (name === "examRuntime:getQuestions") return { title: "Exam", questions: [{ index: 0, kind: "single_choice",
        prompt: "Choose a valve", choices: [{ id: "a", text: "Valve A" }, { id: "b", text: "Valve B" }],
        caseStudy: mocks.media ? { stem: "Case", media: [{ mediaId: "media", alt: "Chart" }] } : null },
        ...(mocks.twoQuestions ? [{ index: 1, kind: "written", prompt: "Explain", choices: [], caseStudy: null }] : [])] };
      if (name === "examAnswers:getMine") return [];
      if (name === "examMedia:contentUrl") return mocks.mediaUrl;
      return null;
    },
    useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref);
      return name === "examAnswers:save" ? mocks.save : name === "examSubmissions:prepareSubmission" ? mocks.prepare :
        name === "examSubmissions:submit" ? mocks.submit : name === "examIntegrity:record" ? mocks.record : mocks.expire;
    },
  };
});
vi.mock("@/lib/auth/client", () => ({ useAuth: () => ({ getToken: mocks.getToken }) }));

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.save.mockReset().mockResolvedValue({ revision: 1, savedAt: Date.now() });
  mocks.prepare.mockReset().mockResolvedValue({ confirmationId: "confirm", expectedRevision: 0, unansweredCount: 0 });
  mocks.submit.mockReset().mockResolvedValue({ outcome: "submitted" });
  mocks.expire.mockReset().mockResolvedValue(null);
  mocks.record.mockReset().mockResolvedValue({ decision: "observed" });
  mocks.getToken.mockReset().mockResolvedValue("token");
  mocks.mode = "off"; mocks.consent = false; mocks.media = false; mocks.mediaUrl = ""; mocks.twoQuestions = false;
});

it("never records browser events without the frozen policy and consent", async () => {
  mocks.twoQuestions = true;
  const { rerender } = render(<LiveExamPlayer attemptId={"attempt-fixture" as Id<"examAttempts">} locale="en" />);
  fireEvent.blur(window);
  expect(mocks.record).not.toHaveBeenCalled();
  mocks.consent = true;
  rerender(<LiveExamPlayer attemptId={"attempt-fixture" as Id<"examAttempts">} locale="en" />);
  fireEvent.blur(window);
  expect(mocks.record).not.toHaveBeenCalled();
  mocks.consent = false;
  mocks.mode = "warn";
  rerender(<LiveExamPlayer attemptId={"attempt-fixture" as Id<"examAttempts">} locale="en" />);
  fireEvent.blur(window);
  expect(mocks.record).not.toHaveBeenCalled();
  mocks.consent = true;
  rerender(<LiveExamPlayer attemptId={"attempt-fixture" as Id<"examAttempts">} locale="en" />);
  fireEvent.blur(window);
  await waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(1));
  expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ kind: "blur" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.blur(window);
  await waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(2));
});

it("does not display a previous image when its protected URL changes", async () => {
  mocks.media = true; mocks.mediaUrl = "https://example.test/first";
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:first");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, blob: async () => new Blob(["a"]) } as Response);
  const { rerender } = render(<LiveExamPlayer attemptId={"attempt-fixture" as Id<"examAttempts">} locale="en" />);
  await waitFor(() => expect(screen.getByRole("img", { name: "Chart" })).toHaveAttribute("src", "blob:first"));
  fetchMock.mockReturnValue(new Promise(() => {}));
  mocks.mediaUrl = "https://example.test/second";
  rerender(<LiveExamPlayer attemptId={"attempt-fixture" as Id<"examAttempts">} locale="en" />);
  expect(screen.queryByRole("img", { name: "Chart" })).toBeNull();
  expect(revoke).toHaveBeenCalledWith("blob:first");
  create.mockRestore(); revoke.mockRestore(); fetchMock.mockRestore();
});

it("saves an answer before allowing a two-step submission", async () => {
  render(<LiveExamPlayer attemptId={"attempt-fixture" as Id<"examAttempts">} locale="en" />);
  fireEvent.click(screen.getByLabelText("Valve A"));
  expect(screen.getByRole("button", { name: "Review submission" })).toBeDisabled();
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
    questionIndex: 0, answer: expect.objectContaining({ choiceIds: ["a"] }),
  })), { timeout: 3000 });
  await waitFor(() => expect(screen.getByRole("button", { name: "Review submission" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Review submission" }));
  expect(await screen.findByText("Unanswered questions: 0")).toBeInTheDocument();
  expect(mocks.submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm submission" }));
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({
    confirmationId: "confirm", confirmed: true,
  })));
});
