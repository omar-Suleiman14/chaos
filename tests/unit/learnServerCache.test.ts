// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";

// Next's request storage expects the server runtime's global AsyncLocalStorage.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");

// Unlike learnServer.test.ts, this keeps Next's real unstable_cache and drives it through an
// in-memory incremental cache, so it exercises the stale-while-revalidate behaviour the
// production cache has: a stale entry is served while it revalidates in the background, and a
// revalidation that throws leaves the stale entry in place.
const query = vi.hoisted(() => vi.fn());
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { query = query; } }));

type Entry = { value: unknown; at: number; revalidate: number };
class MemoryIncrementalCache {
  now = 0;
  entries = new Map<string, Entry>();
  async generateSimpleCacheKey(key: string) { return key; }
  async get(key: string) {
    const entry = this.entries.get(key);
    return entry ? { value: entry.value, isStale: this.now - entry.at >= entry.revalidate * 1000 } : null;
  }
  async set(key: string, value: { revalidate: number }) { this.entries.set(key, { value, at: this.now, revalidate: value.revalidate }); }
}

let incrementalCache: MemoryIncrementalCache;
/** One server request: its own work store, with background revalidations settled afterwards. */
async function request<T>(read: () => Promise<T>): Promise<T> {
  const store = { incrementalCache, pendingRevalidates: {} as Record<string, Promise<unknown>>, isDraftMode: false, isOnDemandRevalidate: false, route: "/learn" };
  const result = await workAsyncStorage.run(store as never, read);
  await Promise.all(Object.values(store.pendingRevalidates));
  return result;
}

const lesson = { lessonId: "lesson", ownerId: "owner", ownerName: "Creator", createdAt: 1, version: { number: 1, publishedAt: 10,
  metadata: { title: "Was public", description: "", tags: [], language: "en", indexing: "index" }, document: { schemaVersion: 1, blocks: [] } } };
const course = { id: "course", title: "Was public", lessons: [] };

beforeEach(() => {
  vi.resetModules();
  query.mockReset();
  incrementalCache = new MemoryIncrementalCache();
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("public Learn cache revocation", () => {
  it("stops serving a lesson once the backend no longer returns it", async () => {
    const { fetchPublicLessonResult } = await import("@/lib/learn/server");
    query.mockResolvedValue(lesson);
    expect(await request(() => fetchPublicLessonResult("lesson"))).toMatchObject({ lessonId: "lesson" });

    // The owner makes it private. Within the minute the cached copy may still be served.
    query.mockResolvedValue(null);
    incrementalCache.now = 61_000;
    // The first request after expiry gets the stale copy while the entry revalidates.
    await request(() => fetchPublicLessonResult("lesson"));
    // From then on it is gone, on every request.
    for (let i = 0; i < 3; i++) expect(await request(() => fetchPublicLessonResult("lesson"))).toBeNull();
  });

  it("stops serving a course and its lessons once they are no longer public", async () => {
    const { fetchPublicCourse, fetchCourseLesson } = await import("@/lib/learn/server");
    query.mockImplementation(async (_fn, args: { courseId: string; lessonId?: string }) => args.lessonId ? lesson : course);
    expect(await request(() => fetchPublicCourse("course"))).toMatchObject({ id: "course" });
    expect(await request(() => fetchCourseLesson("course", "lesson"))).toMatchObject({ lessonId: "lesson" });

    query.mockResolvedValue(null);
    incrementalCache.now = 61_000;
    await request(() => fetchPublicCourse("course"));
    await request(() => fetchCourseLesson("course", "lesson"));
    expect(await request(() => fetchPublicCourse("course"))).toBeNull();
    expect(await request(() => fetchCourseLesson("course", "lesson"))).toBeNull();
  });

  it("shows something published a moment ago despite a cached miss", async () => {
    const { fetchPublicLessonResult } = await import("@/lib/learn/server");
    query.mockResolvedValue(null);
    expect(await request(() => fetchPublicLessonResult("lesson"))).toBeNull();
    query.mockResolvedValue(lesson);
    expect(await request(() => fetchPublicLessonResult("lesson"))).toMatchObject({ lessonId: "lesson" });
  });

  it("keeps the last good copy while the backend is unreachable", async () => {
    const { fetchPublicLessonResult } = await import("@/lib/learn/server");
    query.mockResolvedValue(lesson);
    await request(() => fetchPublicLessonResult("lesson"));
    query.mockRejectedValue(new Error("network"));
    incrementalCache.now = 61_000;
    expect(await request(() => fetchPublicLessonResult("lesson"))).toMatchObject({ lessonId: "lesson" });
  });
});
