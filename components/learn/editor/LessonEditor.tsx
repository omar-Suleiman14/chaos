"use client";

import { contentDirection } from "@/lib/learn/direction";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUsableMark } from "@/lib/journeys";
import * as locales from "@blocknote/core/locales";
import {
  FormattingToolbar, FormattingToolbarController, getFormattingToolbarItems, SuggestionMenuController,
  useBlockNoteEditor, useComponentsContext, useCreateBlockNote, useEditorState, usePortalElement, useUIMode,
} from "@blocknote/react";
import { SuggestionMenu } from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/shadcn";
import { Image as ImageIcon, MessageCircleQuestion, Plus } from "lucide-react";
import { blockText, parseYouTube } from "@/lib/learn/doc";
import type { Block } from "@/lib/learn/doc";
import type { LessonSource } from "@/lib/learn/types";

/** What the writer wants to ask their own assistant about a selection (see HandoffDialog). */
export type SelectionAction = "explain" | "simplify" | "expand" | "rewrite" | "organize";
import { useCopy, useLocale } from "@/lib/i18n";
import { EditorBridge, lessonSchema, type LessonEditorBridge, type LessonEditorType } from "./blocks";
import { focusLessonEnd, isBlankEditorTarget } from "./focusEnd";
import { lessonSlashItems, searchSlashItems } from "./slashMenu";
import { LessonSideMenuController, runBlockAction } from "./sideMenu";
import { announce } from "./announce";
import { fromEditorCodeLanguages, toEditorCodeLanguages } from "./codeLanguages";
import { blockDropTarget, handleBlockDrop } from "./dragFeedback";

const copy = {
  en: {
    imageDetails: "Image details", assist: "Ask ChatGPT or Claude", insert: "Insert block", duplicated: "Duplicated",
    actions: { explain: "Explain", simplify: "Simplify", expand: "Expand", rewrite: "Rewrite", organize: "Organize" } as Record<SelectionAction, string>,
    fileTooLarge: "Files can be at most 20 MB.", uploadFailed: "The file could not be stored on this device.",
  },
  ar: {
    imageDetails: "تفاصيل الصورة", assist: "اسأل ChatGPT أو Claude", insert: "إدراج كتلة", duplicated: "تم التكرار",
    actions: { explain: "اشرح", simplify: "بسّط", expand: "وسّع", rewrite: "أعد الصياغة", organize: "نظّم" } as Record<SelectionAction, string>,
    fileTooLarge: "الحد الأقصى لحجم الملف 20 ميغابايت.", uploadFailed: "تعذّر حفظ الملف على هذا الجهاز.",
  },
};

export const ASSIST_ACTIONS: SelectionAction[] = ["explain", "simplify", "expand", "rewrite", "organize"];

export interface AssistRequest { action: SelectionAction; text: string; blockIds: string[] }

