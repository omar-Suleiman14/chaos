import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PublicExplore from "@/components/site/PublicExplore";
import Link from "next/link";

const replace = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => vi.fn(() => [{ id: "lesson-1", ownerId: "author", ownerName: "Author", published: { meta: { title: "Published lesson", description: "Public description", tags: ["biology"] } } } ]));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/learn", useSearchParams: () => new URLSearchParams() }));
// Personal progress deliberately has no mock: public browsing must not request it.
vi.mock("@/lib/learn/data", () => ({ usePublicLessons: search, useCurriculumNodes: () => [], isListed: () => true }));
vi.mock("@/components/learn/ui", () => ({ LessonCard: ({ lesson, href }: { lesson: { published: { meta: { title: string } } }; href: string }) => <Link href={href}>{lesson.published.meta.title}</Link>, EmptyState: () => null }));
vi.mock("@/components/workspace/Select", () => ({ Select: ({ label }: { label: string }) => <button>{label}</button> }));
vi.mock("@/lib/i18n", () => ({ useCopy: (copy: { en: unknown }) => copy.en }));
vi.mock("@/components/site/SiteChrome", () => ({ SiteNav: () => <nav>Explore</nav>, SiteFooter: () => <footer>Chaos</footer> }));
// Plain anchor intentionally isolates the course component's navigation contract.
// eslint-disable-next-line @next/next/no-html-link-for-pages
vi.mock("@/components/courses/PublicCourses", () => ({ default: () => <a href="/learn/courses/course-1">Public course</a> }));

describe("public Explore", () => {
  it("offers native public courses and topic search without a sign-in gate", () => {
    render(<PublicExplore />);
    expect(screen.getByRole("link", { name: "Public course" }).getAttribute("href")).toBe("/learn/courses/course-1");
    expect(screen.getByRole("link", { name: "Published lesson" }).getAttribute("href")).toBe("/learn/lesson-1");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "biology" } });
    expect(replace).toHaveBeenLastCalledWith("/learn?q=biology", { scroll: false });
    expect(screen.getByRole("button", { name: "Language" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sort" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /sign in/i })).toBeNull();
  });
});
