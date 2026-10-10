import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPublicLesson, listIndexableLessons, listPublicCourses } from "@/lib/learn/server";

const query = vi.hoisted(() => vi.fn());
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { query = query; } }));
// Outside a Next request there is no data cache; read straight through.
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn }));
beforeEach(() => { query.mockReset(); vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud"); vi.stubEnv("VERCEL_ENV", "production"); });
afterEach(() => vi.unstubAllEnvs());

describe("published Learn server metadata", () => {
  it("uses the compact published summary for SEO without downloading the lesson document", async () => {
    query.mockResolvedValue({ lessonId: "lesson", ownerName: "Creator", version: 2, publishedAt: 10,
      metadata: { title: "Published", description: "", tags: [], language: "en", indexing: "index" },
      outline: [{ id: "heading", level: 2, text: "Portal pressure" }] });
    const lesson = await fetchPublicLesson("lesson");
    expect(lesson?.published?.meta.title).toBe("Published");
    expect(lesson?.published?.outline).toEqual([{ id: "heading", level: 2, text: "Portal pressure" }]);
    expect(query).toHaveBeenCalledWith(expect.anything(), { id: "lesson" });
  });
  it("does not infer indexing consent for legacy metadata", async () => {
    query.mockResolvedValue({ lessonId: "lesson", ownerName: "Creator", version: 1, publishedAt: 10,
      metadata: { title: "Legacy", description: "", tags: [], language: "en" }, outline: [] });
    expect((await fetchPublicLesson("lesson"))?.published?.meta.indexing).toBe("noindex");
  });
  it("keeps unavailable lessons absent and preview lessons out of sitemap discovery", async () => {
    query.mockResolvedValue(null);
    expect(await fetchPublicLesson("private")).toBeNull();
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await listIndexableLessons()).toEqual([]);
    // The cached miss is confirmed with one live read, so a fresh publication shows at once.
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("follows filtered empty pages and bounds discovery work", async () => {
    query.mockResolvedValueOnce({ page: [], isDone: false, continueCursor: "next" })
      .mockResolvedValueOnce({ page: [{ lessonId: "public", publishedAt: 10 }], isDone: true, continueCursor: "done" });
    expect(await listIndexableLessons()).toEqual([{ id: "public", publishedAt: 10 }]);
    expect(query.mock.calls[1][1].paginationOpts.cursor).toBe("next");
    // Empty filtered pages never end discovery early; only the runaway-loop bound does, and it is logged.
    query.mockReset().mockResolvedValue({ page: [], isDone: false, continueCursor: "next" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await listIndexableLessons();
    expect(query).toHaveBeenCalledTimes(20_000);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("lesson discovery stopped"));
    error.mockRestore();
  });
  it("lists every public course across pages, not just the newest hundred", async () => {
    query.mockResolvedValueOnce({ page: Array.from({ length: 100 }, (_, i) => ({ id: `c${i}`, updatedAt: i })), isDone: false, continueCursor: "p2" })
      .mockResolvedValueOnce({ page: [{ id: "c100", updatedAt: 100 }], isDone: true, continueCursor: "done" });
    const courses = await listPublicCourses();
    expect(courses).toHaveLength(101);
    expect(query.mock.calls[1][1].paginationOpts.cursor).toBe("p2");
  });
});
