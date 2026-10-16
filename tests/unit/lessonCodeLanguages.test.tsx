import { act, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/components/ThemeProvider";
import type { LessonDocument } from "@/convex/learnModel";
import type { LessonEditorType } from "@/components/learn/editor/blocks";
import { editorCodeLanguage } from "@/components/learn/editor/codeLanguages";
import { fromDurableDocument, toDurableDocument } from "@/lib/learn/chaosDocument";

vi.mock("convex/react", () => ({
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
}));
const { default: LessonEditor } = await import("@/components/learn/editor/LessonEditor");

const base = { citations: [], conceptIds: [] };
// Languages as assistants and imports write them; none is a BlockNote language id.
const lesson: LessonDocument = { schemaVersion: 1, blocks: [
  { ...base, id: "js", type: "code", language: "js", text: "const bpm = 72;" },
  { ...base, id: "py", type: "code", language: "Python", text: "bpm = 72" },
  { ...base, id: "odd", type: "code", language: "cobol", text: "DISPLAY 'HI'." },
  { ...base, id: "none", type: "code", language: "", text: "plain" },
  { ...base, id: "p", type: "paragraph", text: "After." },
] };

it("maps stored names onto the editor's language ids", () => {
  expect(editorCodeLanguage("js")).toBe("javascript");
  expect(editorCodeLanguage("Python")).toBe("python");
  expect(editorCodeLanguage("typescript")).toBe("typescript");
  expect(editorCodeLanguage("cobol")).toBe("text");
  expect(editorCodeLanguage("")).toBe("text");
  expect(editorCodeLanguage(undefined)).toBe("text");
});

it("opens lessons with any stored code language and saves them unchanged", async () => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  let editor!: LessonEditorType;
  const onChange = vi.fn();
  render(
    <LocaleProvider initial="en"><ThemeProvider>
      <LessonEditor initialContent={fromDurableDocument(lesson)} language="en" sources={[]} onReady={(value) => { editor = value; }}
        onChange={onChange} onManageSources={vi.fn()} onEditImage={vi.fn()} onEditCitation={vi.fn()} onAssist={vi.fn()}
        onUploadError={vi.fn()} uploadFile={vi.fn()} resolveFileUrl={async (url) => url} />
    </ThemeProvider></LocaleProvider>,
  );
  await act(async () => { await Promise.resolve(); });
  expect(editor.getBlock("js")!.props.language).toBe("javascript");
  expect(editor.getBlock("odd")!.props.language).toBe("text");

  // An unrelated edit saves every stored language name as it was.
  act(() => { editor.updateBlock("p", { content: "After, edited." }); });
  const saved = toDurableDocument(JSON.parse(JSON.stringify(onChange.mock.lastCall![0])), lesson);
  expect(saved.blocks.filter((b) => b.type === "code").map((b) => (b as { language: string }).language)).toEqual(["js", "Python", "cobol", ""]);

  // A language the writer picks is saved as picked.
  act(() => { editor.updateBlock("odd", { props: { language: "rust" } }); });
  const changed = toDurableDocument(JSON.parse(JSON.stringify(onChange.mock.lastCall![0])), lesson);
  expect(changed.blocks.find((b) => b.id === "odd")).toMatchObject({ language: "rust" });
  expect(changed.blocks.find((b) => b.id === "js")).toMatchObject({ language: "js" });
});
