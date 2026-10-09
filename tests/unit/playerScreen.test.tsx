import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import PlayerScreen from "@/components/live/PlayerScreen";
import { LocaleProvider } from "@/lib/i18n";

const mocks = vi.hoisted(() => ({ view: {} as Record<string, unknown>, submit: vi.fn(), now: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/lib/haptics", () => ({ haptics: { medium: vi.fn(), select: vi.fn(), light: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/sfx", () => ({ sfx: { isEnabled: () => false, setEnabled: vi.fn(), play: vi.fn() } }));
vi.mock("convex/react", () => ({
  useConvexConnectionState: () => ({ isWebSocketConnected: true, hasEverConnected: true }),
  useQuery: (_ref: unknown, args: unknown) => args === "skip" ? undefined : mocks.view,
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "live:serverNow" ? mocks.now : mocks.submit,
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.now.mockImplementation(async () => Date.now());
  mocks.submit.mockResolvedValue({ status: "received" });
  localStorage.setItem("chaos-live-session", JSON.stringify({ gameId: "room", token: "a".repeat(32), pin: "123456" }));
  mocks.view = {
    state: "question", nickname: "Sam", questionCount: 3, questionIndex: 0, showAnswerLabels: true, theme: null,
    startedAt: Date.now(), endsAt: Date.now() + 20_000, answered: false, myAnswer: null,
    question: { text: "Which planet has the most prominent rings?", kind: "single", options: [{ id: "earth", label: "Earth" }, { id: "saturn", label: "Saturn" }, { id: "mars", label: "Mars" }, { id: "venus", label: "Venus" }] },
  };
});

describe("player answer controls", () => {
  it("locks an accepted answer until the server view catches up", async () => {
    render(<LocaleProvider initial="en"><PlayerScreen /></LocaleProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Diamond: Saturn" }));
    await screen.findByText("Answer saved");
    fireEvent.keyDown(window, { key: "1" });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("isolates a pending answer from the next question", async () => {
    let reject!: (error: Error) => void;
    mocks.submit.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const { rerender } = render(<LocaleProvider initial="en"><PlayerScreen /></LocaleProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Diamond: Saturn" }));
    mocks.view = { ...mocks.view, questionIndex: 1 };
    rerender(<LocaleProvider initial="en"><PlayerScreen /></LocaleProvider>);
    expect(screen.getByRole("button", { name: "Triangle: Earth" })).toBeEnabled();
    await act(async () => { reject(new Error("Old question failed")); });
    expect(screen.queryByText("Old question failed")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Triangle: Earth" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenLastCalledWith(expect.objectContaining({ questionIndex: 1 })));
  });

  it("does not mark the next question sent when an old answer succeeds", async () => {
    let accept!: (value: { status: string }) => void;
    mocks.submit.mockImplementationOnce(() => new Promise((resolve) => { accept = resolve; }));
    const { rerender } = render(<LocaleProvider initial="en"><PlayerScreen /></LocaleProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Diamond: Saturn" }));
    mocks.view = { ...mocks.view, questionIndex: 1 };
    rerender(<LocaleProvider initial="en"><PlayerScreen /></LocaleProvider>);
    await act(async () => { accept({ status: "received" }); });
    expect(screen.queryByText("Answer saved")).toBeNull();
    expect(screen.getByRole("button", { name: "Triangle: Earth" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Triangle: Earth" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenLastCalledWith(expect.objectContaining({ questionIndex: 1 })));
    await screen.findByText("Answer saved");
  });

  it("allows retrying a rejected answer", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("Connection interrupted"));
    render(<LocaleProvider initial="en"><PlayerScreen /></LocaleProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Diamond: Saturn" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry saved answer" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
  });

  it("renders question and answer markup as plain text", async () => {
    mocks.view.question = { text: '<img src=x onerror="alert(1)">', kind: "single", options: [{ id: "x", label: "<script>alert(1)</script>" }] };
    const { container } = render(<LocaleProvider initial="en"><PlayerScreen /></LocaleProvider>);
    await screen.findByRole("heading", { name: '<img src=x onerror="alert(1)">' });
    expect(screen.getByText("<script>alert(1)</script>")).toBeVisible();
    expect(container.querySelector("img[src='x'], script, [onerror]")).toBeNull();
  });

  it("shows every option on the phone and submits through keyboard shortcuts", async () => {
    render(<LocaleProvider initial="en"><PlayerScreen /></LocaleProvider>);
    await screen.findByRole("heading", { name: "Which planet has the most prominent rings?" });
    for (const label of ["Earth", "Saturn", "Mars", "Venus"]) expect(screen.getByText(label)).toBeVisible();
    fireEvent.keyDown(window, { key: "2" });
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith({ gameId: "room", token: "a".repeat(32), questionIndex: 0, optionIds: ["saturn"] }));
  });

  it("uses symbols only when the host explicitly turns off phone labels", async () => {
    mocks.view.showAnswerLabels = false;
    render(<LocaleProvider initial="en"><PlayerScreen /></LocaleProvider>);
    const saturn = await screen.findByRole("button", { name: "Diamond: Saturn" });
    expect(screen.queryByText("Saturn")).toBeNull();
    fireEvent.click(saturn);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ optionIds: ["saturn"] })));
  });

  it("keeps a multi-answer question pending until Submit is pressed", async () => {
    mocks.view.question = { ...(mocks.view.question as object), kind: "multi" };
    render(<LocaleProvider initial="en"><PlayerScreen /></LocaleProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Triangle: Earth" }));
    fireEvent.click(screen.getByRole("button", { name: "Diamond: Saturn" }));
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Diamond: Saturn" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ optionIds: ["earth", "saturn"] })));
  });
});


describe("live answer recovery", () => {
  it("backs up before sending and retries the same answer after a reload", async () => {
    let reject!: (error: Error) => void;
    mocks.submit.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const first = render(<LocaleProvider initial="en"><PlayerScreen /></LocaleProvider>);
    fireEvent.click(await screen.findByRole("button", {name:"Diamond: Saturn"}));
    expect(JSON.parse(localStorage.getItem("chaos-live-answer:room:0")!).optionIds).toEqual(["saturn"]);
    await act(async () => { reject(new Error("Offline")); });
    expect(screen.getByText("Saved on this device · waiting to send")).toBeVisible();
    first.unmount();
    render(<LocaleProvider initial="en"><PlayerScreen /></LocaleProvider>);
    await screen.findByText("Answer saved");
    expect(mocks.submit).toHaveBeenLastCalledWith(expect.objectContaining({questionIndex:0,optionIds:["saturn"]}));
    expect(localStorage.getItem("chaos-live-answer:room:0")).toBeNull();
  });
  it("does not send a saved answer after its question has closed", async () => {
    localStorage.setItem("chaos-live-answer:room:0", JSON.stringify({token:"a".repeat(32),questionIndex:0,optionIds:["saturn"]}));
    mocks.view = {...mocks.view,state:"reveal",correct:false,points:0,bonus:0,rank:1,score:0};
    render(<LocaleProvider initial="en"><PlayerScreen /></LocaleProvider>);
    await screen.findByText("Your saved answer could not reach the server before this question closed.");
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