export interface LessonEditorProps {
  initialContent: unknown[];
  language: string;
  sources: LessonSource[];
  onChange: (content: unknown[]) => void;
  onManageSources: () => void;
  onEditImage: (blockId: string, editor: LessonEditorType) => void;
  onEditCitation: LessonEditorBridge["editCitation"];
  onAssist: (request: AssistRequest, editor: LessonEditorType) => void;
  onUploadError: (message: string) => void;
  onReady?: (editor: LessonEditorType) => void;
  uploadFile: (file: File) => Promise<string>;
  resolveFileUrl: (reference: string) => Promise<string>;
  editable?: boolean;
}

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export default function LessonEditor(props: LessonEditorProps) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const dark = useDarkMode();
  const propsRef = useRef(props);
  useEffect(() => { propsRef.current = props; });

  // Once per editor: code languages the editor cannot open are shown as its own ids, restored on save.
  const [languages] = useState(() => toEditorCodeLanguages(props.initialContent));
  const editor = useCreateBlockNote({
    schema: lessonSchema,
    initialContent: languages.blocks.length ? (languages.blocks as never) : undefined,
    dictionary: locale === "ar" ? locales.ar : locales.en,
    uploadFile: async (file: File) => {
      try {
        if (!file.type.startsWith("image/")) throw new Error("Only durable PNG, JPEG and WebP images can be inserted into the lesson.");
        return await propsRef.current.uploadFile(file);
      } catch (err) {
        propsRef.current.onUploadError(err instanceof Error ? err.message : t.uploadFailed);
        throw err;
      }
    },
    resolveFileUrl: reference => propsRef.current.resolveFileUrl(reference),
    tables: { splitCells: false, cellBackgroundColor: false, cellTextColor: false, headers: true },
    // A thin accent line, styled in learn.css (.prosemirror-dropcursor-block); no inline colour.
    dropCursor: {
      width: 3, color: false,
      hooks: {
        computeDropPosition: ({ editor: view, event, defaultPosition }) => {
          const target = blockDropTarget(view as LessonEditorType, event.clientX, event.clientY);
          return target === undefined ? defaultPosition : target && { pos: target.pos, orientation: "block-horizontal" };
        },
      },
    },
  }, [locale]);

  useEffect(() => { props.onReady?.(editor); }, [editor]); // oxlint-disable-line react-hooks/exhaustive-deps -- once per editor
  // Mounted with its content means typeable: the lesson editor journey ends here.
  useUsableMark("lesson.edit", true);

  const bridge = useMemo<LessonEditorBridge>(() => ({
    sources: props.sources, readOnly: false,
    manageSources: () => propsRef.current.onManageSources(),
    editImage: (blockId) => propsRef.current.onEditImage(blockId, editor),
    editCitation: (...args) => propsRef.current.onEditCitation(...args),
  }), [props.sources, editor]);

  const slashItems = () => lessonSlashItems(editor, locale === "ar" ? "ar" : "en", (blockId) => propsRef.current.onEditCitation(blockId));
  const dir = contentDirection(props.language);

  return (
    <EditorBridge.Provider value={bridge}>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Blank-canvas clicks and block shortcuts; the editor inside is the interactive element. */}
      <div className="lx-editor" dir={dir} lang={props.language}
        onPointerDown={event => {
          if (props.editable === false || event.button !== 0 || !isBlankEditorTarget(event.target)) return;
          event.preventDefault();
          focusLessonEnd(editor);
        }}
        onDropCapture={event => { handleBlockDrop(editor, event); }}
        onKeyDownCapture={event => {
          // Notion's duplicate shortcut: the block (or selected blocks) under the caret, one undo step.
          if (props.editable === false || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "d") return;
          if (!editor.isFocused()) return;
          event.preventDefault();
          const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
          runBlockAction(editor, "duplicate", blocks as never);
          announce(t.duplicated);
        }}>
        <BlockNoteView editor={editor} editable={props.editable !== false} theme={dark ? "dark" : "light"} slashMenu={false} formattingToolbar={false} sideMenu={false}
          onChange={() => { if (!embedYouTubeVideos(editor)) propsRef.current.onChange(fromEditorCodeLanguages(editor.document as unknown[], languages.restore)); }}>
          <SuggestionMenuController triggerCharacter="/" getItems={async (query) => searchSlashItems(slashItems(), query)} />
          <FormattingToolbarController formattingToolbar={() => (
            <FormattingToolbar>
              <MobileInsertButton label={t.insert} />
              {getFormattingToolbarItems()}
              <ImageDetailsButton label={t.imageDetails} onClick={(id) => propsRef.current.onEditImage(id, editor)} />
              <AssistButtons labels={t.actions} title={t.assist} onRun={(action) => {
                const selection = editor.getSelection();
                const blocks = (selection?.blocks ?? [editor.getTextCursorPosition().block]) as unknown as Block[];
                const text = editor.getSelectedText() || blocks.map(blockText).join("\n");
                propsRef.current.onAssist({ action, text, blockIds: blocks.map((b) => b.id) }, editor);
              }} />
            </FormattingToolbar>
          )} />
          <LessonSideMenuController dir={dir} />
        </BlockNoteView>
      </div>
    </EditorBridge.Provider>
  );
}

