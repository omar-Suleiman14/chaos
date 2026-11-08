import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/components/ThemeProvider";
import type { LessonDocument } from "@/convex/learnModel";
import type { Id } from "@/convex/_generated/dataModel";
import type { LessonEditorType } from "@/components/learn/editor/blocks";
import { fromDurableDocument, toDurableDocument } from "@/lib/learn/chaosDocument";
import { describeLosses, exportLesson, importFormatFor, insertImported, parseImport } from "@/components/learn/editor/transfer";
import { LESSON_EDITOR_API_VERSION, type LessonEditorExtension } from "@/components/learn/editor/extensions";
import { parsePortableLesson } from "@/lib/learn/portable";

vi.mock("convex/react", () => ({
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
}));
const { default: LessonEditor, deniedCommandKeys } = await import("@/components/learn/editor/LessonEditor");

const base = { citations: [], conceptIds: [] };
const source = "source1" as Id<"learnSources">;
const lesson: LessonDocument = { schemaVersion: 1, blocks: [
  { ...base, id: "h", type: "heading", level: 2, text: "Cardiac cycle" },
  { ...base, id: "p", type: "paragraph", text: "Systole then diastole.", inline: [{ text: "Systole", marks: { bold: true } }, { text: " then " }, { text: "diastole", href: "https://example.com/d" }, { text: "." }] },
  { ...base, id: "u", type: "paragraph", text: "underlined", inline: [{ text: "underlined", marks: { underline: true } }] },
  { ...base, id: "c", type: "callout", tone: "key", text: "Remember the order" },
  { ...base, id: "i", type: "image", sourceId: source, alt: "Heart chambers", caption: "Figure 1", name: "", showPreview: true },
  { ...base, id: "q", type: "quiz", asset: { kind: "form", id: "form-id" as never }, required: false },
  { ...base, id: "f", type: "flashcards", setId: "deck-id" as never },
  { ...base, id: "e", type: "equation", text: "Q = HR \\times SV", display: true },
  { ...base, id: "y", type: "youtube", videoId: "dQw4w9WgXcQ", start: 30, caption: "Cycle" },
  { ...base, id: "s", type: "source", sourceId: source, label: "page 4" },
  { ...base, id: "d", type: "diagram", format: "mermaid", text: "graph LR; A-->B" },
  { ...base, id: "tb", type: "table", rows: [["Chamber", "Role"], ["LV", "Systemic pump"]], headerRows: 1 },
  { ...base, id: "end", type: "paragraph", text: "End." },
] };

let editor!: LessonEditorType;
let onChange: Mock<(content: unknown[]) => void>;
let onNotice: Mock<(message: string) => void>;
const mount = async (props: Partial<Parameters<typeof LessonEditor>[0]> = {}, content: unknown[] = fromDurableDocument(lesson)) => {
  onChange = vi.fn<(content: unknown[]) => void>(); onNotice = vi.fn<(message: string) => void>();
  render(
    <LocaleProvider initial="en"><ThemeProvider>
      <LessonEditor initialContent={content} language="en" sources={[]} onReady={(value) => { editor = value; }}
        onChange={onChange} onNotice={onNotice} onManageSources={vi.fn()} onEditImage={vi.fn()} onEditCitation={vi.fn()} onAssist={vi.fn()}
        onUploadError={vi.fn()} uploadFile={vi.fn()} resolveFileUrl={async (url) => url} {...props} />
    </ThemeProvider></LocaleProvider>,
  );
  await act(async () => { await Promise.resolve(); });
};

beforeEach(() => { vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} }); });

