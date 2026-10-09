import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import StudentOrbit from "@/components/card/StudentOrbit";

const state = vi.hoisted(() => ({ results: [] as { id: string; name: string; username: string; seed: string; style: number; context: null }[], status: "CanLoadMore", loadMore: vi.fn() }));
vi.mock("convex/react", () => ({ usePaginatedQuery: () => state, useQuery: vi.fn(), useMutation: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useLocale: () => ({ locale: "en" }) }));
vi.mock("@/components/card/useTilt", () => ({ useTilt: vi.fn() }));
vi.mock("@/components/MemberAvatar", () => ({ default: () => <span /> }));
vi.mock("@/components/site/SiteLink", () => ({ default: ({ prefetch: _prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props}>{props.children}</a> }));
beforeEach(() => {
  state.loadMore.mockClear();
  state.results = Array.from({ length: 60 }, (_, i) => ({ id: String(i), name: `Student ${i}`, username: `student-${i}`, seed: String(i), style: 0, context: null }));
  state.status = "CanLoadMore";
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());
it("virtualizes large classes and reveals later students when scrolling beside the card", () => {
  const view = render(<StudentOrbit username="teacher" />);
  expect(view.container.querySelectorAll(".student-orbit__card").length).toBeLessThan(60);
  expect(view.queryByRole("link", { name: "Student 58 @student-58" })).toBeNull();
  const left = view.container.querySelector<HTMLElement>('[data-side="0"]')!;
  fireEvent.scroll(left, { target: { scrollTop: 3500 } });
  expect(view.getByRole("link", { name: "Student 58 @student-58" })).toBeInTheDocument();
  expect(state.loadMore).toHaveBeenCalledWith(48);
  expect(view.container.querySelectorAll(".student-orbit__card").length).toBeLessThan(25);
});
it("continues through empty filtered pages instead of hiding later eligible students", () => {
  state.results = [];
  render(<StudentOrbit username="teacher" />);
  expect(state.loadMore).toHaveBeenCalledWith(48);
});
