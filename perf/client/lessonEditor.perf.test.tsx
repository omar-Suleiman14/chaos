import { Profiler } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LocaleProvider } from "@/lib/i18n";
import { blockText, walk } from "@/lib/learn/doc";
import type { LessonEditorType } from "@/components/learn/editor/blocks";
import { lessonEditorContent } from "../lib/lessonEditorContent";
import { commitCounter, domSize, measureDom } from "../lib/render";
import { recordPerf } from "../lib/record";
import { server } from "./convexServer";

// Only the service boundary is replaced. BlockNote, schema, menus and custom renderers are real.
vi.mock(
  "convex/react",
  async () => (await import("./convexServer")).convexReact,
);
const { default: LessonEditor } =
  await import("@/components/learn/editor/LessonEditor");

beforeEach(() => {
  server.reset();
  localStorage.clear();
  // jsdom has no viewport. Keep lazy diagram previews offscreen rather than
  // accidentally benchmarking asynchronous Mermaid errors as mount work.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

for (const size of [50, 200, 500, 1_000]) {
  for (const language of ["en", "ar"] as const) {
    it(`${size} mixed blocks, ${language}: mount, inline transaction and teardown`, async (ctx) => {
      const content = lessonEditorContent(size, language);
      expect([...walk(content)]).toHaveLength(size);
      const commits = commitCounter();
      const onChange = vi.fn();
      const uploadFile = vi.fn(async () => {
        throw new Error("Baseline must not upload");
      });
      const resolveFileUrl = vi.fn(async (url: string) => url);
      let editor!: LessonEditorType;
      const view = render(
        <LocaleProvider initial={language}>
          <ThemeProvider>
            <Profiler id="lesson-editor" onRender={commits.onRender}>
              <LessonEditor
                initialContent={content}
                language={language}
                sources={[]}
                onReady={(value) => {
                  editor = value;
                }}
                onChange={onChange}
                onManageSources={vi.fn()}
                onEditImage={vi.fn()}
                onEditCitation={vi.fn()}
                onAssist={vi.fn()}
                onUploadError={vi.fn()}
                uploadFile={uploadFile}
                resolveFileUrl={resolveFileUrl}
              />
            </Profiler>
          </ThemeProvider>
        </LocaleProvider>,
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(editor).toBeDefined();
      const before = structuredClone(editor.document);
      expect(before).toMatchObject(content);
      expect([...walk(before)]).toHaveLength(size);
      expect(view.container.querySelector(".lx-editor")).toHaveAttribute(
        "dir",
        language === "ar" ? "rtl" : "ltr",
      );
      const mountCommits = commits.count;
      const mountElements = domSize(view);
      const subscriptions = server.subscriptionCount;

      // jsdom cannot measure keydown-to-paint. This measures one real editor transaction,
      // including LessonEditor's onChange document scan and BlockNote's React/DOM work.
      await act(async () => {
        editor.setTextCursorPosition("editor_0", "end");
      });
      commits.reset();
      onChange.mockClear();
      resolveFileUrl.mockClear();
      const dom = await measureDom(view.container, () => {
        editor.insertInlineContent("x");
      });
      const after = structuredClone(editor.document);
      expect(after[0].content).toEqual([
        {
          type: "text",
          text: `${blockText(content[0])}x`,
          styles: {},
        },
      ]);
      expect(after.slice(1)).toEqual(before.slice(1));
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange.mock.calls[0][0]).toEqual(after);
      expect(uploadFile).not.toHaveBeenCalled();
      expect(server.mutations).toEqual([]);
      expect(server.subscriptionCount).toBe(subscriptions);
      const editCommits = commits.count;
      const urlResolutions = resolveFileUrl.mock.calls.length;
      view.unmount();
      expect(server.subscriptionCount).toBe(0);

      const prefix = `lessonEditor.b${size}.${language}`;
      recordPerf(ctx, {
        [`${prefix}.mountCommits`]: mountCommits,
        [`${prefix}.mountElements`]: mountElements,
        [`${prefix}.subscriptions`]: subscriptions,
        [`${prefix}.editCommits`]: editCommits,
        [`${prefix}.editElementsAdded`]: dom.elementsAdded,
        [`${prefix}.editElementsRemoved`]: dom.elementsRemoved,
        [`${prefix}.editAttributeChanges`]: dom.attributeChanges,
        [`${prefix}.editTextChanges`]: dom.textChanges,
        [`${prefix}.editNotifications`]: onChange.mock.calls.length,
        [`${prefix}.editUrlResolutions`]: urlResolutions,
        [`${prefix}.editMutations`]: server.mutations.length,
        [`${prefix}.subscriptionsAfterUnmount`]: server.subscriptionCount,
      });
    });
  }
}
