import { describe, expect, it } from "vitest";
import { matchingLessonSnippets } from "../../convex/learnSearchSnippets";

describe("published lesson search snippets", () => {
  it("keeps the first five text matches in document order and limits the excerpt to 300 characters", () => {
    const blocks = [{ id: "video" }, ...Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, text: "Liver " + "x".repeat(400) }))];
    expect(matchingLessonSnippets(blocks, ["liver"])).toEqual(
      Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, text: ("Liver " + "x".repeat(400)).slice(0, 300) })),
    );
  });
  it("matches Arabic and English case-insensitively without changing the original snippet", () => {
    expect(matchingLessonSnippets([{ id: "a", text: "الوريد البابي" }, { id: "b", text: "Portal VEIN" }], ["بابي", "vein"]))
      .toEqual([{ id: "a", text: "الوريد البابي" }, { id: "b", text: "Portal VEIN" }]);
  });
  it("ignores non-text blocks and returns no preview for no search terms", () => {
    expect(matchingLessonSnippets([{ id: "image" }, { id: "note", text: "Lesson" }], [])).toEqual([]);
    expect(matchingLessonSnippets([{ id: "image" }, { id: "note", text: "Lesson" }], ["other"])).toEqual([]);
  });
});
