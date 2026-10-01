import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicCourses from "@/components/courses/PublicCourses";

const query = vi.hoisted(() => vi.fn());
vi.mock("convex/react", () => ({ useQuery: query }));
vi.mock("@/lib/i18n", () => ({ useCopy: (copy: { en: unknown }) => copy.en }));
afterEach(() => { cleanup(); query.mockReset(); });

describe("public course directory", () => {
  it("keeps the directory visible while loading and when no courses are published", () => {
    query.mockReturnValue(undefined);
    const view = render(<PublicCourses />);
    expect(screen.getByRole("status").textContent).toBe("Loading courses…");
    expect(screen.getByRole("region", { name: "Free courses" }).getAttribute("aria-busy")).toBe("true");
    query.mockReturnValue([]);
    view.rerender(<PublicCourses />);
    expect(screen.getByRole("status").textContent).toContain("No public courses yet");
    expect(screen.getByRole("region", { name: "Free courses" }).getAttribute("aria-busy")).toBe("false");
  });

  it("links published courses without claiming that their content is complete", () => {
    query.mockReturnValue([{ id: "course-1", title: "Biology", description: "Cells and tissues", lessons: 2 }]);
    render(<PublicCourses />);
    expect(screen.getByRole("link", { name: /Biology/ }).getAttribute("href")).toBe("/learn/courses/course-1");
    expect(screen.getByText("2 lessons")).toBeTruthy();
    expect(screen.queryByText(/complete courses/i)).toBeNull();
  });
});
