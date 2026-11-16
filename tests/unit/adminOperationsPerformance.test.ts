import { describe, expect, it, vi } from "vitest";
import { memoizeCourseTitles } from "../../convex/adminOperationsReadMemo";
import { mapBounded } from "../../convex/adminAnalyticsConcurrency";

describe("admin operations per-page title cache", () => {
  it("shares in-flight reads for repeated course IDs and preserves title output", async () => {
    const read = vi.fn(async (id: string) => `Course ${id}`);
    const title = memoizeCourseTitles(read);
    expect(await Promise.all([title("one"), title("one"), title("two"), title("one")]))
      .toEqual(["Course one", "Course one", "Course two", "Course one"]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not keep stale course names across requests", async () => {
    const read = vi.fn()
      .mockResolvedValueOnce("Original title")
      .mockResolvedValueOnce("Renamed title");
    expect(await memoizeCourseTitles(read)("course")).toBe("Original title");
    expect(await memoizeCourseTitles(read)("course")).toBe("Renamed title");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("never hides a failing lookup", async () => {
    const title = memoizeCourseTitles(async () => { throw new Error("course read denied"); });
    await expect(title("course")).rejects.toThrow("course read denied");
    await expect(title("course")).rejects.toThrow("course read denied");
  });
});

describe("bounded admin analytics reads", () => {
  it("preserves page order while restricting parallel readers to six", async () => {
    let active = 0, peak = 0;
    const values = Array.from({ length: 50 }, (_, i) => i);
    const result = await mapBounded(values, 6, async value => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      await Promise.resolve();
      active--;
      return value * 3;
    });
    expect(result).toEqual(values.map(value => value * 3));
    expect(peak).toBe(6);
    expect(active).toBe(0);
  });

  it("rejects failed reads and waits for remaining workers to settle", async () => {
    let active = 0;
    await expect(mapBounded([1, 2, 3, 4], 2, async value => {
      active++;
      try {
        await Promise.resolve();
        if (value === 2) throw new Error("count lookup failed");
        return value;
      } finally {
        active--;
      }
    })).rejects.toThrow("count lookup failed");
    expect(active).toBe(0);
  });

  it("rejects invalid concurrency limits and accepts empty pages", async () => {
    await expect(mapBounded([1], 0, async value => value)).rejects.toThrow("INVALID_CONCURRENCY");
    await expect(mapBounded([1], 51, async value => value)).rejects.toThrow("INVALID_CONCURRENCY");
    await expect(mapBounded([], 6, async value => value)).resolves.toEqual([]);
  });
});
