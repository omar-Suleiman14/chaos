import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import GamesPage from "@/components/live/GamesHub";
import { LocaleProvider } from "@/lib/i18n";

const mocks = vi.hoisted(() => ({ create: vi.fn(), host: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/lib/analytics", () => ({ default: { capture: vi.fn() } }));
vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "forms:createForm" ? mocks.create : mocks.host,
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "live:myGames"
    ? [
      { _id: "room-live", title: "Friday quiz", state: "question", createdAt: Date.now() - 60_000, endedAt: null, formId: "ready", quizId: null, questionCount: 5, players: 12, savedResponses: 0 },
      { _id: "room-done", title: "Monday quiz", state: "ended", createdAt: Date.now() - 86_400_000, endedAt: Date.now() - 80_000_000, formId: "ready", quizId: null, questionCount: 1, players: 3, savedResponses: 3 },
    ]
    : getFunctionName(ref) === "forms:listMyForms"
    ? { owned: [{ _id: "draft", title: "Draft game", status: "draft", quizMode: true }, { _id: "ready", title: "Ready game", status: "live", quizMode: true, publishedVersion: 1 }, { _id: "archived", title: "Archived game", status: "archived", quizMode: true, publishedVersion: 1 }], shared: [{ _id: "editor", title: "Shared editable game", status: "live", quizMode: true, publishedVersion: 1, role: "editor" }, { _id: "viewer", title: "View-only game", status: "live", quizMode: true, publishedVersion: 1, role: "viewer" }] }
    : [{ _id: "legacy", title: "Older game", isPublished: true }],
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue("new-game");
  mocks.host.mockResolvedValue("new-room");
});

describe("Games workspace", () => {
  it("creates a Paper draft directly without creating a live room", async () => {
    render(<LocaleProvider initial="en"><GamesPage /></LocaleProvider>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Games");
    fireEvent.click(screen.getByRole("button", { name: "Create a game" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ quizMode: true, definition: expect.objectContaining({ theme: expect.objectContaining({ preset: "paper" }), quiz: { enabled: true }, fields: [] }) })));
    expect(mocks.host).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/forms/new-game");
  });

  it("hosts with Apple styling by default and sends the selected phone/timer settings", async () => {
    render(<LocaleProvider initial="en"><GamesPage /></LocaleProvider>);
    expect(screen.getByRole("radio", { name: "Flow (default)" })).toBeChecked();
    fireEvent.click(screen.getByRole("combobox", { name: "Time per question" }));
    fireEvent.click(screen.getByRole("option", { name: "60 seconds" }));
    fireEvent.click(screen.getByRole("switch", { name: "Show answers on phones" }));
    fireEvent.click(within(screen.getByText("Ready game").closest("article")!).getByRole("button", { name: "Host live" }));
    await waitFor(() => expect(mocks.host).toHaveBeenCalledWith({ formId: "ready", language: "en", timeLimitSec: 60, showAnswerLabels: false }));
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/live/new-room");
  });

  it("applies an explicit override to older games, and can return to Apple styling", async () => {
    render(<LocaleProvider initial="en"><GamesPage /></LocaleProvider>);
    fireEvent.click(screen.getByRole("radio", { name: "Terracotta" }));
    fireEvent.click(within(screen.getByText("Older game").closest("article")!).getByRole("button", { name: "Host live" }));
    await waitFor(() => expect(mocks.host).toHaveBeenCalledWith(expect.objectContaining({ quizId: "legacy", timeLimitSec: 20, showAnswerLabels: true, theme: expect.objectContaining({ preset: "terracotta" }) })));
    fireEvent.click(screen.getByRole("radio", { name: "Flow (default)" }));
    fireEvent.click(within(screen.getByText("Shared editable game").closest("article")!).getByRole("button", { name: "Host live" }));
    await waitFor(() => expect(mocks.host).toHaveBeenLastCalledWith({ formId: "editor", language: "en", timeLimitSec: 20, showAnswerLabels: true }));
  });

  it("keeps viewers and archived games out of hosting and separates drafts from ready quizzes", () => {
    render(<LocaleProvider initial="en"><GamesPage /></LocaleProvider>);
    expect(screen.queryByText("View-only game")).toBeNull();
    expect(screen.queryByText("Archived game")).toBeNull();
    fireEvent.click(screen.getByText("Drafts"));
    const drafts = screen.getByRole("region", { name: "Drafts" });
    expect(within(drafts).getByText("Draft game")).toBeInTheDocument();
    expect(within(drafts).queryByRole("button", { name: "Host live" })).toBeNull();
    expect(within(drafts).getByRole("link", { name: /Finish & publish/ })).toHaveAttribute("href", "/dashboard/forms/draft");
    expect(within(screen.getByRole("region", { name: "Ready to host" })).getAllByRole("button", { name: "Host live" })).toHaveLength(3);
  });

  it("labels creation and session settings in Arabic", async () => {
    render(<LocaleProvider initial="ar"><GamesPage /></LocaleProvider>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("الألعاب");
    expect(screen.getByRole("switch", { name: "اعرض الإجابات على الهواتف" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "مخمل" }));
    fireEvent.click(screen.getByRole("button", { name: "أنشئ لعبة" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ definition: expect.objectContaining({ defaultLanguage: "ar", languages: ["ar"], theme: expect.objectContaining({ preset: "velvet" }) }) })));
  });
  it("lists past games: rejoin a running one, open results of an ended one", () => {
    render(<LocaleProvider initial="en"><GamesPage /></LocaleProvider>);
    fireEvent.click(screen.getByText("History"));
    const history = screen.getByRole("region", { name: "History" });
    expect(within(within(history).getByText("Friday quiz").closest("article")!).getByRole("link", { name: "Open" })).toHaveAttribute("href", "/dashboard/live/room-live");
    const done = within(history).getByText("Monday quiz").closest("article")!;
    expect(done).toHaveTextContent("Ended");
    expect(within(done).getByRole("link", { name: "Results" })).toHaveAttribute("href", "/dashboard/forms/ready/responses");
  });
});
