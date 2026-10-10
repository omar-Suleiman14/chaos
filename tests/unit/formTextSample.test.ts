import { describe, expect, it, vi } from "vitest";
import { findTextAnswersWithFastPath } from "../../convex/formTextSample";

const fixtures = Array.from({ length: 2500 }, (_, i) => i);
const readRows = vi.fn(async (limit: number) => fixtures.slice(0, limit));

describe("text-answer sample fast path", () => {
  it("reads only 200 rows when all 200 are eligible and ordered", async () => {
    readRows.mockClear();
    const result = await findTextAnswersWithFastPath(readRows, async value => value, 200, 2000);
    expect(result).toEqual(fixtures.slice(0, 200));
    expect(readRows).toHaveBeenCalledTimes(1);
    expect(readRows).toHaveBeenCalledWith(200);
  });

  it("falls back to exactly the original 2,000-row window for sparse fields", async () => {
    readRows.mockClear();
    const result = await findTextAnswersWithFastPath(readRows, async value => value % 100 === 0 ? value : null, 200, 2000);
    expect(result).toEqual(fixtures.slice(0, 2000).filter(value => value % 100 === 0));
    expect(readRows).toHaveBeenCalledTimes(2);
    expect(readRows).toHaveBeenLastCalledWith(2000);
  });

  it("does not run a fallback on a smaller exhausted dataset", async () => {
    const short = vi.fn(async (limit: number) => fixtures.slice(0, Math.min(12, limit)));
    expect(await findTextAnswersWithFastPath(short, async v => v, 200, 2000)).toHaveLength(12);
    expect(short).toHaveBeenCalledTimes(1);
  });

  it("propagates field version and visibility projection failures", async () => {
    await expect(findTextAnswersWithFastPath(readRows, async () => { throw new Error("visibility read failed"); }, 200, 2000)).rejects.toThrow("visibility read failed");
  });
});
