import { describe, expect, it } from "vitest";
import { revision } from "../../convex/studyLessonRevision";

describe("study lesson revision guard", () => {
  it("accepts exactly the current safe integer revision", () => {
    expect(() => revision(0, 0)).not.toThrow();
    expect(() => revision(7, 7)).not.toThrow();
  });

  it("rejects stale, future, fractional and unsafe expected revisions", () => {
    for (const expected of [4, 6, 5.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => revision(5, expected)).toThrow();
    }
  });

  it("preserves the structured Convex conflict code and current revision", () => {
    try {
      revision(9, 8);
      throw new Error("Expected a revision conflict");
    } catch (error) {
      expect(error).toMatchObject({ data: { code: "REVISION_CONFLICT", currentRevision: 9 } });
    }
  });
});
