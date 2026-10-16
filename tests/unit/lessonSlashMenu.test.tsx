import { act, render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import type { LessonEditorType } from "@/components/learn/editor/blocks";
import { lessonSlashItems, normalizeSearch, searchSlashItems, UNSAVED_SLASH_KEYS } from "@/components/learn/editor/slashMenu";
import { toDurableDocument } from "@/lib/learn/chaosDocument";

vi.mock("convex/react", () => ({
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
}));
const { default: LessonEditor } = await import("@/components/learn/editor/LessonEditor");

let editor!: LessonEditorType;
beforeAll(async () => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  render(
    <LocaleProvider initial="en">
      <LessonEditor initialContent={[]} language="en" sources={[]} onReady={(value) => { editor = value; }}
        onChange={vi.fn()} onManageSources={vi.fn()} onEditImage={vi.fn()} onEditCitation={vi.fn()} onAssist={vi.fn()}
        onUploadError={vi.fn()} uploadFile={vi.fn()} resolveFileUrl={async (url) => url} />
    </LocaleProvider>,
  );
  await act(async () => { await Promise.resolve(); });
});

/** Commands that open a picker or dialog instead of inserting a block by themselves. */
const opensSomethingElse = new Set(["citation", "emoji"]);
/**
 * Placeholders the writer completes before the draft can save: an upload, a video link, the quiz,
 * flashcard set or source to show. Saving them empty is refused (never partially saved); the
 * test pins that refusal so a silent drop cannot creep in.
 */
const needsInput: Record<string, RegExp> = { image: /./, youtube: /videoId/, quiz: /lessonData/, flashcards: /setId/, source: /sourceId|Too small|Invalid/ };

describe("lesson slash menu", () => {
  it("offers no command whose block the lesson cannot store", () => {
    const keys = lessonSlashItems(editor, "en", vi.fn()).map((item) => item.key);
    for (const key of UNSAVED_SLASH_KEYS) expect(keys).not.toContain(key);
    expect(keys).not.toContain("toggle_heading");
    expect(keys.filter((key) => key.startsWith("heading"))).toEqual(["heading", "heading_2", "heading_3"]);
    // Every Chaos block stays discoverable.
    expect(keys).toEqual(expect.arrayContaining(["callout", "quiz", "flashcards", "equation", "diagram", "source", "citation", "youtube"]));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps each group together, in reading order", () => {
    const groups = lessonSlashItems(editor, "en", vi.fn()).map((item) => item.group);
    const runs = groups.filter((group, i) => group !== groups[i - 1]);
    expect(runs).toEqual(["Basic blocks", "Headings", "Lesson blocks", "Media", "Advanced", "Other"]);
  });

  for (const item of ["paragraph", "heading", "heading_2", "heading_3", "bullet_list", "numbered_list", "check_list", "toggle_list", "quote", "divider", "code_block", "table", "callout", "quiz", "flashcards", "equation", "diagram", "source", "youtube", "image"]) {
    it(`inserts "${item}" as content the durable save path accepts or explicitly holds back`, () => {
      act(() => { editor.replaceBlocks(editor.document, [{ type: "paragraph", content: "Before" }, { type: "paragraph" }]); });
      act(() => { editor.setTextCursorPosition(editor.document[1], "end"); });
      const command = lessonSlashItems(editor, "en", vi.fn()).find((candidate) => candidate.key === item)!;
      expect(command).toBeDefined();
      act(() => { command.onItemClick(); });
      expect(editor.document.length).toBeGreaterThanOrEqual(2);
      const save = () => toDurableDocument(JSON.parse(JSON.stringify(editor.document)));
      if (needsInput[item]) expect(save).toThrow(needsInput[item]);
      else expect(save).not.toThrow();
    });
  }

  it("does not insert anything for commands that open a dialog or another menu", () => {
    act(() => { editor.replaceBlocks(editor.document, [{ type: "paragraph" }]); editor.setTextCursorPosition(editor.document[0], "end"); });
    const onCitation = vi.fn();
    const items = lessonSlashItems(editor, "en", onCitation);
    act(() => { items.find((i) => i.key === "citation")!.onItemClick(); });
    expect(onCitation).toHaveBeenCalledWith(editor.document[0].id);
    expect(editor.document).toHaveLength(1);
    expect(opensSomethingElse.has("emoji")).toBe(true);
  });
});

describe("slash search", () => {
  const items = () => lessonSlashItems(editor, "en", vi.fn());
  const titles = (query: string) => searchSlashItems(items(), query).map((item) => item.title);

  it("ranks title prefixes first and keeps groups contiguous", () => {
    expect(titles("head")[0]).toBe("Heading 1");
    const groups = searchSlashItems(items(), "li").map((item) => item.group);
    expect(groups.filter((g, i) => g !== groups[i - 1]).length).toBe(new Set(groups).size);
  });

  it("finds Chaos blocks by aliases in both languages", () => {
    expect(titles("checkpoint")).toContain("Quiz / checkpoint");
    expect(titles("اختبار")).toContain("Quiz / checkpoint");
    expect(titles("بطاقات")).toContain("Flashcards");
    expect(titles("mermaid")).toContain("Diagram");
  });

  it("ignores Arabic diacritics, tatweel and alef/yaa/taa-marbuta spelling", () => {
    expect(normalizeSearch("إختبَار")).toBe(normalizeSearch("اختبار"));
    expect(normalizeSearch("معادلـة")).toBe(normalizeSearch("معادله"));
    expect(titles("إختبار")).toContain("Quiz / checkpoint");
    expect(titles("معادله")).toContain("Equation");
  });

  it("returns nothing for a query nothing matches (the menu shows its empty state)", () => {
    expect(searchSlashItems(items(), "zzqx")).toEqual([]);
  });

  it("lists every command, in order, for an empty query", () => {
    const all = items();
    expect(searchSlashItems(all, "")).toBe(all);
    expect(searchSlashItems(all, "  ").map((i) => i.key)).toEqual(all.map((i) => i.key));
  });
});
