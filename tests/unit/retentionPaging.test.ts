import { describe, expect, it } from "vitest";
import { nextRetentionPageCursor } from "../../convex/retentionPaging";

describe("response retention paging", () => {
  it("replays the current page after deleting an expired response", () => {
    expect(nextRetentionPageCursor("previous", "next", false, true)).toBe("previous");
    expect(nextRetentionPageCursor(null, "next", true, true)).toBeNull();
  });

  it("advances when no expiry work was found", () => {
    expect(nextRetentionPageCursor("previous", "next", false, false)).toBe("next");
  });

  it("ends only once the final page has no expired response", () => {
    expect(nextRetentionPageCursor("previous", "end", true, false)).toBeUndefined();
  });
});
