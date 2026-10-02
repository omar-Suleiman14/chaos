import { expect, it } from "vitest";
import { learnBlockSchema } from "../../lib/mcp/learn";
import { validateLessonDocument } from "../../lib/lessonBlockAdapter";

it("preserves rich editor metadata through the public MCP block contract", () => {
  const blocks = [
    { id: "c", type: "callout", tone: "clinical", text: "SAAG", inline: [{ text: "SAAG", marks: { bold: true }, href: "https://example.com/reference" }], citations: [], conceptIds: [], presentation: { alignment: "right" } },
    { id: "i", type: "image", sourceId: "source1", alt: "Portal vein", caption: "Diagram", name: "vein.png", previewWidth: 640, showPreview: true, figureKind: "diagram", credit: "Author", creditUrl: "https://example.com", annotations: { v: 1, items: [{ id: "h", x: .2, y: .3, label: "Vein" }] }, citations: [], conceptIds: [] },
  ];
  const parsed = blocks.map(block => learnBlockSchema.parse(block));
  expect(parsed).toEqual(blocks);
  expect(validateLessonDocument({ schemaVersion: 1, blocks: parsed }).ok).toBe(true);
});
