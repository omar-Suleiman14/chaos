import { describe, expect, it } from "vitest";
import { cleanTags } from "@/lib/learn/normalizeTags";
describe("learn lesson tag normalization", () => {
  it("trims spaces, removes one leading hash and deduplicates", () => {
    expect(cleanTags([" #anatomy ", "anatomy", "#physiology", "", "#"])).toEqual(["anatomy", "physiology"]);
  });
  it("preserves max 40 characters and 12 tags", () => {
    expect(cleanTags(["a".repeat(55)])[0]).toHaveLength(40);
    expect(cleanTags(Array.from({ length: 20 }, (_, i) => "tag" + i))).toHaveLength(12);
  });
  it("preserves input immutability", () => {
    const tags = [" #topic "];
    cleanTags(tags);
    expect(tags).toEqual([" #topic "]);
  });
});
