import { describe, expect, it, vi } from "vitest";
import { cachedVersionRead } from "../../convex/learnVersionCache";

describe("request-local lesson version memoization", () => {
  it("reads each distinct mapped version once within a query", async () => {
    const cache = new Map<string, { blocks: string[] } | null>();
    const load = vi.fn(async () => ({ blocks: ["first"] }));
    for (let i = 0; i < 20; i++) expect(await cachedVersionRead(cache, "same-version", load)).toEqual({ blocks: ["first"] });
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("caches missing versions but not failed reads", async () => {
    const cache = new Map<string, object | null>();
    const missing = vi.fn(async () => null);
    await cachedVersionRead(cache, "gone", missing);
    await cachedVersionRead(cache, "gone", missing);
    expect(missing).toHaveBeenCalledTimes(1);
    await expect(cachedVersionRead(cache, "broken", async () => { throw new Error("read failed"); })).rejects.toThrow("read failed");
    expect(cache.has("broken")).toBe(false);
  });
  it("does not share entries between requests", async () => {
    const load = vi.fn(async () => ({ visible: true }));
    await cachedVersionRead(new Map(), "version", load);
    await cachedVersionRead(new Map(), "version", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
