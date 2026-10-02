import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PublicExplore from "@/components/site/PublicExplore";
import Link from "next/link";

const replace = vi.hoisted(() => vi.fn());
const params = vi.hoisted(() => ({ value: new URLSearchParams() }));
const search = vi.hoisted(() => vi.fn(() => [{ id: "lesson-1", ownerId: "author", ownerName: "Author", published: { meta: { title: "Published lesson", description: "Public description", tags: ["biology"] } } } ]));
const courses = [
  { id: "course-1", title: "Biology basics", description: "Cells", coverUrl: undefined, language: "en", tags: [], lessons: 2, updatedAt: 1 },
  { id: "course-2", title: "Arabic grammar", description: "", coverUrl: undefined, language: "ar", tags: [], lessons: 1, updatedAt: 1 },
];
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/learn", useSearchParams: () => params.value }));
vi.mock("convex/react", () => ({ useQuery: () => courses }));
// Personal progress deliberately has no mock: public browsing must not request it.
vi.mock("@/lib/learn/data", () => ({ usePublicLessons: search, useCurriculumNodes: () => [], isListed: () => true }));
vi.mock("@/components/learn/ui", () => ({ LessonCard: ({ lesson, href }: { lesson: { published: { meta: { title: string } } }; href: string }) => <Link href={href}>{lesson.published.meta.title}</Link>, EmptyState: () => null }));
vi.mock("@/components/workspace/Select", () => ({ Select: ({ label }: { label: string }) => <button>{label}</button> }));
vi.mock("@/lib/i18n", () => ({ useCopy: (copy: { en: unknown }) => copy.en }));
vi.mock("@/components/site/SiteChrome", () => ({ SiteNav: () => <nav>Explore</nav>, SiteFooter: () => <footer>Chaos</footer> }));

describe("public Explore", () => {
  it("lists courses and lessons together under one search, without a sign-in gate", () => {
    params.value = new URLSearchParams();
    render(<PublicExplore />);
    expect(screen.getByRole("link", { name: /Biology basics/ }).getAttribute("href")).toBe("/learn/courses/course-1");
    expect(screen.getByRole("link", { name: "Published lesson" }).getAttribute("href")).toBe("/learn/lesson-1");
    expect(screen.getByText("2 courses · 1 lesson")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "biology" } });
    expect(replace).toHaveBeenLastCalledWith("/learn?q=biology", { scroll: false });
    for (const label of ["Show", "Language", "Sort"]) expect(screen.getByRole("button", { name: label })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /sign in/i })).toBeNull();
  });

  it("filters courses by the same search words and by the Show choice", () => {
    params.value = new URLSearchParams("q=biology");
    const view = render(<PublicExplore />);
    expect(screen.getByRole("link", { name: /Biology basics/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Arabic grammar/ })).toBeNull();
    view.unmount();
    params.value = new URLSearchParams("kind=lessons");
    render(<PublicExplore />);
    expect(screen.queryByRole("link", { name: /Biology basics/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Published lesson" })).toBeTruthy();
  });
});