/**
 * On phones the formatting toolbar sits above the keyboard (BlockNote's mobile mode) and is the
 * only always-reachable control, so it starts with "+": open the block menu without hunting for
 * a gutter that touch screens do not have.
 */
function MobileInsertButton({ label }: { label: string }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor(lessonSchema);
  const mode = useUIMode();
  if (mode !== "mobile") return null;
  return <Components.FormattingToolbar.Button className="bn-button lx-mobile-insert" label={label} mainTooltip={label} icon={<Plus size={18} />}
    onClick={() => {
      const block = editor.getTextCursorPosition().block;
      const empty = block.type === "paragraph" && Array.isArray(block.content) && block.content.length === 0;
      if (!empty) editor.setTextCursorPosition(editor.insertBlocks([{ type: "paragraph" }], block, "after")[0], "end");
      editor.getExtension(SuggestionMenu)?.openSuggestionMenu("/");
    }} />;
}

function ImageDetailsButton({ label, onClick }: { label: string; onClick: (blockId: string) => void }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor(lessonSchema);
  const block = useEditorState({ editor, selector: ({ editor }) => {
    const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
    return blocks.length === 1 && blocks[0].type === "image" ? blocks[0] : undefined;
  } });
  if (!block) return null;
  return <Components.FormattingToolbar.Button className="bn-button" label={label} mainTooltip={label} icon={<ImageIcon size={16} />} onClick={() => onClick(block.id)} />;
}

/** Hands a selection to the writer's own ChatGPT or Claude. Nothing in the lesson changes. */
function AssistButtons({ labels, title, onRun }: { labels: Record<SelectionAction, string>; title: string; onRun: (action: SelectionAction) => void }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor(lessonSchema);
  const hasText = useEditorState({ editor, selector: ({ editor }) => {
    const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
    return blocks.some((b) => Array.isArray(b.content));
  } });
  const portal = usePortalElement();
  if (!hasText) return null;
  return (
    <Components.Generic.Menu.Root portalElement={portal} position="bottom-start">
      <Components.Generic.Menu.Trigger>
        <Components.FormattingToolbar.Button className="bn-button" label={title} mainTooltip={title} icon={<MessageCircleQuestion size={16} />}>{title}</Components.FormattingToolbar.Button>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown className="bn-menu-dropdown">
        {ASSIST_ACTIONS.map((action) => (
          <Components.Generic.Menu.Item key={action} className="bn-menu-item" onClick={() => onRun(action)}>{labels[action]}</Components.Generic.Menu.Item>
        ))}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}

/**
 * BlockNote's own video block plays files with a <video> tag, so a YouTube link pasted into it
 * shows a black frame with no YouTube controls. Swap any such block for a YouTube block.
 * Returns true when a swap is queued; the swap fires onChange again, and that one saves.
 */
function embedYouTubeVideos(editor: LessonEditorType): boolean {
  const found: { id: string; videoId: string; start?: number; caption: string }[] = [];
  const walk = (blocks: { id: string; type: string; props: Record<string, unknown>; children?: unknown[] }[]) => {
    for (const b of blocks) {
      const yt = b.type === "video" ? parseYouTube(String(b.props.url ?? "")) : null;
      if (yt) found.push({ id: b.id, videoId: yt.id, start: yt.start, caption: String(b.props.caption ?? "") });
      if (b.children?.length) walk(b.children as typeof blocks);
    }
  };
  walk(editor.document as never);
  if (!found.length) return false;
  // After this change event settles: the swap's own change event then saves the result.
  queueMicrotask(() => {
    for (const v of found) if (editor.getBlock(v.id)) editor.replaceBlocks([v.id], [{ type: "youtube", props: { videoId: v.videoId, start: v.start ?? 0, caption: v.caption } } as never]);
  });
  return true;
}
