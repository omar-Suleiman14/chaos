import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import CreatorLibrary from "@/components/library/CreatorLibrary";

const theme = { accent: "#3595e3", background: "plain", font: "sans", radius: "small" };
const form = (id: string, title: string, status: string) => ({
  _id: id, title, status, updatedAt: 1, responseCount: 0, quizMode: false, hasUnpublishedChanges: false, groupName: "", theme, presentation: "page", shareId: id,
});
const state = vi.hoisted(() => ({ forms: undefined as unknown }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/dashboard", useSearchParams: () => new URLSearchParams() }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => (getFunctionName(ref) === "forms:listMyForms" ? state.forms : undefined),
  useMutation: () => vi.fn(),
}));
vi.mock("@/lib/forms/useFormInventoryPages", () => ({
  useFormInventoryPages: () => ({ forms: state.forms, confirmed: state.forms !== undefined, hasMore: false, loadMore: vi.fn() }),
}));
vi.mock("@/lib/learn/data", () => ({ useLearnActions: () => ({ createLesson: vi.fn() }) }));
vi.mock("@/components/workspace/useCreateForm", () => ({ useCreateForm: () => ({ create: vi.fn(), busy: false }) }));
vi.mock("@/components/library/FormThumb", () => ({ default: () => null }));

const illustration = () => document.querySelector(".state-illustration");

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("chaos-library-view", "list");
  Element.prototype.scrollIntoView = vi.fn();
});

describe("library empty states", () => {
  it("shows no illustration while the library is still loading", () => {
    state.forms = undefined;
    render(<CreatorLibrary />);
    expect(screen.queryByRole("heading", { name: "Create your first form" })).toBeNull();
    expect(illustration()).toBeNull();
  });

  it("draws the creating illustration, decoratively, above the first-form prompt and its New menu", () => {
    state.forms = { owned: [], shared: [] };
    render(<CreatorLibrary />);
    expect(screen.getByRole("heading", { name: "Create your first form" })).toBeInTheDocument();
    expect(illustration()).toHaveAttribute("data-variant", "create");
    expect(illustration()).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByRole("button", { name: "Create something new" })).toHaveLength(2);
  });

  it("draws the no-results illustration when a filter hides everything, and clearing it brings the forms back", () => {
    state.forms = { owned: [form("a", "Beta survey", "live")], shared: [] };
    render(<CreatorLibrary />);
    expect(illustration()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filter by status" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Draft" }));
    expect(screen.getByRole("heading", { name: "Nothing matches" })).toBeInTheDocument();
    expect(illustration()).toHaveAttribute("data-variant", "search");
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(screen.getByRole("link", { name: /Beta survey/ })).toBeInTheDocument();
    expect(illustration()).toBeNull();
  });
});
