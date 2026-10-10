import { describe, expect, it } from "vitest";
import { customFields, customTypes, nativeTypes } from "../../lib/lessonBlockMappings";

describe("lesson editor block mappings", () => {
  it("keeps stored names for native text blocks", () => {
    expect(nativeTypes.paragraph).toBe("paragraph");
    expect(nativeTypes.bulletListItem).toBe("bullet");
    expect(nativeTypes.checkListItem).toBe("check");
  });
  it("retains legacy and custom aliases for all study embeds", () => {
    expect(customTypes.lessonFlashcards).toBe("flashcards");
    expect(customTypes.flashcards).toBe("flashcards");
    expect(customTypes.lessonYoutube).toBe("youtube");
    expect(customTypes.quiz).toBe("quiz");
  });
  it("keeps citations and upload metadata in the image mapping", () => {
    expect(customFields.image).toContain("sourceId");
    expect(customFields.image).toContain("annotations");
    expect(customFields.youtube).toContain("videoId");
  });
});
