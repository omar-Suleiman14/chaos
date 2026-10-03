"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import * as locales from "@blocknote/core/locales";
import {
  BlockColorsItem, DragHandleMenu, FormattingToolbar, FormattingToolbarController, getDefaultReactSlashMenuItems, getFormattingToolbarItems,
  RemoveBlockItem, SideMenu, SideMenuController, SuggestionMenuController, TableColumnHeaderItem, TableRowHeaderItem, useBlockNoteEditor,
  useComponentsContext, useCreateBlockNote, useEditorState, usePortalElement, useExtensionState, type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/shadcn";
import { BookMarked, Copy, Image as ImageIcon, Info, MoveDown, MoveUp, PlayCircle, Quote, Sigma, MessageCircleQuestion } from "lucide-react";
import { blockText } from "@/lib/learn/doc";
import type { Block } from "@/lib/learn/doc";
import type { LessonSource } from "@/lib/learn/types";

/** What the writer wants to ask their own assistant about a selection (see HandoffDialog). */
export type SelectionAction = "explain" | "simplify" | "expand" | "rewrite" | "organize";
import { useCopy, useLocale } from "@/lib/i18n";
import { EditorBridge, lessonSchema, type LessonEditorBridge, type LessonEditorType } from "./blocks";
import { focusLessonEnd, isBlankEditorTarget } from "./focusEnd";

const copy = {
  en: {
    groups: { lesson: "Lesson" },
    callout: "Callout", calloutHint: "Highlight a note, tip or caution", equation: "Equation", equationHint: "Math with LaTeX",
    youtube: "YouTube", youtubeHint: "Embed a video, or just the useful part", source: "Source", sourceHint: "Show the material this is based on",
    cite: "Citation", citeHint: "Point this sentence to a source (Lecture 8 · page 23)",
    imageDetails: "Image details", assist: "Ask ChatGPT or Claude", duplicate: "Duplicate", moveUp: "Move up", moveDown: "Move down", delete: "Delete", colors: "Colours",
    headerRow: "Header row", headerCol: "Header column",
    actions: { explain: "Explain", simplify: "Simplify", expand: "Expand", rewrite: "Rewrite", organize: "Organize" } as Record<SelectionAction, string>,
    fileTooLarge: "Files can be at most 20 MB.", uploadFailed: "The file could not be stored on this device.",
  },
  ar: {
    groups: { lesson: "الدرس" },
    callout: "تنبيه", calloutHint: "أبرز ملاحظة أو نصيحة أو تحذيرًا", equation: "معادلة", equationHint: "رياضيات بصيغة LaTeX",
    youtube: "YouTube", youtubeHint: "ضمّن فيديو أو الجزء المفيد منه فقط", source: "مصدر", sourceHint: "اعرض المادة التي بُني عليها هذا الجزء",
    cite: "استشهاد", citeHint: "اربط هذه الجملة بمصدر (المحاضرة 8 · صفحة 23)",
    imageDetails: "تفاصيل الصورة", assist: "اسأل ChatGPT أو Claude", duplicate: "تكرار", moveUp: "نقل لأعلى", moveDown: "نقل لأسفل", delete: "حذف", colors: "الألوان",
    headerRow: "صف عناوين", headerCol: "عمود عناوين",
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

  const editor = useCreateBlockNote({
    schema: lessonSchema,
    initialContent: props.initialContent.length ? (props.initialContent as never) : undefined,
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
  }, [locale]);

  useEffect(() => { props.onReady?.(editor); }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps -- once per editor

  const bridge = useMemo<LessonEditorBridge>(() => ({
    sources: props.sources, readOnly: false,
    manageSources: () => propsRef.current.onManageSources(),
    editImage: (blockId) => propsRef.current.onEditImage(blockId, editor),
    editCitation: (...args) => propsRef.current.onEditCitation(...args),
  }), [props.sources, editor]);

  const slashItems = (): DefaultReactSuggestionItem[] => {
    const base = getDefaultReactSlashMenuItems(editor).filter((item) => !["audio", "file"].includes((item as { key?: string }).key ?? ""));
    const group = t.groups.lesson;
    return [
      ...base,
      { key: "callout", title: t.callout, subtext: t.calloutHint, group, icon: <Info size={18} />, aliases: ["note", "tip", "warning", "ملاحظة"], onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: "callout" }); } },
      { key: "equation", title: t.equation, subtext: t.equationHint, group, icon: <Sigma size={18} />, aliases: ["math", "latex", "formula", "معادلة"], onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: "equation" }); } },
      { key: "youtube", title: t.youtube, subtext: t.youtubeHint, group, icon: <PlayCircle size={18} />, aliases: ["video", "yt", "فيديو"], onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: "youtube" }); } },
      { key: "source", title: t.source, subtext: t.sourceHint, group, icon: <BookMarked size={18} />, aliases: ["reference", "pdf", "slides", "مرجع"], onItemClick: () => { insertOrUpdateBlockForSlashMenu(editor, { type: "source" }); } },
      {
        key: "citation", title: t.cite, subtext: t.citeHint, group, icon: <Quote size={18} />, aliases: ["cite", "ref", "page", "استشهاد"],
        onItemClick: () => propsRef.current.onEditCitation(editor.getTextCursorPosition().block.id),
      },
      { key: "quiz", title: "Quiz", subtext: "Embed a published Chaos quiz", group, icon: <BookMarked size={18} />, aliases: ["quiz", "practice", "assessment"], onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "lessonQuiz" }) },
    ] as DefaultReactSuggestionItem[];
  };

  return (
    <EditorBridge.Provider value={bridge}>
      <div className="lx-editor" dir={props.language === "ar" ? "rtl" : "ltr"} lang={props.language}
        onPointerDown={event => {
          if (props.editable === false || event.button !== 0 || !isBlankEditorTarget(event.target)) return;
          event.preventDefault();
          focusLessonEnd(editor);
        }}>
        <BlockNoteView editor={editor} editable={props.editable !== false} theme={dark ? "dark" : "light"} slashMenu={false} formattingToolbar={false} sideMenu={false}
          onChange={() => propsRef.current.onChange(editor.document as unknown[])}>
          <SuggestionMenuController triggerCharacter="/" getItems={async (query) => filterSuggestionItems(slashItems(), query)} />
          <FormattingToolbarController formattingToolbar={() => (
            <FormattingToolbar>
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
          <SideMenuController sideMenu={(sideProps) => (
            <SideMenu {...sideProps} dragHandleMenu={() => (
              <DragHandleMenu>
                <RemoveBlockItem>{t.delete}</RemoveBlockItem>
                <BlockActionItem kind="duplicate" icon={<Copy size={14} />}>{t.duplicate}</BlockActionItem>
                <BlockActionItem kind="up" icon={<MoveUp size={14} />}>{t.moveUp}</BlockActionItem>
                <BlockActionItem kind="down" icon={<MoveDown size={14} />}>{t.moveDown}</BlockActionItem>
                <BlockColorsItem>{t.colors}</BlockColorsItem>
                <TableRowHeaderItem>{t.headerRow}</TableRowHeaderItem>
                <TableColumnHeaderItem>{t.headerCol}</TableColumnHeaderItem>
              </DragHandleMenu>
            )} />
          )} />
        </BlockNoteView>
      </div>
    </EditorBridge.Provider>
  );
}

/** Duplicate and keyboard-free move for the block handle menu (dragging still works). */
function BlockActionItem({ kind, icon, children }: { kind: "duplicate" | "up" | "down"; icon: React.ReactNode; children: React.ReactNode }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block });
  if (!block) return null;
  return (
    <Components.Generic.Menu.Item className="bn-menu-item" icon={icon} onClick={() => {
      if (kind === "duplicate") {
        const strip = (b: typeof block): typeof block => ({ ...b, id: undefined as never, children: b.children.map(strip) });
        editor.insertBlocks([strip(block) as never], block, "after");
        return;
      }
      editor.setTextCursorPosition(block, "end");
      if (kind === "up") editor.moveBlocksUp(); else editor.moveBlocksDown();
    }}>
      {children}
    </Components.Generic.Menu.Item>
  );
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
