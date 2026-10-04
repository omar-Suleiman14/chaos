import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import GamesPage from "@/components/live/GamesHub";
import ProductDemo from "@/components/site/ProductDemo";
import { LocaleProvider } from "@/lib/i18n";

const mocks = vi.hoisted(() => ({ create: vi.fn(), host: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/lib/analytics", () => ({ default: { capture: vi.fn() } }));
vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "forms:createForm" ? mocks.create : mocks.host,
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "forms:listMyForms"
    ? { owned: [{ _id: "draft", title: "Draft game", status: "draft", quizMode: true }, { _id: "ready", title: "Ready game", status: "live", quizMode: true, publishedVersion: 1 }], shared: [{ _id: "view-only", title: "View only game", status: "live", quizMode: true, publishedVersion: 1, role: "viewer" }] }
    : [],
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue("created-game");
  mocks.host.mockResolvedValue("created-room");
});

describe("discoverable game creation", () => {
  it("creates an Arabic quiz draft with the selected theme and opens the shared builder", async () => {
    render(<LocaleProvider initial="ar"><GamesPage /></LocaleProvider>);
    fireEvent.click(screen.getByRole("radio", { name: /مخمل/ }));
    fireEvent.click(screen.getByRole("button", { name: "أنشئ لعبة" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      quizMode: true, definition: { quiz: { enabled: true }, theme: { preset: "velvet" }, languages: ["ar"], defaultLanguage: "ar", fields: [{ type: "choice", label: "", options: [{ label: "Option 1" }, { label: "Option 2" }] }] },
    });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard/forms/created-game"));
    expect(mocks.host).not.toHaveBeenCalled();
  });

  it("offers hosting for a published quiz and sends drafts to editing", async () => {
    render(<LocaleProvider initial="en"><GamesPage /></LocaleProvider>);
    expect(screen.queryByText("View only game")).toBeNull();
    const draft = screen.getByText("Draft game").closest("article")!;
    expect(within(draft).queryByRole("button", { name: "Host live" })).toBeNull();
    expect(within(draft).getByRole("link", { name: /Finish & publish/ })).toHaveAttribute("href", "/dashboard/forms/draft");
    fireEvent.click(screen.getByRole("radio", { name: /Terracotta/ }));
    const ready = screen.getByText("Ready game").closest("article")!;
    fireEvent.click(within(ready).getByRole("button", { name: "Host live" }));
    await waitFor(() => expect(mocks.host).toHaveBeenCalledWith(expect.objectContaining({ formId: "ready", theme: expect.objectContaining({ preset: "terracotta" }) })));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard/live/created-room"));
  });
});

describe("landing experience", () => {
  it("keeps an answer when changing themes, advances, and supports going back", () => {
    render(<LocaleProvider initial="en"><ProductDemo /></LocaleProvider>);
    fireEvent.click(screen.getByRole("radio", { name: /A good conversation/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Midnight/ }));
    expect(screen.getByRole("radio", { name: /A good conversation/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.getByRole("heading", { name: "And who’s coming along?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous question" }));
    expect(screen.getByRole("radio", { name: /A good conversation/ })).toBeChecked();
  });

  it("plays a sample round and can reset without submitting real data", () => {
    render(<LocaleProvider initial="en"><ProductDemo /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Live game" }));
    fireEvent.click(screen.getByRole("button", { name: "Circle: Six" }));
    expect(screen.getByRole("heading", { name: "You got it!" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play it again" }));
    expect(screen.getByRole("heading", { name: "How many sides does a hexagon have?" })).toBeInTheDocument();
    expect(mocks.host).not.toHaveBeenCalled();
  });
});
