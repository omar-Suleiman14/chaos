import { describe, expect, it, vi } from "vitest";
import { memoizeRead } from "../../convex/readMemo";

describe("query-local indexed read memo", () => {
  it("does one read per owner and returns the same value to every caller", async () => {
    const lookup = vi.fn(async (id: string) => ({ name: id.toUpperCase() }));
    const read = memoizeRead(lookup);
    const [a, b, c] = await Promise.all([read("owner-1"), read("owner-1"), read("owner-2")]);
    expect(a).toBe(b);
    expect(c.name).toBe("OWNER-2");
    expect(lookup).toHaveBeenCalledTimes(2);
  });
  it("never reuses results across separate request-local caches", async () => {
    const lookup = vi.fn(async () => null);
    await memoizeRead(lookup)("absent");
    await memoizeRead(lookup)("absent");
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
