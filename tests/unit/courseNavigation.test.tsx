import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";

const course = {
  id: "c1", title: "CNS",
  lessons: [{ id: "l1", title: "Lecture 1: Spinal cord" }, { id: "l2", title: "Lecture 2: Brain stem" }, { id: "l3", title: "Lecture 3: Cerebellum" }],
  modules: [{ id: "m1", title: "Anatomy", lessonIds: ["l1", "l2", "l3"], assessments: [] }],
};
vi.mock("convex/react", () => ({ useQuery: () => course, useMutation: () => vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/learn/data", () => ({ useLearnViewer: () => ({ signedIn: false }) }));
vi.mock("@/lib/learn/courseProgress", () => ({ useCourseProgress: () => ({ l1: { completed: true } }) }));
const { default: CourseNavigation } = await import("@/components/learn/reader/CourseNavigation");
const { MobileOutline } = await import("@/components/learn/reader/Outline");

afterEach(() => { vi.useRealTimers(); });

const mount = (lessonId: string) => render(<LocaleProvider initial="en"><CourseNavigation courseId="c1" lessonId={lessonId} completed={false} /></LocaleProvider>);

it("shows previous and next lessons as a docs-style pager", () => {
  mount("l2");
  expect(screen.getByRole("link", { name: /Previous lesson/ })).toHaveAttribute("href", "/learn/l1?course=c1");
  const next = screen.getByRole("link", { name: /Next lesson/ });
  expect(next).toHaveTextContent("Next lesson · Anatomy");
  expect(next).toHaveTextContent("Lecture 3: Cerebellum");
  expect(next).toHaveAttribute("href", "/learn/l3?course=c1");
  expect(screen.getByText("1 / 3 lessons completed")).toBeInTheDocument();
});

it("leaves out the side that doesn't exist and never navigates on scroll", () => {
  mount("l1");
  expect(screen.queryByRole("link", { name: /Previous lesson/ })).not.toBeInTheDocument();
  const click = vi.fn((e: Event) => e.preventDefault());
  screen.getByRole("link", { name: /Next lesson/ }).addEventListener("click", click);
  for (let i = 0; i < 20; i++) fireEvent.wheel(window, { deltaY: 120 });
  expect(click).not.toHaveBeenCalled();
});

it("opens the lesson outline as a sheet and slides it away before closing", () => {
  vi.useFakeTimers();
  render(<LocaleProvider initial="en"><MobileOutline items={[{ id: "a", text: "Neurons", level: 2 }, { id: "b", text: "Myelin", level: 2 }]} active="b" /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: /On this page/ }));
  const sheet = screen.getByRole("dialog", { name: "Lesson outline" });
  act(() => { vi.advanceTimersByTime(20); });
  fireEvent.click(screen.getByRole("button", { name: "Close outline" }));
  expect(sheet).not.toHaveAttribute("data-shown");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(300); });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
