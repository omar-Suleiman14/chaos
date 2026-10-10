import { describe, expect, it } from "vitest";
import { sourceVersionPage, SOURCE_RETENTION_LIMITS } from "../../convex/learnSourceRetention";

describe("removed-source history verification pages", () => {
  it("visits more versions per call while bounding rows and bytes", () => {
    const options = sourceVersionPage(null);
    expect(options).toEqual({ numItems: 5, cursor: null, maximumRowsRead: 5, maximumBytesRead: 1_800_000 });
    expect(options.maximumRowsRead).toBe(options.numItems);
    expect(options.maximumBytesRead).toBeLessThan(4_000_000);
    expect(SOURCE_RETENTION_LIMITS.jobsPerBatch).toBe(1);
  });

  it("keeps the same history cursor on continuation and resets at a table boundary", () => {
    expect(sourceVersionPage("cursor-after-5").cursor).toBe("cursor-after-5");
    expect(sourceVersionPage(null).cursor).toBeNull();
  });
});
