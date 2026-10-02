import { describe, expect, it } from "vitest";
import type { LessonDocument } from "../../convex/learnModel";
import type { Id } from "../../convex/_generated/dataModel";
import {
  editorBlocksToLessonDocument as fromEditor,
  lessonDocumentToEditorBlocks as toEditor,
} from "../../lib/lessonBlockAdapter";
const sourceId = "source1" as Id<"learnSources">;
const common = {
  citations: [{ sourceId, locator: { kind: "page" as const, page: 2 } }],
  conceptIds: ["concept1", "concept2"],
};
const document: LessonDocument = {
  schemaVersion: 1,
  blocks: [
    {
      ...common,
      id: "child",
      parentId: "root",
      type: "paragraph",
      text: "Nested text",
    },
    { ...common, id: "root", type: "heading", text: "Title", level: 2 },
    {
      ...common,
      id: "bullet",
      parentId: "child",
      type: "list",
      style: "bullet",
      text: "Bullet",
    },
    { ...common, id: "number", type: "list", style: "number", text: "Number" },
    {
      ...common,
      id: "check",
      type: "list",
      style: "check",
      text: "Check",
      checked: false,
    },
    {
      ...common,
      id: "image",
      type: "image",
      sourceId,
      alt: "Alt",
      caption: "Caption",
    },
    { ...common, id: "source", type: "source", sourceId, label: "Source" },
    {
      ...common,
      id: "diagram",
      type: "diagram",
      format: "mermaid",
      text: "graph TD; A-->B",
    },
    {
      ...common,
      id: "youtube",
      type: "youtube",
      videoId: "dQw4w9WgXcQ",
      start: 2,
      end: 5,
      caption: "Video",
    },
    { ...common, id: "equation", type: "equation", display: true, text: "x^2" },
    {
      ...common,
      id: "table",
      type: "table",
      rows: [
        ["A", "B"],
        ["1", "2"],
      ],
      headerRows: 1,
    },
    {
      ...common,
      id: "quiz",
      type: "quiz",
      asset: { kind: "quiz", id: "quiz1" as Id<"quizzes"> },
    },
    {
      ...common,
      id: "form",
      type: "quiz",
      asset: { kind: "form", id: "form1" as Id<"forms"> },
    },
  ],
};
const editor = (overrides: Record<string, unknown> = {}) => [
  {
    id: "p",
    type: "paragraph",
    content: "hello",
    props: {},
    children: [],
    ...overrides,
  },
];
describe("lessonBlockAdapter", () => {
  it("round trips every variant, arbitrary flat order, nested parents and metadata", () => {
    const result = toEditor(document);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("conversion failed");
    expect(result.value[0].id).toBe("root");
    expect(result.value[0].children[0].children[0].id).toBe("bullet");
    expect(fromEditor(result.value)).toEqual({
      ok: true,
      value: document,
      problems: [],
    });
  });
  it("preserves all citation locator types and absent optional fields", () => {
    const value: LessonDocument = {
      schemaVersion: 1,
      blocks: [
        {
          ...common,
          id: "p",
          type: "list",
          style: "check",
          text: "",
          citations: [
            { sourceId, locator: { kind: "slide", slide: 3 } },
            { sourceId, locator: { kind: "time", start: 0, end: 5 } },
            { sourceId, locator: { kind: "time", start: 1 } },
            { sourceId, locator: { kind: "section", label: "Part A" } },
          ],
        },
      ],
    };
    const result = toEditor(value);
    if (!result.ok) throw new Error("conversion failed");
    expect(fromEditor(result.value)).toEqual({ ok: true, value, problems: [] });
  });
  it("accepts unstyled inline text and derives parentIds from children", () => {
    const result = fromEditor(
      editor({
        content: [
          { type: "text", text: "A", styles: {} },
          { type: "text", text: "B" },
        ],
        children: editor({ id: "c" }),
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.blocks).toEqual([
        {
          id: "p",
          type: "paragraph",
          text: "AB",
          citations: [],
          conceptIds: [],
        },
        {
          id: "c",
          parentId: "p",
          type: "paragraph",
          text: "hello",
          citations: [],
          conceptIds: [],
        },
      ]);
  });
  it.each([
    [{ type: "text", text: "bold", styles: { unknown: true } }],
    [{ type: "link", href: "javascript:alert(1)", content: [] }],
    [{ type: "mention", text: "person" }],
  ])("rejects rich inline content without partial output: %j", (content) => {
    const result = fromEditor(editor({ content }));
    expect(result.ok).toBe(false);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("value");
  });
  it.each(["unknown", "image", "table", "__proto__", "constructor"])(
    "rejects unregistered blocks %s",
    (type) => {
      expect(
        fromEditor(editor({ type, props: { url: "javascript:alert(1)" } })).ok,
      ).toBe(false);
    },
  );
  it.each([
    { type: "lessonTable", data: { rows: [["a"], ["b", "c"]], headerRows: 1 } },
    { type: "lessonTable", data: { rows: [], headerRows: 0 } },
    { type: "lessonTable", data: { rows: [[1]], headerRows: 0 } },
    { type: "lessonTable", data: { rows: [["a"]], headerRows: 2 } },
    {
      type: "lessonYoutube",
      data: { videoId: "javascript:alert(1)", caption: "" },
    },
    {
      type: "lessonImage",
      data: { sourceId: "s", alt: "", caption: "", url: "https://example.com" },
    },
    { type: "lessonQuiz", data: { asset: { kind: "other", id: "q" } } },
    { type: "lessonSource", data: { sourceId: "s", label: "", id: "spoofed" } },
  ])("rejects malformed or unsafe structured data %j", ({ type, data }) => {
    expect(
      fromEditor([
        {
          id: "x",
          type,
          props: { lessonData: JSON.stringify(data) },
          children: [],
        },
      ]).ok,
    ).toBe(false);
  });
  it("rejects duplicate IDs, broken parents and cycles", () => {
    expect(fromEditor([...editor(), ...editor()]).ok).toBe(false);
    const p = document.blocks[0];
    expect(toEditor({ schemaVersion: 1, blocks: [p] }).ok).toBe(false);
    expect(
      toEditor({ schemaVersion: 1, blocks: [{ ...p, parentId: p.id }] }).ok,
    ).toBe(false);
  });
  it("accepts neutral native defaults and preserves block formatting", () => {
    expect(
      fromEditor(
        editor({
          props: {
            textAlignment: "left",
            textColor: "default",
            backgroundColor: "default",
          },
        }),
      ).ok,
    ).toBe(true);
    expect(fromEditor(editor({ props: { textAlignment: "center" } })).ok).toBe(true);
  });
  it("rejects malformed metadata, unknown props and duplicate order", () => {
    expect(
      fromEditor(editor({ props: { lessonCitations: "not-json" } })).ok,
    ).toBe(false);
    expect(fromEditor(editor({ props: { lessonConceptIds: "[1]" } })).ok).toBe(
      false,
    );
    expect(fromEditor(editor({ props: { textColor: "url(evil)" } })).ok).toBe(false);
    expect(
      fromEditor([
        ...editor({ props: { lessonOrder: 0 } }),
        ...editor({ id: "q", props: { lessonOrder: 0 } }),
      ]).ok,
    ).toBe(false);
  });
  it("bounds input and rejects non JSON or malformed shapes", () => {
    expect(fromEditor(null).ok).toBe(false);
    expect(fromEditor(editor({ children: {} })).ok).toBe(false);
    expect(
      fromEditor(
        Array.from({ length: 501 }, (_, i) => editor({ id: String(i) })[0]),
      ).ok,
    ).toBe(false);
    expect(fromEditor(editor({ content: "x".repeat(300001) })).ok).toBe(false);
    const cycle: unknown[] = [];
    cycle.push(cycle);
    expect(fromEditor(cycle).ok).toBe(false);
  });
});

describe("additive rich v1 contract", () => {
  it("round trips rich marks, links, new block kinds and annotated image metadata", () => {
    const rich = [{ text: "Bold", marks: { bold: true, italic: true, underline: false, strike: true, code: true, textColor: "red", backgroundColor: "#fff" } }, { text: "Link", href: "https://example.com/lecture", marks: { underline: true } }];
    const base = { citations: [], conceptIds: [] };
    const value: LessonDocument = { schemaVersion: 1, blocks: [
      { ...base, id: "p", type: "paragraph", text: "BoldLink", inline: rich, presentation: { alignment: "center", textColor: "blue" } },
      { ...base, id: "call", type: "callout", text: "Note", tone: "clinical" },
      { ...base, id: "code", type: "code", text: "const x = 1;", language: "typescript" },
      { ...base, id: "quote", type: "quote", text: "Quote" },
      { ...base, id: "toggle", type: "toggle", text: "Details" },
      { ...base, id: "child", parentId: "toggle", type: "paragraph", text: "Body" },
      { ...base, id: "divider", type: "divider" },
      { ...base, id: "img", type: "image", sourceId, alt: "Diagram", caption: "Figure", credit: "Author", creditUrl: "https://example.com", figureKind: "diagram", annotations: { v: 1, items: [{ id: "a", x: 0.2, y: 0.3, w: 0.1, h: 0.2, label: "Structure", body: "Explanation" }] } },
    ] };
    const result = toEditor(value);
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error("conversion failed");
    expect(result.value.some(b => b.type === "image")).toBe(true);
    expect(fromEditor(result.value)).toEqual({ ok: true, value, problems: [] });
  });
  it("accepts actual editor callout/code/quote/toggle block names and safe rich links", () => {
    for (const [type, props] of [["callout", { tone: "tip" }], ["codeBlock", { language: "js" }], ["quote", {}], ["toggleListItem", {}]] as const) {
      expect(fromEditor(editor({ type, props, content: [{ type: "link", href: "https://example.com", content: [{ type: "text", text: "read", styles: { bold: true } }] }] })).ok).toBe(true);
    }
  });
  it("accepts source-resolved editor images and rejects guessed URL-only media", () => {
    const input = editor({ type: "image", content: undefined, props: { url: "chaos-learn-file:owned", alt: "Alt", caption: "", credit: "Author", figureKind: "diagram", annotations: JSON.stringify({ v: 1, items: [] }) } });
    expect(fromEditor(input).ok).toBe(false);
    expect(fromEditor(input, { imageSourceId: url => url === "chaos-learn-file:owned" ? sourceId : undefined }).ok).toBe(true);
  });
  it.each(["javascript:alert(1)", "data:text/html,x", "file:///x", "https://user:pass@example.com", "//example.com", "https://example.com/\nevil", "vbscript:evil"])("rejects malicious link %s without partial output", href => {
    const result = fromEditor(editor({ content: [{ type: "link", href, content: [{ type: "text", text: "x" }] }] }));
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("value");
  });
  it("rejects unknown marks, mismatched text fallbacks and excessive runs", () => {
    expect(fromEditor(editor({ content: [{ type: "text", text: "x", styles: { fontSize: "huge" } }] })).ok).toBe(false);
    expect(toEditor({ schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", citations: [], conceptIds: [], text: "x", inline: [{ text: "different" }] }] }).ok).toBe(false);
    expect(fromEditor(editor({ content: Array.from({ length: 1001 }, () => ({ type: "text", text: "x", styles: { bold: true } })) })).ok).toBe(false);
  });
  it("rejects invalid annotations and unsafe credit links", () => {
    for (const data of [{ creditUrl: "javascript:evil" }, { annotations: { v: 1, items: [{ id: "a", x: 0.9, y: 0, w: 0.5, label: "outside" }] } }, { annotations: { v: 2, items: [] } }]) {
      expect(fromEditor(editor({ type: "lessonImage", content: undefined, props: { lessonData: JSON.stringify({ sourceId, alt: "Alt", caption: "", ...data }) } })).ok).toBe(false);
    }
  });
  it("saves edited image metadata rather than its retained adapter payload", () => {
    const value: LessonDocument = { schemaVersion: 1, blocks: [{ id: "img", type: "image", sourceId, alt: "Alt", caption: "", credit: "Old", citations: [], conceptIds: [] }] };
    const converted = toEditor(value);
    if (!converted.ok) throw Error("conversion failed");
    converted.value[0].props.credit = "New";
    const result = fromEditor(converted.value);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.blocks[0]).toHaveProperty("credit", "New");
  });
});
