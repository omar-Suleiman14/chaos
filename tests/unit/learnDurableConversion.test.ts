import { describe, expect, it } from "vitest";
import type { LessonDocument } from "../../convex/learnModel";
import type { Id } from "../../convex/_generated/dataModel";
import { fromDurableDocument, toDurableDocument } from "../../lib/learn/chaosDocument";
const base = { citations: [], conceptIds: [] };
describe("real Learn editor durable conversion", () => {
  it("rejects malformed child collections and unknown table fields", () => {
    expect(() => toDurableDocument([{ id: "p", type: "paragraph", props: {}, content: [], children: { id: "lost" } }])).toThrow("children");
    expect(() => toDurableDocument([{ id: "t", type: "table", props: {}, content: { type: "tableContent", rows: [], caption: "lost" }, children: [] }])).toThrow("Unknown table");
  });
  it("preserves rich text, links, callouts, code, toggles and hidden stable metadata", () => {
    const doc: LessonDocument = { schemaVersion: 1, blocks: [
      { ...base, id: "p", type: "paragraph", text: "Read more", inline: [{ text: "Read ", marks: { bold: true } }, { text: "more", href: "https://example.com", marks: { italic: true } }], presentation: { alignment: "right" }, conceptIds: ["portal"], citations: [{ sourceId: "source1" as Id<"learnSources">, locator: { kind: "page", page: 3 } }] },
      { ...base, id: "c", type: "callout", tone: "clinical", text: "Caution" },
      { ...base, id: "code", type: "code", language: "js", text: "const x = 1;" },
      { ...base, id: "q", type: "quote", text: "Quotation" },
      { ...base, id: "t", type: "toggle", text: "Details" },
      { ...base, id: "child", parentId: "t", type: "paragraph", text: "Body" },
      { ...base, id: "d", type: "divider" },
    ] };
    expect(toDurableDocument(fromDurableDocument(doc), doc)).toEqual(doc);
  });
  it("converts real rectangular tableContent rather than dropping it", () => {
    const doc: LessonDocument = { schemaVersion: 1, blocks: [{ ...base, id: "tbl", type: "table", rows: [["A", "B"], ["1", "2"]], headerRows: 1 }] };
    expect(toDurableDocument(fromDurableDocument(doc), doc)).toEqual(doc);
  });
  it("saves the table cells BlockNote reports (default-valued cell objects) exactly like plain cells", () => {
    const doc: LessonDocument = { schemaVersion: 1, blocks: [{ ...base, id: "tbl", type: "table", rows: [["A", ""], ["1", "2"]], headerRows: 1 }] };
    const cell = (text: string) => ({ type: "tableCell", props: { colspan: 1, rowspan: 1, backgroundColor: "default", textColor: "default", textAlignment: "left" }, content: text ? [{ type: "text", text, styles: {} }] : [] });
    const editorTable = [{ id: "tbl", type: "table", props: { textColor: "default" }, content: { type: "tableContent", headerRows: 1, columnWidths: [null, null], rows: [{ cells: [cell("A"), cell("")] }, { cells: [cell("1"), cell("2")] }] }, children: [] }];
    expect(toDurableDocument(editorTable, doc)).toEqual(toDurableDocument(fromDurableDocument(doc), doc));
    const styled = { ...cell("A"), props: { ...cell("A").props, backgroundColor: "red" } };
    expect(() => toDurableDocument([{ ...editorTable[0], content: { type: "tableContent", rows: [{ cells: [styled] }] } }])).toThrow("Merged or styled");
  });
  it("drops only the source block's empty editor-side note", () => {
    const source = (note: string) => [{ id: "s", type: "source", props: { sourceId: "source1", locator: "page 2", note }, children: [] }];
    expect(toDurableDocument(source("")).blocks[0]).toMatchObject({ type: "source", sourceId: "source1", label: "page 2" });
    expect(() => toDurableDocument(source("Read before class"))).toThrow("Source notes");
  });
  it("rejects merged cells, rich table text, custom inline citations and unknown block props", () => {
    const raw = (content: unknown, props = {}) => [{ id: "x", type: "table", props, content, children: [] }];
    expect(() => toDurableDocument(raw({ type: "tableContent", rows: [{ cells: [{ type: "tableCell", props: { colspan: 2 }, content: [] }] }] }))).toThrow("Merged");
    expect(() => toDurableDocument(raw({ type: "tableContent", rows: [{ cells: [[{ type: "text", text: "x", styles: { bold: true } }]] }] }))).toThrow("Rich table");
    expect(() => toDurableDocument([{ id: "p", type: "paragraph", props: {}, content: [{ type: "citation", props: { sourceId: "s", locator: "page 1" } }], children: [] }])).toThrow("Unsupported");
    expect(() => toDurableDocument([{ id: "p", type: "paragraph", props: { unknown: "x" }, content: [], children: [] }])).toThrow("Unsupported");
  });
  it("rejects device-local image files and unsafe links without partial data", () => {
    expect(() => toDurableDocument([{ id: "i", type: "image", props: { url: "chaos-learn-file:file_abc", alt: "Image", caption: "" }, children: [] }])).toThrow("Device-local");
    expect(() => toDurableDocument([{ id: "p", type: "paragraph", props: {}, content: [{ type: "link", href: "javascript:alert(1)", content: [{ type: "text", text: "click" }] }], children: [] }])).toThrow("absolute");
  });
  it("retains server image IDs and annotated credits and mermaid semantics", () => {
    const doc: LessonDocument = { schemaVersion: 1, blocks: [
      { ...base, id: "i", type: "image", sourceId: "source1" as Id<"learnSources">, alt: "Vein", caption: "Diagram", name: "", credit: "Author", creditUrl: "https://example.com", figureKind: "diagram", showPreview: true, annotations: { v: 1, items: [{ id: "h", x: .2, y: .3, label: "Vein" }] } },
      { ...base, id: "m", type: "diagram", format: "mermaid", text: "graph TD; A-->B" },
    ] };
    expect(toDurableDocument(fromDurableDocument(doc), doc)).toEqual(doc);
  });
});
