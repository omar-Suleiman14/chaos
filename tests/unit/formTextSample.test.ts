import { describe, expect, it, vi } from "vitest";
import { scanRecentSampleUntilLimit } from "../../convex/formTextSample";

const fixtures = Array.from({ length: 2500 }, (_, i) => i);
const readPage = vi.fn(async (cursor: string | null, numItems: number) => {
  const start = Number(cursor ?? 0);
  const end = Math.min(fixtures.length, start + numItems);
  return { page: fixtures.slice(start, end), continueCursor: String(end), isDone: end === fixtures.length };
});

const bounds = { sampleLimit: 2000, resultLimit: 200, pageSize: 100 };

describe("capped response text sample", () => {
  it("stops after 200 ordered matching results, before scanning all 2,000", async () => {
    readPage.mockClear();
    const result = await scanRecentSampleUntilLimit(readPage, async value => value, bounds);
    expect(result).toEqual(fixtures.slice(0, 200));
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it("still checks at most the original 2,000 rows when matching answers are sparse", async () => {
    readPage.mockClear();
    const result = await scanRecentSampleUntilLimit(readPage, async value => value % 100 === 0 ? value : null, bounds);
    expect(result).toEqual(fixtures.slice(0, 2000).filter(value => value % 100 === 0));
    expect(readPage).toHaveBeenCalledTimes(20);
  });

  it("does not suppress projection errors", async () => {
    await expect(scanRecentSampleUntilLimit(readPage, async () => { throw new Error("visibility read failed"); }, bounds)).rejects.toThrow("visibility read failed");
  });
});
