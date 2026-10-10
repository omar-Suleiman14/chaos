import { describe, expect, it, vi } from "vitest";
import { memoizeOwnerRestriction } from "../../convex/adminAnalyticsReadMemo";

describe("admin analytics owner restriction reads", () => {
  it("reuses one indexed lookup for repeated owners within the same scan", async () => {
    const read = vi.fn(async (owner: string) => owner === "restricted");
    const restricted = memoizeOwnerRestriction(read);
    expect(await Promise.all([restricted("restricted"), restricted("restricted"), restricted("active")])).toEqual([true, true, false]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not cache across scan transactions", async () => {
    const read = vi.fn(async () => false);
    await memoizeOwnerRestriction(read)("a");
    await memoizeOwnerRestriction(read)("a");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not suppress a failed restriction lookup", async () => {
    const restricted = memoizeOwnerRestriction(async () => { throw new Error("restriction unavailable"); });
    await expect(restricted("a")).rejects.toThrow("restriction unavailable");
    await expect(restricted("a")).rejects.toThrow("restriction unavailable");
  });
});
