import { describe, expect, it } from "vitest";
import { docCopyReplacements, updateDocCopy } from "@/lib/docs/copyUpdates";
import { flatArticles } from "@/lib/docs";

describe("documentation copy updates", () => {
  it.each(docCopyReplacements)("replaces obsolete phrase %s once", (from, to) => {
    expect(updateDocCopy(from)).toBe(to);
    expect(updateDocCopy(to)).toBe(to);
  });
  it("keeps real integrations and authored text", () => {
    const text = "Import from Google Forms or Microsoft Forms. استيراد من Google Forms وMicrosoft Forms. My custom note.";
    expect(updateDocCopy(text)).toBe(text);
  });
  it.each(["en", "ar"] as const)("seed content already uses the current copy (%s)", locale => {
    const content = JSON.stringify(flatArticles(locale));
    expect(updateDocCopy(content)).toBe(content);
    expect(content).toContain("Google Forms");
    expect(content).toContain("Microsoft Forms");
  });
});