describe("lesson export", () => {
  beforeEach(() => mount());
  const sourceTitle = (id: string) => (id === source ? "Gray's Anatomy" : undefined);

  it("exports Markdown and names what it left out", () => {
    const out = exportLesson(editor, "markdown", { title: "Heart", description: "Basics" }, { sourceTitle });
    expect(out.content).toMatch(/^# Heart\n\n_Basics_\n\n/);
    expect(out.content).toContain("## Cardiac cycle");
    expect(out.content).toContain("**Systole**");
    expect(out.content).toContain("[diastole](https://example.com/d)");
    expect(out.content).toContain("> Remember the order");
    expect(out.content).toContain("Q = HR \\times SV");
    expect(out.content).toContain("graph LR; A-->B");
    expect(out.content).toContain("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s");
    expect(out.content).toContain("Gray's Anatomy · page 4");
    expect(out.content).toContain("Image: Heart chambers — Figure 1");
    expect(out.content).toMatch(/\|\s*Chamber\s*\|\s*Role\s*\|/);
    expect(out.content).not.toContain("chaos-source:");
    expect(new Set(out.lost)).toEqual(new Set(["quizzes", "flashcards", "images", "calloutStyle", "underline"]));
    expect(describeLosses(out.lost, "en")).toMatch(/quizzes.*and /);
  });

  it("exports a standalone, script-free HTML page in the lesson's direction", () => {
    const out = exportLesson(editor, "html", { title: "<Heart>", language: "ar", dir: "rtl" }, { sourceTitle });
    expect(out.content).toMatch(/^<!doctype html>/);
    expect(out.content).toContain('<html lang="ar" dir="rtl">');
    expect(out.content).toContain("<title>&lt;Heart&gt;</title>");
    expect(out.content).not.toMatch(/<script|chaos-source:/);
    expect(out.content).toContain("<strong>Systole</strong>");
    expect(out.lost).not.toContain("underline");
  });

  it("exports plain text", () => {
    const out = exportLesson(editor, "text", { title: "Heart" }, { sourceTitle });
    expect(out.content).toContain("Systole then diastole (https://example.com/d).");
    expect(out.content).toContain("Chamber\tRole");
    expect(out.content).not.toMatch(/\*\*|<strong>/);
  });

  it("exports the lossless lesson file", () => {
    const out = exportLesson(editor, "json", { title: "Heart" });
    expect(out.lost).toEqual([]);
    const back = parsePortableLesson(out.content);
    expect(back.ok && back.lesson.document).toEqual(toDurableDocument(JSON.parse(JSON.stringify(editor.document))));
  });

  it("uses extension converters and survives a converter that throws", () => {
    const onExtensionError = vi.fn();
    const extensions: LessonEditorExtension[] = [
      { id: "callouts", apiVersion: LESSON_EDITOR_API_VERSION, converters: [{ blockType: "callout", toMarkdown: (b) => `:::note\n${(b.content as { text: string }[])[0].text}\n:::` }] },
      { id: "broken", apiVersion: LESSON_EDITOR_API_VERSION, converters: [{ blockType: "heading", toMarkdown: () => { throw new Error("boom"); } }] },
    ];
    const out = exportLesson(editor, "markdown", {}, { extensions, onExtensionError });
    expect(out.content).toContain(":::note\nRemember the order\n:::");
    expect(out.content).toContain("## Cardiac cycle");
    expect(onExtensionError).toHaveBeenCalledWith("broken", expect.any(Error));
  });
});

describe("lesson import", () => {
  beforeEach(() => mount({}, [{ type: "paragraph", content: [] }]));

  it("detects formats from names and types", () => {
    expect(importFormatFor("Notes.MD")).toBe("markdown");
    expect(importFormatFor("page.htm")).toBe("html");
    expect(importFormatFor("x", "application/json")).toBe("json");
    expect(importFormatFor("a.txt")).toBe("text");
    expect(importFormatFor("a.pdf")).toBeUndefined();
  });

  it("imports Markdown into storable blocks with fresh ids, as one undo step", async () => {
    const result = await parseImport(editor, "# Title\n\n#### Deep\n\nSome **bold** and [a link](javascript:alert(1)).\n\n- one\n  - nested\n\n![pic](https://cdn.example/x.png)\n", "markdown");
    expect(result.lost).toEqual(expect.arrayContaining(["headingLevels", "images"]));
    act(() => { insertImported(editor, result.blocks); });
    const doc = editor.document;
    expect(doc[0]).toMatchObject({ type: "heading", props: { level: 1 } });
    expect(doc[1]).toMatchObject({ type: "heading", props: { level: 3 } });
    expect(JSON.stringify(doc)).not.toContain("javascript:");
    expect(doc.some((b) => b.type === "image")).toBe(false);
    expect(new Set(doc.map((b) => b.id)).size).toBe(doc.length);
    // Everything imported saves through the durable path.
    expect(() => toDurableDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    act(() => { editor.undo(); });
    expect(editor.document).toHaveLength(1);
  });

  it("imports sanitized HTML from Word", async () => {
    const result = await parseImport(editor, '<p class=MsoNormal style="mso-x:1"><b>Hi</b><o:p></o:p></p><script>x()</script><table><tr><td><b>A</b></td><td>B</td></tr></table>', "html");
    act(() => { insertImported(editor, result.blocks); });
    const saved = toDurableDocument(JSON.parse(JSON.stringify(editor.document)));
    expect(saved.blocks.map((b) => b.type)).toEqual(["paragraph", "table"]);
    expect(JSON.stringify(saved)).not.toMatch(/script|mso/);
    expect(result.lost).toContain("tableFormatting");
  });

  it("imports plain text paragraphs, including Arabic", async () => {
    const result = await parseImport(editor, "السطر الأول\nمتابعة\n\nSecond paragraph", "text");
    expect(result.blocks).toHaveLength(2);
    expect((result.blocks[0].content as { text: string }[])[0].text).toBe("السطر الأول\nمتابعة");
  });

  it("imports a lesson file but not another lesson's private references", async () => {
    const json = exportLessonFile();
    const result = await parseImport(editor, json, "json");
    expect(result.lost).toContain("sourceReferences");
    expect(result.blocks.some((b) => ["image", "source", "lessonQuiz", "lessonFlashcards"].includes(b.type))).toBe(false);
    expect(result.blocks.some((b) => b.type === "equation")).toBe(true);
  });

  it("rejects an invalid lesson file with its reason", async () => {
    await expect(parseImport(editor, "{\"format\":\"chaos.lesson\",\"version\":99}", "json")).rejects.toThrow(/newer version/);
  });
});

function exportLessonFile() {
  return JSON.stringify({ format: "chaos.lesson", version: 1, exportedAt: "2026-01-01T00:00:00.000Z", document: lesson });
}

describe("host permissions and extensions in the editor", () => {
  it("hides commands the host does not allow, including quizzes and flashcards", () => {
    expect(deniedCommandKeys({ upload: false, embed: false, educational: false })).toEqual(new Set(["image", "youtube", "quiz", "flashcards", "source", "citation"]));
    expect(deniedCommandKeys({ upload: true, embed: true, educational: true }).size).toBe(0);
  });

  it("turns links the lesson cannot store into text before saving, and says so", async () => {
    await mount({}, [{ type: "paragraph", content: [{ type: "text", text: "x", styles: {} }] }]);
    act(() => { editor.insertBlocks([{ type: "paragraph", content: [{ type: "link", href: "tel:123", content: "call" }] }] as never, editor.document[0], "after"); });
    const saved = onChange.mock.calls.at(-1)![0] as { content: unknown[] }[];
    expect(JSON.stringify(saved)).not.toContain("tel:");
    expect(saved[1].content).toEqual([{ type: "text", text: "call", styles: {} }]);
    expect(onNotice).toHaveBeenCalledWith(expect.stringMatching(/1 link could not be kept/));
  });

  it("refuses unsupported images before uploading", async () => {
    const uploadFile = vi.fn(), onUploadError = vi.fn();
    await mount({ uploadFile, onUploadError });
    await expect(editor.uploadFile!(new File(["<svg/>"], "diagram.svg", { type: "image/svg+xml" }))).rejects.toThrow(/PNG, JPEG or WebP/);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(onUploadError).toHaveBeenCalledWith(expect.stringContaining("diagram.svg"));
  });

  it("refuses uploads when the host turns them off", async () => {
    const uploadFile = vi.fn();
    await mount({ uploadFile, permissions: { upload: false } });
    await expect(editor.uploadFile!(new File(["x"], "a.png", { type: "image/png" }))).rejects.toThrow(/turned off/);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("keeps working when an extension shortcut throws", async () => {
    const extensions: LessonEditorExtension[] = [{ id: "flaky", apiVersion: LESSON_EDITOR_API_VERSION, shortcuts: [{ combo: "Alt-q", run: () => { throw new Error("boom"); } }] }];
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount({ extensions });
    act(() => { editor.focus(); });
    const target = document.querySelector(".lx-editor .ProseMirror")!;
    act(() => { target.dispatchEvent(new KeyboardEvent("keydown", { key: "q", altKey: true, bubbles: true })); });
    expect(error).toHaveBeenCalled();
    expect(editor.document.length).toBeGreaterThan(0);
    error.mockRestore();
  });
});
