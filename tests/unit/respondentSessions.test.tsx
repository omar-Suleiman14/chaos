import type { ComponentProps } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { emptyDefinition } from "@/convex/formLogic";
import FormRenderer from "@/components/forms/FormRenderer";
import { RespondToForm } from "@/components/forms/respond/RespondPage";

const m = vi.hoisted(() => ({
  search: "", state: "open", resumed: undefined as unknown, editing: null as unknown,
  submit: vi.fn(), update: vi.fn(), saveResume: vi.fn(), unlock: vi.fn(), queries: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(m.search) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@clerk/nextjs", () => ({ SignInButton: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/lib/analytics", () => ({ default: { capture: vi.fn() } }));
vi.mock("@/lib/sfx", () => ({ sfx: { isEnabled: () => false } }));
vi.mock("@/components/Logo", () => ({ default: () => null }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/forms/FormRenderer", () => ({
  default: (props: ComponentProps<typeof FormRenderer>) => <section>
    <p>Answers: {JSON.stringify(props.answers)}</p>
    <button onClick={() => props.onAnswer("name", "Example answer")}>Answer</button>
    <button onClick={() => props.onSubmit()}>Submit</button>
    {props.footer}
  </section>,
  EndingView: ({ children }: { children: React.ReactNode }) => <div>Finished{children}</div>,
  formUi: { en: { required: "Required" } }, themeClass: () => "", themeStyle: () => ({}),
}));
const definition = emptyDefinition("Example");
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(ref);
    m.queries(name, args);
    if (args === "skip") return undefined;
    if (name === "respond:getResumeDraft") return m.resumed;
    if (name === "respond:getSubmissionForEdit") return m.editing;
    if (name === "respond:getPublicForm") return {
      state: m.state, title: "Example", defaultLanguage: "en", definition, theme: definition.theme,
      version: 1, opensAt: null, closesAt: null, collectPartial: true, allowResumeLink: true,
      allowEditAfterSubmit: true, showReceipt: true, alreadyResponded: false,
    };
  },
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => ({
    "respond:submitResponse": m.submit, "respond:updateSubmission": m.update,
    "respond:saveResumeDraft": m.saveResume, "respond:unlockForm": m.unlock,
  })[getFunctionName(ref)] ?? vi.fn(),
}));
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  m.search = ""; m.state = "open"; m.resumed = undefined; m.editing = null;
  m.submit.mockReset().mockResolvedValue({ receiptCode: "R1", endingId: null });
  m.saveResume.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

it("waits for a resume lookup before initializing answers", () => {
  m.search = "resume=resume-a";
  const { rerender } = render(<RespondToForm shareId="a" />);
  expect(screen.queryByRole("button", { name: "Answer" })).not.toBeInTheDocument();
  m.resumed = { answers: { name: "Resumed answer" }, language: "en", version: 1 };
  rerender(<RespondToForm shareId="a" />);
  expect(screen.getByText(/Answers:/)).toHaveTextContent("Resumed answer");
});

it("shows an invalid resume link without falling back to a local draft", () => {
  m.search = "resume=expired"; m.resumed = null;
  localStorage.setItem("chaos-form:a:v1", JSON.stringify({ answers: { name: "Local answer" }, language: "en" }));
  render(<RespondToForm shareId="a" />);
  expect(screen.getByText("This resume link is no longer valid.")).toBeInTheDocument();
  expect(screen.queryByText(/Local answer/)).not.toBeInTheDocument();
});

it("reloads the respondent session when private-link tokens change", () => {
  m.search = "resume=first";
  m.resumed = { answers: { name: "First answer" }, language: "en", version: 1 };
  const { rerender } = render(<RespondToForm shareId="a" />);
  expect(screen.getByText(/Answers:/)).toHaveTextContent("First answer");
  m.search = "resume=second";
  m.resumed = { answers: { name: "Second answer" }, language: "en", version: 1 };
  rerender(<RespondToForm shareId="a" />);
  expect(screen.getByText(/Answers:/)).toHaveTextContent("Second answer");
  expect(screen.getByText(/Answers:/)).not.toHaveTextContent("First answer");
});

it("changes form sessions and cancels the previous pending partial save", () => {
  sessionStorage.setItem("chaos-access-a", "grant-a");
  sessionStorage.setItem("chaos-access-b", "grant-b");
  const { rerender } = render(<RespondToForm shareId="a" />);
  fireEvent.click(screen.getByRole("button", { name: "Answer" }));
  rerender(<RespondToForm shareId="b" />);
  expect(screen.getByText(/Answers:/)).toHaveTextContent("{}");
  expect(m.queries).toHaveBeenCalledWith("respond:getPublicForm", expect.objectContaining({ shareId: "b", accessCode: "grant-b" }));
  act(() => vi.advanceTimersByTime(3000));
  expect(m.submit).not.toHaveBeenCalled();
});

it("cancels pending partial saves and clears the resume link on start over", async () => {
  const { unmount } = render(<RespondToForm shareId="a" />);
  fireEvent.click(screen.getByRole("button", { name: "Answer" }));
  unmount();
  act(() => vi.advanceTimersByTime(3000));
  expect(m.submit).not.toHaveBeenCalled();
  render(<RespondToForm shareId="a" />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue on another device" })));
  expect(screen.getByRole("textbox", { name: "Copy link" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start over" }));
  expect(screen.queryByRole("textbox", { name: "Copy link" })).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(3000));
  expect(m.submit).not.toHaveBeenCalled();
});

it("keeps the same edit token when a final submission is retried", async () => {
  m.submit.mockRejectedValueOnce(new Error("Network unavailable"));
  render(<RespondToForm shareId="a" />);
  fireEvent.click(screen.getByRole("button", { name: "Answer" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Submit" })));
  const token = m.submit.mock.calls[0][0].editToken;
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
  expect(m.submit).toHaveBeenCalledTimes(2);
  expect(m.submit.mock.calls[1][0].editToken).toBe(token);
  expect(screen.getByRole("textbox", { name: "Copy link" })).toHaveValue(`${window.location.origin}/f/a?edit=${token}`);
});

it("defers private-link lookups until the form access gate is open", () => {
  m.state = "code"; m.search = "resume=resume-a&edit=edit-a";
  render(<RespondToForm shareId="a" />);
  expect(screen.getByRole("textbox", { name: "Enter the access code" })).toBeInTheDocument();
  expect(m.queries).toHaveBeenCalledWith("respond:getResumeDraft", "skip");
  expect(m.queries).toHaveBeenCalledWith("respond:getSubmissionForEdit", "skip");
});
