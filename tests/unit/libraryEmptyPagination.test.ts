import { describe, expect, it } from "vitest";
import { MAX_EMPTY_LIBRARY_PAGE_ADVANCES, shouldAdvanceEmptyLibraryPage } from "@/lib/library/autoPagination";

describe("empty filtered library pages", () => {
  it("automatically fetches the next page when the selected Forms/Quizzes tab has no visible rows", () => {
    expect(shouldAdvanceEmptyLibraryPage("Forms", true, 0, true, 0)).toBe(true);
    expect(shouldAdvanceEmptyLibraryPage("Quizzes", true, 0, true, 1)).toBe(true);
  });

  it("never triggers extra queries for cached, loading, non-empty, or unrelated tabs", () => {
    expect(shouldAdvanceEmptyLibraryPage("Forms", false, 0, true, 0)).toBe(false);
    expect(shouldAdvanceEmptyLibraryPage("Forms", true, 1, true, 0)).toBe(false);
    expect(shouldAdvanceEmptyLibraryPage("Forms", true, 0, false, 0)).toBe(false);
    expect(shouldAdvanceEmptyLibraryPage("Courses", true, 0, true, 0)).toBe(false);
  });

  it("stops after a fixed budget so a huge library is not queried without user action", () => {
    expect(shouldAdvanceEmptyLibraryPage("Forms", true, 0, true, MAX_EMPTY_LIBRARY_PAGE_ADVANCES)).toBe(false);
  });
});
