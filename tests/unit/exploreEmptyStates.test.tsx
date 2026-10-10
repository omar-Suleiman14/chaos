import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExploreBrowser, { type DirectoryCourse } from "@/components/learn/ExploreBrowser";

const page = vi.hoisted(() => ({ results: [] as unknown[], status: "Exhausted" as string, args: [] as unknown[] }));
vi.mock("convex/react", () => ({
  usePaginatedQuery: (_ref: unknown, args: unknown) => { page.args.push(args); return { results: page.results, status: page.status, loadMore: vi.fn() }; },
  useMutation: () => vi.fn(),
}));
vi.mock("@/lib/learn/data", () => ({ useLearnViewer: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/learn" }));

const course = { id: "c1", title: "Liver basics", description: "", lessons: 3, ownerName: "Mona", tags: [], coverUrl: undefined } as unknown as DirectoryCourse;
const art = () => document.querySelector(".state-illustration");

beforeEach(() => { page.results = []; page.status = "Exhausted"; page.args = []; window.history.replaceState(null, "", "/learn"); });

describe("Explore empty states", () => {
  it("never claims there is nothing while the first page loads, and shows the server's courses instead", () => {
    page.status = "LoadingFirstPage";
    render(<ExploreBrowser initial={[course]} />);
    expect(art()).toBeNull();
    expect(screen.queryByRole("heading", { name: /No (matching|public) courses/ })).toBeNull();
    expect(screen.getByText("Liver basics")).toBeInTheDocument();
  });

  it("draws the learning illustration, not a no-results one, when nothing is published and no filter is set", () => {
    render(<ExploreBrowser />);
    expect(screen.getByRole("heading", { level: 2, name: "No public courses yet" })).toBeInTheDocument();
    expect(art()).toHaveAttribute("data-variant", "learn");
    expect(art()).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button", { name: /Clear filters/ })).toBeNull();
  });

  it("draws the no-results illustration for a filtered search, with Clear filters bringing back the plain list", async () => {
    window.history.replaceState(null, "", "/learn?q=zzz");
    render(<ExploreBrowser />);
    expect(screen.getByRole("heading", { level: 2, name: "No matching courses" })).toBeInTheDocument();
    expect(art()).toHaveAttribute("data-variant", "search");
    expect(page.args.at(-1)).toMatchObject({ text: "zzz" });
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    // The search box debounces by 250ms before the query clears.
    await waitFor(() => expect(screen.queryByRole("button", { name: /Clear filters/ })).toBeNull());
    expect(page.args.at(-1)).toMatchObject({ text: undefined });
    expect(art()).toHaveAttribute("data-variant", "learn");
  });

  it("shows no illustration once courses are found", () => {
    page.results = [course];
    render(<ExploreBrowser />);
    expect(art()).toBeNull();
  });
});
