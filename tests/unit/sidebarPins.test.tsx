import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import DashboardLayout from "@/app/[lang]/(app)/dashboard/layout";

const forms = {
  owned: [
    { _id: "f1", title: "Application form", status: "live", theme: { accent: "#3595e3" } },
    { _id: "f2", title: "Event registration", status: "draft", theme: { accent: "#23875f" } },
    { _id: "archived", title: "Archived form", status: "archived", theme: { accent: "#23875f" } },
  ],
  shared: [],
};
const intent = vi.hoisted(() => ({ warmForm: vi.fn() }));
const learnBackend = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), loadMore: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean | null }) => <a {...props} data-prefetch={prefetch === null ? "auto" : String(prefetch)} /> }));
vi.mock("@/lib/convexCache", () => ({
  formIntentHandlers: (id: string) => ({ onFocus: () => intent.warmForm(id), onPointerEnter: () => intent.warmForm(id), onTouchStart: () => intent.warmForm(id) }),
  // The shell reads its lists through lib/confirmedQuery, which uses this useQuery.
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => liveQuery(ref),
}));
const courses = [{ id: "course1", title: "Night sky course", description: "", lessons: 2, visibility: "public", published: true, updatedAt: 1, archived: false }];
const games: { _id: string; title: string; formId: string; state: string; createdAt: number }[] = [];
function liveQuery(ref: Parameters<typeof getFunctionName>[0]) {
  const name = getFunctionName(ref);
  return name === "forms:listMyForms" ? forms : name === "quizFunctions:getMyQuizzes" ? [] : name === "courses:listMine" ? courses : name === "live:myGames" ? games : undefined;
}
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/dashboard" }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ toggleTheme: vi.fn() }) }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isLoaded: false, userId: null }), useUser: () => ({ isLoaded: false }), useClerk: () => ({ signOut: async () => {} }), UserButton: () => null }));
vi.mock("convex/react", () => ({
  useConvex: () => learnBackend,
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: true }),
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: learnBackend.loadMore }),
  useQueries: () => ({}),
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => liveQuery(ref),
  useMutation: () => vi.fn(),
}));
vi.mock("@/components/workspace/useCreateForm", () => ({ useCreateForm: () => ({ create: vi.fn(), busy: false }) }));
vi.mock("@/components/NotificationBell", () => ({ default: () => null }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  games.length = 0;
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
});

const openRecent = () => localStorage.setItem("chaos.ui.sidebar-open", JSON.stringify({ Recent: true }));

describe("sidebar sections", () => {
  it("hides archived pinned forms and their live-game sessions from Recent", () => {
    localStorage.setItem("chaos.ui.pinned", JSON.stringify(["archived"]));
    games.push({ _id: "old-game", title: "Archived game", formId: "archived", state: "ended", createdAt: 2 });
    render(<DashboardLayout><p>Page</p></DashboardLayout>);
    expect(screen.queryByRole("link", { name: "Archived form" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Archived game" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Pinned" })).toBeNull();
  });
  it("prefetches visible destinations and prioritizes an intended destination and preserves form focus handlers and link semantics", () => {
    openRecent();
    const { container } = render(<DashboardLayout><p>Page</p></DashboardLayout>);
    // Docs, Connections and Admin live in the account menu now; the sidebar keeps Library, Saved and Recents.
    expect(screen.queryByRole("link", { name: "Docs" })).toBeNull();
    const links = Array.from(container.querySelectorAll("a.ws-nav-item"));
    expect(links.length).toBeGreaterThan(2);
    // Main destinations prefetch whole pages at once (eager); Recent waits for intent.
    const expected = (link: Element) => (link.getAttribute("aria-current") === "page" ? "false" : link.closest('nav[aria-label="Recent"]') ? "auto" : "true");
    for (const link of links) expect(link).toHaveAttribute("data-prefetch", expected(link));
    expect(intent.warmForm).not.toHaveBeenCalled();
    const docs = screen.getByRole("link", { name: "Saved" });
    fireEvent.mouseEnter(docs);
    expect(docs).toHaveAttribute("data-prefetch", "true");
    const form = within(screen.getByRole("navigation", { name: "Recent" })).getByRole("link", { name: "Event registration" });
    fireEvent.focus(form);
    expect(form).toHaveAttribute("data-prefetch", "true");
    expect(form).toHaveAttribute("href", "/dashboard/forms/f2");
    expect(intent.warmForm).toHaveBeenCalledExactlyOnceWith("f2");
    expect(learnBackend.mutation).not.toHaveBeenCalled();
    for (const link of links.filter((link) => link !== docs && link !== form)) expect(link).toHaveAttribute("data-prefetch", expected(link));
    const current = links.find((link) => link.getAttribute("aria-current") === "page")!;
    fireEvent.focus(current);
    expect(current).toHaveAttribute("data-prefetch", "false");
  });
  it("pins a form above Recent and remembers it", () => {
    openRecent();
    render(<DashboardLayout><p>Page</p></DashboardLayout>);
    expect(screen.queryByRole("navigation", { name: "Pinned" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pin Event registration" }));
    const pinned = screen.getByRole("navigation", { name: "Pinned" });
    expect(within(pinned).getByRole("link", { name: /Event registration/ })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Recent" })).queryByRole("link", { name: /Event registration/ })).toBeNull();
    expect(JSON.parse(localStorage.getItem("chaos.ui.pinned")!)).toEqual(["f2"]);
    fireEvent.click(screen.getByRole("button", { name: "Unpin Event registration" }));
    expect(screen.queryByRole("navigation", { name: "Pinned" })).toBeNull();
  });

  it("pins a course like a form", () => {
    openRecent();
    render(<DashboardLayout><p>Page</p></DashboardLayout>);
    fireEvent.click(screen.getByRole("button", { name: "Pin Night sky course" }));
    const pinned = screen.getByRole("navigation", { name: "Pinned" });
    expect(within(pinned).getByRole("link", { name: /Night sky course/ })).toHaveAttribute("href", "/dashboard/courses/course1");
    expect(within(screen.getByRole("navigation", { name: "Recent" })).queryByRole("link", { name: /Night sky course/ })).toBeNull();
    expect(JSON.parse(localStorage.getItem("chaos.ui.pinned")!)).toEqual(["course1"]);
  });

  it("keeps Recent closed by default and remembers it open", () => {
    const first = render(<DashboardLayout><p>Page</p></DashboardLayout>);
    expect(screen.queryByRole("navigation", { name: "Recent" })).toBeNull();
    const toggle = screen.getByRole("button", { name: "Recent, 3. Open" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("navigation", { name: "Recent" })).toBeInTheDocument();
    first.unmount();
    render(<DashboardLayout><p>Page</p></DashboardLayout>);
    expect(screen.getByRole("navigation", { name: "Recent" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recent, 3. Fold" }));
    expect(screen.queryByRole("navigation", { name: "Recent" })).toBeNull();
  });

  it("keeps Library and Saved out of the scrolling Recent area", () => {
    openRecent();
    const { container } = render(<DashboardLayout><p>Page</p></DashboardLayout>);
    const recents = container.querySelector(".ws-recents")!;
    expect(recents).toContainElement(screen.getByRole("navigation", { name: "Recent" }));
    expect(recents).not.toContainElement(screen.getByRole("link", { name: "Saved" }));
  });
});
