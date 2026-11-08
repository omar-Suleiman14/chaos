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
import { lessonSlashItems, searchSlashItems, type LessonSlashItem } from "./slashMenu";
import { LessonSideMenuController, runBlockAction } from "./sideMenu";
import { announce } from "./announce";
import { fromEditorCodeLanguages, toEditorCodeLanguages } from "./codeLanguages";
import { blockDropTarget, handleBlockDrop } from "./dragFeedback";
import { checkLessonImage, isBlockNoteClipboard, isLessonLinkAllowed, normalizeEditorLinks, sanitizeClipboardHtml, uploadProblemCopy } from "@/lib/learn/editorPolicy";
import { findShortcut, isolate, validateExtensions, type LessonEditorExtension } from "./extensions";

const copy = {
  en: {
    imageDetails: "Image details", assist: "Ask ChatGPT or Claude", insert: "Insert block", duplicated: "Duplicated",
    actions: { explain: "Explain", simplify: "Simplify", expand: "Expand", rewrite: "Rewrite", organize: "Organize" } as Record<SelectionAction, string>,
    uploadFailed: "The image could not be uploaded. Check your connection and try again.",
    uploadNotAllowed: "Image uploads are turned off for this editor.",
    pasteCleaned: (images: number, media: number) => [images ? `${images} pasted image${images === 1 ? "" : "s"}` : "", media ? `${media} embedded video or audio item${media === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ") + " left out. Upload images with “/Image”.",
    linksRemoved: (n: number) => `${n} link${n === 1 ? "" : "s"} could not be kept (only web and email links are allowed). The text stays.`,
    extensionFailed: (id: string) => `The “${id}” add-on stopped working and was skipped. Your lesson is unchanged.`,
  },
  ar: {
    imageDetails: "تفاصيل الصورة", assist: "اسأل ChatGPT أو Claude", insert: "إدراج كتلة", duplicated: "تم التكرار",
    actions: { explain: "اشرح", simplify: "بسّط", expand: "وسّع", rewrite: "أعد الصياغة", organize: "نظّم" } as Record<SelectionAction, string>,
    uploadFailed: "تعذّر رفع الصورة. تحقّق من الاتصال وحاول مرة أخرى.",
    uploadNotAllowed: "رفع الصور غير متاح في هذا المحرر.",
    pasteCleaned: (images: number, media: number) => [images ? `${images} صورة ملصقة` : "", media ? `${media} عنصر فيديو أو صوت مضمّن` : ""].filter(Boolean).join(" و") + " لم تُدرج. ارفع الصور باستخدام «/صورة».",
    linksRemoved: (n: number) => `تعذّر الاحتفاظ بـ ${n} رابط (يُسمح فقط بروابط الويب والبريد). بقي النص.`,
    extensionFailed: (id: string) => `توقفت الإضافة «${id}» عن العمل وتم تخطيها. لم يتغير درسك.`,
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
  /**
   * What the host allows in this editor. Hidden commands are not offered at all, so a writer never
   * builds something the host would refuse; the server still checks every write.
   */
  permissions?: Partial<LessonEditorPermissions>;
  /** Host filter over slash command keys (built-in and extension); return false to hide one. */
  commandFilter?: (key: string) => boolean;
  /** Commands, toolbar actions, shortcuts and export converters added by the host. */
  extensions?: readonly LessonEditorExtension[];
  /** Short, non-blocking messages (paste clean-up, removed links). Defaults to a screen reader announcement. */
  onNotice?: (message: string) => void;
  /** Spacing between blocks; "compact" fits more on small screens. */
  density?: "comfortable" | "compact";
  /** Body typeface; the workspace font by default. */
  font?: "default" | "serif" | "mono";
}

export interface LessonEditorPermissions {
  /** Upload images into the lesson's private sources. */
  upload: boolean;
  /** Insert YouTube embeds. */
  embed: boolean;
  /** Insert quizzes, flashcards, sources and citations. */
  educational: boolean;
}
const DEFAULT_PERMISSIONS: LessonEditorPermissions = { upload: true, embed: true, educational: true };
const EDUCATIONAL_KEYS = new Set(["quiz", "flashcards", "source", "citation"]);

/** Slash command keys a permission set hides. */
export function deniedCommandKeys(permissions: LessonEditorPermissions): Set<string> {
  const denied = new Set<string>();
  if (!permissions.upload) denied.add("image");
  if (!permissions.embed) denied.add("youtube");
  if (!permissions.educational) EDUCATIONAL_KEYS.forEach((k) => denied.add(k));
  return denied;
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
  const permissions = { ...DEFAULT_PERMISSIONS, ...props.permissions };
  const notice = (message: string) => (propsRef.current.onNotice ?? announce)(message);
  const reportedExtensions = useRef(new Set<string>());
  const onExtensionError = (id: string, error: unknown) => {
    console.error(`Lesson editor extension "${id}" failed`, error);
    if (reportedExtensions.current.has(id)) return;
    reportedExtensions.current.add(id);
    notice(t.extensionFailed(id));
  };
  const lastRemovedLinks = useRef(0);
  const editor = useCreateBlockNote({
    schema: lessonSchema,
    initialContent: languages.blocks.length ? (languages.blocks as never) : undefined,
    dictionary: locale === "ar" ? locales.ar : locales.en,
    uploadFile: async (file: File) => {
      try {
        if (propsRef.current.permissions?.upload === false) throw new Error(t.uploadNotAllowed);
        // Checked here, before any network request, with a message that names the file and the fix.
        const problem = checkLessonImage(file);
        if (problem) throw new Error(uploadProblemCopy[locale === "ar" ? "ar" : "en"][problem](file.name || "image"));
        return await propsRef.current.uploadFile(file);
      } catch (err) {
        propsRef.current.onUploadError(err instanceof Error && err.message ? err.message : t.uploadFailed);
        throw err;
      }
    },
    // Only links the lesson can store (web and email); others never become links.
    links: { isValidLink: isLessonLinkAllowed },
    pasteHandler: ({ event, editor: target, defaultPasteHandler }) => {
      const data = event.clipboardData;
      const inCode = target.transact((tr) => !!(tr.selection.$from.parent.type.spec.code && tr.selection.$to.parent.type.spec.code));
      // Copies inside Chaos, VS Code, Markdown and plain text keep BlockNote's own handling.
      if (!data || inCode || isBlockNoteClipboard(data.types) || data.types.includes("vscode-editor-data") || data.types.includes("text/markdown") || !data.types.includes("text/html")) return defaultPasteHandler();
      const clean = sanitizeClipboardHtml(data.getData("text/html"));
      if (!clean.html.trim()) return defaultPasteHandler({ prioritizeMarkdownOverHTML: true });
      target.pasteHTML(clean.html);
      if (clean.removedImages || clean.removedMedia) notice(t.pasteCleaned(clean.removedImages, clean.removedMedia));
      return true;
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

  const { valid: extensions, problems: extensionProblems } = useMemo(() => validateExtensions(props.extensions ?? [], BUILT_IN_COMMAND_KEYS), [props.extensions]);
  useEffect(() => { for (const p of extensionProblems) console.warn(`Lesson editor extension "${p.extension}" was not loaded: ${p.message}`); }, [extensionProblems]);
  const denied = deniedCommandKeys(permissions);
  const slashItems = () => {
    const builtIn = lessonSlashItems(editor, locale === "ar" ? "ar" : "en", (blockId) => propsRef.current.onEditCitation(blockId));
    const other = builtIn.find((i) => i.slashGroup === "other")?.group ?? (locale === "ar" ? "أخرى" : "Other");
    const added = extensions.flatMap((ext) => (ext.slashCommands ?? []).map((c): LessonSlashItem => ({
      key: c.key, slashGroup: "other" as const, group: c.group ?? other, title: c.title, subtext: c.subtext, aliases: c.aliases, icon: c.icon,
      onItemClick: () => isolate(ext.id, () => c.run(editor), undefined, onExtensionError),
    })));
    const filter = propsRef.current.commandFilter;
    return [...builtIn, ...added].filter((item) => !denied.has(item.key) && isolate("commandFilter", () => !filter || filter(item.key), true, onExtensionError));
  };
  const dir = contentDirection(props.language);

  return (
    <EditorBridge.Provider value={bridge}>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Blank-canvas clicks and block shortcuts; the editor inside is the interactive element. */}
      <div className="lx-editor" dir={dir} lang={props.language} data-density={props.density === "compact" ? "compact" : undefined} data-font={props.font && props.font !== "default" ? props.font : undefined}
        onPointerDown={event => {
          if (props.editable === false || event.button !== 0 || !isBlankEditorTarget(event.target)) return;
          event.preventDefault();
          focusLessonEnd(editor);
        }}
        onDropCapture={event => { handleBlockDrop(editor, event); }}
        onKeyDownCapture={event => {
          if (props.editable !== false && extensions.length && editor.isFocused()) {
            const match = findShortcut(extensions, event.nativeEvent);
            if (match && isolate(match.extension, () => match.shortcut.run(editor) !== false, false, onExtensionError)) { event.preventDefault(); event.stopPropagation(); return; }
          }
          // Notion's duplicate shortcut: the block (or selected blocks) under the caret, one undo step.
          if (props.editable === false || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "d") return;
          if (!editor.isFocused()) return;
          event.preventDefault();
          const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
          runBlockAction(editor, "duplicate", blocks as never);
          announce(t.duplicated);
        }}>
        <BlockNoteView editor={editor} editable={props.editable !== false} theme={dark ? "dark" : "light"} slashMenu={false} formattingToolbar={false} sideMenu={false}
          onChange={() => {
            if (embedYouTubeVideos(editor)) return;
            // Links the lesson cannot store are saved as their text (and the writer is told once per change).
            const links = normalizeEditorLinks(editor.document as unknown[]);
            if (links.removed && links.removed !== lastRemovedLinks.current) notice(t.linksRemoved(links.removed));
            lastRemovedLinks.current = links.removed;
            propsRef.current.onChange(fromEditorCodeLanguages(links.blocks, languages.restore));
          }}>
          <SuggestionMenuController triggerCharacter="/" getItems={async (query) => searchSlashItems(slashItems(), query)} />
          <FormattingToolbarController formattingToolbar={() => (
            <FormattingToolbar>
              <MobileInsertButton label={t.insert} />
              {getFormattingToolbarItems()}
              <ImageDetailsButton label={t.imageDetails} onClick={(id) => propsRef.current.onEditImage(id, editor)} />
              {extensions.flatMap((ext) => (ext.toolbarActions ?? []).map((action) => (
                <ExtensionToolbarButton key={`${ext.id}:${action.key}`} label={action.label} icon={action.icon}
                  available={() => isolate(ext.id, () => action.isAvailable?.(editor) ?? true, false, onExtensionError)}
                  onClick={() => isolate(ext.id, () => action.run(editor), undefined, onExtensionError)} />
              )))}
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

/** Built-in slash command keys: extensions cannot reuse them. */
const BUILT_IN_COMMAND_KEYS = ["paragraph", "heading", "heading_2", "heading_3", "bullet_list", "numbered_list", "check_list", "toggle_list", "quote", "divider", "code_block", "table", "image", "emoji", "callout", "equation", "youtube", "diagram", "source", "citation", "quiz", "flashcards"];

function ExtensionToolbarButton({ label, icon, available, onClick }: { label: string; icon: React.ReactNode; available: () => boolean; onClick: () => void }) {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor(lessonSchema);
  // Re-evaluated as the selection changes.
  const show = useEditorState({ editor, selector: () => available() });
  if (!show) return null;
  return <Components.FormattingToolbar.Button className="bn-button" label={label} mainTooltip={label} icon={icon} onClick={onClick} />;
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
