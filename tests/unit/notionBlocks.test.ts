import { describe, expect, it } from "vitest";
import { notionBlocksToLesson } from "../../lib/notionBlocks";

describe("Notion lesson import", () => {
  it("maps text and nested lists to editable Chaos blocks", () => {
    const { document, skipped } = notionBlocksToLesson([
      { block: { id: "a".repeat(32), type: "heading_2", heading_2: { rich_text: [{ plain_text: "Anatomy" }] } } },
      { block: { id: "b".repeat(32), type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "Brainstem", annotations: { bold: true } }] } }, parentId: "a".repeat(32) },
    ]);
    expect(skipped).toBe(0);
    expect(document.blocks).toMatchObject([{ type: "heading", level: 2, text: "Anatomy" }, { type: "list", style: "bullet", text: "Brainstem", parentId: "a".repeat(32) }]);
    expect(document.blocks[1]).toHaveProperty("inline.0.marks.bold", true);
  });

  it("never creates fake image attachments or executable blocks", () => {
    const { document, skipped } = notionBlocksToLesson([
      { block: { id: "c".repeat(32), type: "image", image: { external: { url: "https://example.com/image.jpg" } } } },
      { block: { id: "d".repeat(32), type: "paragraph", paragraph: { rich_text: [{ plain_text: "Safe text" }] } } },
    ]);
    expect(skipped).toBe(1);
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]).toMatchObject({ type: "paragraph", text: "Safe text" });
  });

  it("promotes children of skipped blocks and normalizes Notion code languages", () => {
    const { document } = notionBlocksToLesson([
      { block: { id: "2".repeat(32), type: "code", code: { language: "plain text", rich_text: [{ plain_text: "hello" }] } } },
      { block: { id: "3".repeat(32), type: "paragraph", paragraph: { rich_text: [{ plain_text: "Child" }] } }, parentId: "4".repeat(32) },
    ]);
    expect(document.blocks[0]).toMatchObject({ type: "code", language: "plaintext" });
    expect(document.blocks[1]).not.toHaveProperty("parentId");
  });
});
