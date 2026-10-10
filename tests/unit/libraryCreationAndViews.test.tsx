import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import CreatorLibrary from "@/components/library/CreatorLibrary";

const state = vi.hoisted(() => ({ tab: "forms", push: vi.fn(), replace: vi.fn(), create: vi.fn(), capture: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push, replace: state.replace }), usePathname: () => "/dashboard", useSearchParams: () => new URLSearchParams(state.tab ? `tab=${state.tab}` : "") }));
vi.mock("@/lib/analytics", () => ({ default: { capture: state.capture } }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === "forms:listMyForms") return { owned: [], shared: [] };
    if (name === "forms:listTemplates") return { builtIn: [], own: [] };
    return [];
  },
  useMutation: () => state.create,
}));
vi.mock("@/lib/forms/useFormInventoryPages", () => ({
  useFormInventoryPages: () => ({ forms: { owned: [], shared: [] }, confirmed: true, hasMore: false, loadMore: vi.fn() }),
}));
vi.mock("@/lib/learn/data", () => ({ useLearnActions: () => ({ createFlashcardSet: state.create }) }));
vi.mock("@/components/learn/FlashcardsHub", () => ({ default: ({ view }: { view: string }) => <div data-testid="hub" data-view={view}>Flashcards</div> }));
vi.mock("@/components/courses/CoursesHub", () => ({ default: ({ view }: { view: string }) => <div data-testid="hub" data-view={view}>Courses</div> }));
vi.mock("@/components/live/GamesHub", () => ({ default: ({ view }: { view: string }) => <div data-testid="hub" data-view={view}>Games</div> }));
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); state.create.mockResolvedValue("created"); state.capture.mockReset(); });

it.each(["forms", "quizzes", "flashcards", "courses"])("offers the saved list/grid preference on the %s tab", async tab => {
  state.tab = tab;
  render(<CreatorLibrary />);
  fireEvent.click(screen.getByRole("button", { name: "View options" }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: "List" }));
  expect(localStorage.getItem("chaos-library-view")).toBe("list");
  if (["flashcards", "courses", "games"].includes(tab)) expect(screen.getByTestId("hub")).toHaveAttribute("data-view", "list");
});

it.each([
  ["forms", "Form", "/dashboard/forms/created"],
  ["quizzes", "Quiz", "/dashboard/forms/created"],
  ["flashcards", "Flashcard set", "/dashboard/learn/flashcards/created?mode=edit"],
  ["courses", "Course", "/dashboard/courses/created"],
  ["games", "Quiz", "/dashboard/forms/created"],
])("opens a newly created item from the %s tab", async (tab, label, href) => {
  state.tab = tab;
  state.capture.mockImplementation(() => { throw new Error("Analytics unavailable"); });
  render(<CreatorLibrary />);
  fireEvent.click(screen.getAllByRole("button", { name: "Create something new" })[0]);
  fireEvent.click(screen.getByRole("menuitem", { name: new RegExp(`^${label}`) }));
  await waitFor(() => expect(state.push).toHaveBeenCalledWith(href));
  expect(state.create).toHaveBeenCalledOnce();
});

it("keeps Games without a library view control", () => { state.tab = "games"; render(<CreatorLibrary />); expect(screen.queryByRole("button", { name: "View options" })).toBeNull(); expect(screen.queryByRole("textbox", { name: "Search library" })).toBeNull(); });

it("remembers the selected tab when Library is reopened without a tab in its address", () => {
  state.tab = "flashcards";
  const view = render(<CreatorLibrary />);
  expect(localStorage.getItem("chaos-library-tab")).toBe("flashcards");
  view.unmount();
  state.tab = "";
  render(<CreatorLibrary />);
  expect(screen.getByRole("tab", { name: "Flashcards" })).toHaveAttribute("aria-selected", "true");
});
it("lets an explicit tab link override the remembered tab and remembers Forms too", () => {
  localStorage.setItem("chaos-library-tab", "courses");
  state.tab = "forms";
  render(<CreatorLibrary />);
  expect(screen.getByRole("tab", { name: "Forms" })).toHaveAttribute("aria-selected", "true");
  expect(localStorage.getItem("chaos-library-tab")).toBe("forms");
  fireEvent.click(screen.getByRole("tab", { name: "Courses" }));
  expect(localStorage.getItem("chaos-library-tab")).toBe("courses");
  expect(state.replace).toHaveBeenCalledWith("/dashboard?tab=courses", { scroll: false });
});
