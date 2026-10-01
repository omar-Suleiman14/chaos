import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PublicExplore from "@/components/site/PublicExplore";

const search = vi.hoisted(() => vi.fn(() => [{ id: "lesson-1", ownerName: "Author", published: { meta: { title: "Published lesson", description: "Public description" } } } ]));
vi.mock("@/lib/learn/data", () => ({ usePublicLessons: search, isListed: () => true }));
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
    expect(search).toHaveBeenLastCalledWith({ q: "biology" });
    expect(screen.queryByRole("button", { name: /sign in/i })).toBeNull();
  });
});
