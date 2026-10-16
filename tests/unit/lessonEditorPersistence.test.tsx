import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/components/ThemeProvider";
import type { LessonDocument } from "@/convex/learnModel";
import type { Id } from "@/convex/_generated/dataModel";
import type { LessonEditorType } from "@/components/learn/editor/blocks";
import { runBlockAction } from "@/components/learn/editor/sideMenu";
import { moveBlocksTo } from "@/components/learn/editor/dragFeedback";
import { getNodeById } from "@blocknote/core";
import { fromDurableDocument, toDurableDocument } from "@/lib/learn/chaosDocument";

vi.mock("convex/react", () => ({
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
}));
const { default: LessonEditor } = await import("@/components/learn/editor/LessonEditor");

/**
 * A lesson as an assistant writes it over MCP (the stored LessonDocument), opened in the real
 * editor, rearranged with the redesigned controls, and saved again through the durable path.
 * Nothing the reader or the learning features rely on may change except the order asked for.
 */
const base = { citations: [], conceptIds: [] };
const source = "source1" as Id<"learnSources">;
const lesson: LessonDocument = { schemaVersion: 1, blocks: [
  { ...base, id: "h", type: "heading", level: 2, text: "Cardiac cycle" },
  { ...base, id: "p", type: "paragraph", text: "Systole then diastole.", inline: [{ text: "Systole", marks: { bold: true } }, { text: " then diastole." }], conceptIds: ["systole"], citations: [{ sourceId: source, locator: { kind: "page", page: 23 } }] },
  { ...base, id: "t", type: "toggle", text: "Details" },
  { ...base, id: "tc", parentId: "t", type: "paragraph", text: "Hidden detail" },
  { ...base, id: "l", type: "list", style: "bullet", text: "Atria" },
  { ...base, id: "lc", parentId: "l", type: "list", style: "bullet", text: "Left atrium" },
  { ...base, id: "i", type: "image", sourceId: source, alt: "Heart", caption: "Chambers", name: "", credit: "Gray's Anatomy", creditUrl: "https://example.com/gray", figureKind: "diagram", showPreview: true, annotations: { v: 1, items: [{ id: "a1", x: .4, y: .5, label: "Septum" }] } },
  { ...base, id: "c", type: "callout", tone: "key", text: "Remember the order" },
  { ...base, id: "q", type: "quiz", asset: { kind: "form", id: "form-id" as never }, required: true },
  { ...base, id: "f", type: "flashcards", setId: "deck-id" as never },
  { ...base, id: "tb", type: "table", rows: [["Chamber", "Role"], ["LV", "Systemic pump"]], headerRows: 1 },
  { ...base, id: "e", type: "equation", text: "Q = HR \\times SV", display: true },
  { ...base, id: "y", type: "youtube", videoId: "dQw4w9WgXcQ", start: 30, end: 90, caption: "Cycle" },
  { ...base, id: "s", type: "source", sourceId: source, label: "page 4" },
  { ...base, id: "d", type: "diagram", format: "mermaid", text: "graph LR; A-->B" },
  { ...base, id: "code", type: "code", language: "javascript", text: "const bpm = 72;" },
  { ...base, id: "end", type: "paragraph", text: "End." },
] };

let editor!: LessonEditorType;
beforeEach(async () => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  render(
    <LocaleProvider initial="en"><ThemeProvider>
      <LessonEditor initialContent={fromDurableDocument(lesson)} language="en" sources={[]} onReady={(value) => { editor = value; }}
        onChange={vi.fn()} onManageSources={vi.fn()} onEditImage={vi.fn()} onEditCitation={vi.fn()} onAssist={vi.fn()}
        onUploadError={vi.fn()} uploadFile={vi.fn()} resolveFileUrl={async (url) => url} />
    </ThemeProvider></LocaleProvider>,
  );
  await act(async () => { await Promise.resolve(); });
});

const save = () => toDurableDocument(JSON.parse(JSON.stringify(editor.document)), lesson);
const byId = (doc: LessonDocument) => new Map(doc.blocks.map((b) => [b.id, b]));
const target = (id: string, placement: "before" | "after") => ({ id, placement, pos: getNodeById(id, editor.prosemirrorView.state.doc)!.posBeforeNode });

describe("an MCP-created lesson in the redesigned editor", () => {
  it("opens and saves unchanged", () => {
    expect(save()).toEqual(lesson);
  });

  it("drag moves change only the order: ids, nesting, citations, image metadata and asset ids survive", () => {
    act(() => { moveBlocksTo(editor, ["i"], target("h", "before")); });
    act(() => { moveBlocksTo(editor, ["t"], target("end", "after")); });
    act(() => { moveBlocksTo(editor, ["q", "f"], target("p", "before")); });
    const saved = save();
    expect(saved.blocks.filter((b) => !b.parentId).map((b) => b.id)).toEqual(["i", "h", "q", "f", "p", "l", "c", "tb", "e", "y", "s", "d", "code", "end", "t"]);
    const before = byId(lesson), after = byId(saved);
    for (const [id, block] of before) expect(after.get(id), id).toEqual(block);
  });

  it("menu moves, block edits and duplicate keep everything else exact; undo restores the save", () => {
    act(() => { runBlockAction(editor, "down", [editor.getBlock("h")!]); });
    act(() => { editor.updateBlock("c", { props: { tone: "warning" } }); });
    act(() => { runBlockAction(editor, "duplicate", [editor.getBlock("q")!]); });
    const saved = save();
    const copies = saved.blocks.filter((b) => b.type === "quiz");
    expect(copies).toHaveLength(2);
    expect(copies[1]).toMatchObject({ type: "quiz", asset: { kind: "form", id: "form-id" }, required: true });
    expect(copies[1].id).not.toBe("q");
    expect(byId(saved).get("p")).toEqual(byId(lesson).get("p"));
    expect(byId(saved).get("i")).toEqual(byId(lesson).get("i"));
    for (let i = 0; i < 3; i++) act(() => { editor.undo(); });
    expect(save()).toEqual(lesson);
  });

  it("keyboard moves of a nested block keep its own id and content", () => {
    act(() => { editor.setTextCursorPosition("lc", "end"); editor.moveBlocksUp(); });
    const saved = byId(save());
    expect(saved.get("lc")).toMatchObject({ type: "list", text: "Left atrium" });
  });
});
