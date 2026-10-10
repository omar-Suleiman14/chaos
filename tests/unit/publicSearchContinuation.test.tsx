import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const search = vi.hoisted(() => ({ status: "CanLoadMore", results: [] as { lessonId: string }[], loadMore: vi.fn() }));
vi.mock("convex/react", async importOriginal => ({ ...await importOriginal<typeof import("convex/react")>(), usePaginatedQuery: () => search }));
vi.mock("@/lib/convexCache", () => ({ useQuery: () => undefined }));
import { usePublicLessons } from "../../lib/learn/data";

beforeEach(() => { search.status = "CanLoadMore"; search.results = []; search.loadMore.mockClear(); });
it("continues filtered search pages until the existing twenty-result window fills", () => {
  const hook = renderHook(() => usePublicLessons({ q: "Synthetic" }));
  expect(search.loadMore).toHaveBeenCalledExactlyOnceWith(20);
  search.status = "LoadingMore";
  hook.rerender();
  expect(search.loadMore).toHaveBeenCalledTimes(1);
  search.status = "CanLoadMore";
  search.results = [{ lessonId: "synthetic" }];
  hook.rerender();
  expect(search.loadMore).toHaveBeenCalledTimes(2);
  search.results = Array.from({ length: 20 }, (_, i) => ({ lessonId: `synthetic-${i}` }));
  hook.rerender();
  expect(search.loadMore).toHaveBeenCalledTimes(2);
});
it("does not request extra pages after exhaustion or without a search", () => {
  search.status = "Exhausted";
  renderHook(() => usePublicLessons({ q: "Synthetic" }));
  expect(search.loadMore).not.toHaveBeenCalled();
  search.status = "CanLoadMore";
  renderHook(() => usePublicLessons());
  expect(search.loadMore).not.toHaveBeenCalled();
});
