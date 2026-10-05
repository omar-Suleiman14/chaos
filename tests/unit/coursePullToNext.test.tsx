import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";

const course = { id: "c1", title: "CNS", lessons: [{ id: "l1", title: "Lecture 1: Spinal cord" }, { id: "l2", title: "Lecture 2: Brain stem" }], modules: [{ id: "m1", title: "Anatomy", lessonIds: ["l1", "l2"], assessments: [] }] };
vi.mock("convex/react", () => ({ useQuery: () => course, useMutation: () => vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/learn/data", () => ({ useLearnViewer: () => ({ signedIn: false }) }));
vi.mock("@/lib/learn/courseProgress", () => ({ useCourseProgress: () => ({}) }));
const { default: CourseNavigation } = await import("@/components/learn/reader/CourseNavigation");

let now = 0;
beforeEach(() => { vi.useFakeTimers(); now = 0; vi.spyOn(performance, "now").mockImplementation(() => now); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function mount() {
  // A page that is already scrolled to its end.
  const page = document.documentElement;
  Object.defineProperty(page, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(page, "clientHeight", { configurable: true, value: 1000 });
  render(<LocaleProvider initial="en"><CourseNavigation courseId="c1" lessonId="l1" completed={false} /></LocaleProvider>);
  const link = screen.getByRole("link", { name: /Up next/ });
  const click = vi.fn((e: Event) => e.preventDefault());
  link.addEventListener("click", click);
  return { link, click };
}
const wheel = (deltaY: number) => act(() => { fireEvent.wheel(window, { deltaY }); });

it("shows the next lesson with its module and opens it after a long pull past the end", () => {
  const { link, click } = mount();
  expect(link).toHaveTextContent("Up next · Anatomy");
  expect(link).toHaveTextContent("Lecture 2: Brain stem");
  wheel(40); // the first pull only marks the end as reached
  now = 500;
  for (let i = 0; i < 4; i++) wheel(60);
  expect(click).not.toHaveBeenCalled();
  for (let i = 0; i < 4; i++) wheel(60);
  act(() => { vi.advanceTimersByTime(300); });
  expect(click).toHaveBeenCalledTimes(1);
});

it("springs back when the pull stops early", () => {
  const { click } = mount();
  wheel(40); now = 500;
  for (let i = 0; i < 5; i++) wheel(60);
  act(() => { vi.advanceTimersByTime(300); });
  for (let i = 0; i < 3; i++) wheel(60);
  act(() => { vi.advanceTimersByTime(600); });
  expect(click).not.toHaveBeenCalled();
});
