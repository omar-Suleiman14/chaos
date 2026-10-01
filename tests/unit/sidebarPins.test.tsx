import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import DashboardLayout from "@/app/dashboard/layout";

const forms = {
  owned: [
    { _id: "f1", title: "Application form", status: "live", theme: { accent: "#3595e3" } },
    { _id: "f2", title: "Event registration", status: "draft", theme: { accent: "#23875f" } },
  ],
  shared: [],
};
const intent = vi.hoisted(() => ({ warmForm: vi.fn() }));
const learnBackend = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), loadMore: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean | null }) => <a {...props} data-prefetch={prefetch === null ? "auto" : String(prefetch)} /> }));
vi.mock("@/lib/convexCache", () => ({
  formIntentHandlers: (id: string) => ({ onFocus: () => intent.warmForm(id), onPointerEnter: () => intent.warmForm(id), onTouchStart: () => intent.warmForm(id) }),
  useQuery: () => undefined,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/dashboard" }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ toggleTheme: vi.fn() }) }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isLoaded: false }), useClerk: () => ({ signOut: async () => {} }), UserButton: () => null }));
vi.mock("convex/react", () => ({
  useConvex: () => learnBackend,
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: true }),
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: learnBackend.loadMore }),
  useQueries: () => ({}),
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => (getFunctionName(ref) === "forms:listMyForms" ? forms : getFunctionName(ref) === "quizFunctions:getMyQuizzes" ? [] : undefined),
  useMutation: () => vi.fn(),
}));
vi.mock("@/components/workspace/useCreateForm", () => ({ useCreateForm: () => ({ create: vi.fn(), busy: false }) }));
vi.mock("@/components/NotificationBell", () => ({ default: () => null }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
});

describe("sidebar sections", () => {
  it("prefetches only an intended destination and preserves form focus handlers and link semantics", () => {
    const { container } = render(<DashboardLayout><p>Page</p></DashboardLayout>);
    const links = Array.from(container.querySelectorAll("a.ws-nav-item"));
    expect(links.length).toBeGreaterThan(2);
    for (const link of links) expect(link).toHaveAttribute("data-prefetch", "false");
    expect(intent.warmForm).not.toHaveBeenCalled();
    const docs = screen.getByRole("link", { name: "Docs" });
    fireEvent.mouseEnter(docs);
    expect(docs).toHaveAttribute("data-prefetch", "auto");
    const form = within(screen.getByRole("navigation", { name: "Recent" })).getByRole("link", { name: "Event registration" });
    fireEvent.focus(form);
    expect(form).toHaveAttribute("data-prefetch", "auto");
    expect(form).toHaveAttribute("href", "/dashboard/forms/f2");
    expect(intent.warmForm).toHaveBeenCalledExactlyOnceWith("f2");
    expect(learnBackend.mutation).not.toHaveBeenCalled();
    for (const link of links.filter((link) => link !== docs && link !== form)) expect(link).toHaveAttribute("data-prefetch", "false");
    const current = links.find((link) => link.getAttribute("aria-current") === "page")!;
    fireEvent.focus(current);
    expect(current).toHaveAttribute("data-prefetch", "false");
  });
  it("pins a form above Recent and remembers it", () => {
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

  it("folds Recent to the bottom and opens it again", () => {
    const { container } = render(<DashboardLayout><p>Page</p></DashboardLayout>);
    fireEvent.click(screen.getByRole("button", { name: "Recent, 2. Fold" }));
    expect(screen.queryByRole("navigation", { name: "Recent" })).toBeNull();
    const folded = screen.getByRole("button", { name: "Recent, 2. Open" });
    expect(folded).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector(".ws-sidebar__folded")).toContainElement(folded);
    fireEvent.click(folded);
    expect(screen.getByRole("navigation", { name: "Recent" })).toBeInTheDocument();
  });
});
