import { describe, expect, it } from "vitest";
import type { Doc } from "../../convex/_generated/dataModel";
import { publicCourseMetadata } from "../../convex/publicCourseMetadata";

describe("public course card metadata", () => {
  it("keeps exactly the shared six display fields in the original order", () => {
    const metadata = {
      title: "Neuroscience", description: "CNS course", coverUrl: "/cover.png",
      icon: "📘", language: "ar", tags: ["cns", "medicine"],
      authorDisplay: "Private creator metadata",
    } as Doc<"collectionVersions">["metadata"];
    const result = publicCourseMetadata(metadata);
    expect(result).toEqual({
      title: "Neuroscience", description: "CNS course", coverUrl: "/cover.png",
      icon: "📘", language: "ar", tags: ["cns", "medicine"],
    });
    expect(Object.keys(result)).toEqual(["title", "description", "coverUrl", "icon", "language", "tags"]);
    expect(result.tags).toBe(metadata.tags);
  });

  it("retains optional field properties when their values are missing", () => {
    const metadata = { title: "Course", description: "", language: "en", tags: [] } as Doc<"collectionVersions">["metadata"];
    expect(publicCourseMetadata(metadata)).toEqual({
      title: "Course", description: "", coverUrl: undefined, icon: undefined, language: "en", tags: [],
    });
  });
});
