import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PublicExplore from "@/components/site/PublicExplore";
const backend = vi.hoisted(() => ({
  paginate: vi.fn(),
  loadMore: vi.fn(),
  create: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("convex/react", () => ({
  usePaginatedQuery: backend.paginate,
  useMutation: () => backend.create,
}));
vi.mock("@/lib/learn/data", () => ({
  useLearnViewer: () => ({ signedIn: false }),
}));
vi.mock("@/lib/i18n", () => ({ useLocale: () => ({ locale: "en" }) }));
vi.mock("@/components/site/SiteChrome", () => ({
 PrimaryCta: ({children, href}: {children: React.ReactNode; href: string}) => <a href={href}>{children}</a>,
  SiteNav: () => <nav>Explore</nav>,
  SiteFooter: () => <footer>Chaos</footer>,
}));
vi.mock("@/components/workspace/Select", () => ({
  Select: ({ label }: { label: string }) => <button>{label}</button>,
}));
const courses = [
  {
    id: "course-1",
    title: "Biology basics",
    description: "Cells",
    language: "en",
    tags: [],
    lessons: 2,
    ownerName: "Author",
    updatedAt: 1,
  },
];
describe("public course discovery", () => {
 it("keeps existing cards and the search input mounted while new results load",()=>{
  backend.paginate.mockReturnValue({results:courses,status:"Exhausted",loadMore:backend.loadMore});
  const {rerender}=render(<PublicExplore/>);
  const input=screen.getByRole("searchbox");
  const card=screen.getByRole("link",{name:/Biology basics/});
  backend.paginate.mockReturnValue({results:[],status:"LoadingFirstPage",loadMore:backend.loadMore});
  rerender(<PublicExplore/>);
  expect(screen.getByRole("searchbox")).toBe(input);
  expect(screen.getByRole("link",{name:/Biology basics/})).toBe(card);
  expect(screen.getByRole("status")).toHaveTextContent("Finding courses");
  expect(screen.queryByText("No matching courses")).toBeNull();
  backend.paginate.mockReturnValue({results:[],status:"Exhausted",loadMore:backend.loadMore});
  rerender(<PublicExplore/>);
  expect(screen.queryByRole("link",{name:/Biology basics/})).toBeNull();
  expect(screen.getByText("No matching courses")).toBeInTheDocument();
 });
  it("lists only courses and allows unsigned browsing with pagination", () => {
    backend.paginate.mockReturnValue({
      results: courses,
      status: "CanLoadMore",
      loadMore: backend.loadMore,
    });
    render(<PublicExplore />);
    expect(
      screen.getByRole("link", { name: /Biology basics/ }),
    ).toHaveAttribute("href", "/learn/courses/course-1");
    expect(screen.queryByRole("button", { name: /sign in/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create course" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load more courses" }));
    expect(backend.loadMore).toHaveBeenCalledWith(24);
  });
  it("debounces indexed search instead of navigating for every keystroke", async () => {
    backend.paginate.mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: backend.loadMore,
    });
    render(<PublicExplore />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "biology" },
    });
    await waitFor(() =>
      expect(backend.paginate).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ text: "biology", sort: "relevant" }),
        { initialNumItems: 24 },
      ),
    );
  });
});
