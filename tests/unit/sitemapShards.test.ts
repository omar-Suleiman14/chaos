// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const lessons = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/learn/server", () => ({
  listIndexableLessons: async () => Array.from({ length: lessons.count }, (_, i) => ({ id: `lesson${i}`, publishedAt: i })),
  listPublicCourses: async () => [{ id: "course1", updatedAt: 1 }],
}));
vi.mock("@/lib/docs/server", () => ({ listPublicDocs: async () => [{ slug: "first-form", updatedAt: 1 }] }));

describe("sitemap shards", () => {
  it("splits every URL into files of at most 50,000 and lists each in the index", async () => {
    lessons.count = 60_000;
    const { default: sitemap, generateSitemaps } = await import("@/app/sitemap");
    const shards = await generateSitemaps();
    expect(shards).toEqual([{ id: 0 }, { id: 1 }]);
    const files = await Promise.all(shards.map(({ id }) => sitemap({ id: Promise.resolve(String(id)) })));
    expect(files.map(f => f.length).every(n => n <= 50_000)).toBe(true);
    const urls = files.flat().map(e => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    // Nothing is dropped: every lesson, the course and the static pages are somewhere.
    expect(urls.filter(u => /\/learn\/lesson\d+$/.test(u))).toHaveLength(60_000);
    expect(urls.some(u => u.endsWith("/learn/courses/course1"))).toBe(true);
    expect(urls.some(u => u.endsWith("/pricing"))).toBe(true);
    const { GET } = await import("@/app/api/sitemap/route");
    const index = await (await GET()).text();
    expect(index).toContain("<sitemapindex");
    expect(index.match(/<loc>[^<]*\/sitemap\/\d+\.xml<\/loc>/g)).toHaveLength(2);
  });

  it("keeps a small site in one shard", async () => {
    lessons.count = 3;
    vi.resetModules();
    const { generateSitemaps } = await import("@/app/sitemap");
    expect(await generateSitemaps()).toEqual([{ id: 0 }]);
  });
});
