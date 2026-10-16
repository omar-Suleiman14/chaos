"use client";

import { SideMenuExtension, SuggestionMenu } from "@blocknote/core/extensions";
import {
  blockTypeSelectItems, BlockColorsItem, SideMenuController, TableColumnHeaderItem, TableRowHeaderItem,
  useBlockNoteEditor, useComponentsContext, useDictionary, useExtension, useExtensionState, usePortalElement,
} from "@blocknote/react";
import { ArrowDown, ArrowUp, Copy, CopyPlus, GripVertical, Plus, Repeat2, Trash2 } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useCopy } from "@/lib/i18n";
import type { LessonEditorType } from "./blocks";
import { blockDragEnded, blockDragStarted } from "./dragFeedback";
import { announce } from "./announce";

/**
 * Notion-style gutter controls for the lesson editor, built on BlockNote's own SideMenuController
 * (visibility, hover tracking, freezing while the menu is open, and native block dragging).
 * Chaos supplies the buttons, the action menu and the placement: the pair sits beside the block's
 * first line (whatever its height) and on the block's start side, so Arabic documents mirror it.
 */

const copy = {
  en: {
    add: "Click to add below", addAbove: "Alt-click to add above", handle: "Drag to move · click for actions",
    turnInto: "Turn into", duplicate: "Duplicate", copy: "Copy", moveUp: "Move up", moveDown: "Move down", delete: "Delete",
    colors: "Colour", headerRow: "Header row", headerCol: "Header column",
    copied: "Copied", moved: "Moved", duplicated: "Duplicated", movedUp: "Moved up", movedDown: "Moved down", deleted: "Deleted · press Ctrl+Z to undo",
  },
  ar: {
    add: "انقر للإضافة أسفل", addAbove: "Alt مع النقر للإضافة أعلى", handle: "اسحب للنقل · انقر لعرض الإجراءات",
    turnInto: "تحويل إلى", duplicate: "تكرار", copy: "نسخ", moveUp: "نقل لأعلى", moveDown: "نقل لأسفل", delete: "حذف",
    colors: "اللون", headerRow: "صف عناوين", headerCol: "عمود عناوين",
    copied: "تم النسخ", moved: "نُقل", duplicated: "تم التكرار", movedUp: "نُقل لأعلى", movedDown: "نُقل لأسفل", deleted: "حُذف · اضغط Ctrl+Z للتراجع",
  },
};

/** Height of the gutter pair (CSS `.lx-editor .bn-side-menu`). */
export const SIDE_MENU_HEIGHT = 24;

/**
 * Vertical offset that centres the gutter pair on the block's first text line, measured from the
 * rendered block rather than hard-coded per type, so heading sizes, list markers, callouts and
 * Arabic line heights all line up. Blocks without text (images, quizzes, tables) align to their top.
 */
export function firstLineOffset(block: Element, menuHeight = SIDE_MENU_HEIGHT): number {
  const content = block.querySelector(":scope > .bn-block-content") ?? block.firstElementChild;
  if (!content) return 0;
  const top = block.getBoundingClientRect().top;
  const inline = content.getAttribute("data-content-type") === "table" ? null : content.querySelector(".bn-inline-content");
  if (inline) {
    const box = inline.getBoundingClientRect();
    const style = getComputedStyle(inline);
    const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5 || menuHeight;
    const line = Math.min(lineHeight, box.height || lineHeight);
    return Math.max(0, Math.round(box.top - top + line / 2 - menuHeight / 2));
  }
  const padding = Number.parseFloat(getComputedStyle(content).paddingTop) || 0;
  return Math.max(0, Math.round(content.getBoundingClientRect().top - top + padding));
}

/** Floating UI middleware (a plain object: no extra dependency) aligning the pair with the first line. */
const alignToFirstLine = {
  name: "lxFirstLine",
  fn: ({ x, y, elements }: { x: number; y: number; elements: { reference: Element | { contextElement?: Element } } }) => {
    const reference = elements.reference instanceof Element ? elements.reference : elements.reference.contextElement;
    return { x, y: y + (reference ? firstLineOffset(reference) : 0) };
  },
};

export function LessonSideMenuController({ dir }: { dir: "ltr" | "rtl" }) {
  const floatingUIOptions = useMemo(() => ({
    useFloatingOptions: {
      // The block's start side: left in English, right in Arabic.
      placement: dir === "rtl" ? ("right-start" as const) : ("left-start" as const),
      middleware: [alignToFirstLine],
    },
  }), [dir]);
  return <SideMenuController floatingUIOptions={floatingUIOptions} sideMenu={LessonSideMenu} />;
}

function LessonSideMenu() {
  const Components = useComponentsContext()!;
  return (
    <Components.SideMenu.Root className="bn-side-menu lx-side-menu">
      <AddBlockButton />
      <DragHandle />
    </Components.SideMenu.Root>
  );
}

function AddBlockButton() {
  const Components = useComponentsContext()!;
  const t = useCopy(copy);
  const editor = useBlockNoteEditor() as unknown as LessonEditorType;
  const suggestionMenu = useExtension(SuggestionMenu);
  const block = useExtensionState(SideMenuExtension, { editor: editor as never, selector: (state) => state?.block });
  if (!block) return null;
  const insert = (above: boolean) => {
    const empty = Array.isArray(block.content) && block.content.length === 0 && block.type === "paragraph";
    // An empty line becomes the new block; otherwise a fresh line opens below (or above with Alt).
    const target = empty ? block : editor.insertBlocks([{ type: "paragraph" }], block, above ? "before" : "after")[0];
    editor.setTextCursorPosition(target, "end");
    editor.focus();
    suggestionMenu.openSuggestionMenu("/");
  };
  return (
    <Components.SideMenu.Button className="bn-button lx-side-menu__add" label={`${t.add} · ${t.addAbove}`}
      icon={<Plus size={18} strokeWidth={1.75} aria-hidden />}
      // The whole button is the target (BlockNote's own button only listens on its icon).
      onClick={(event?: React.MouseEvent) => insert(!!event?.altKey)} />
  );
}

function DragHandle() {
  const Components = useComponentsContext()!;
  const t = useCopy(copy);
  const portalElement = usePortalElement();
  const editor = useBlockNoteEditor() as unknown as LessonEditorType;
  const sideMenu = useExtension(SideMenuExtension, { editor: editor as never });
  const block = useExtensionState(SideMenuExtension, { editor: editor as never, selector: (state) => state?.block });
  if (!block) return null;
  return (
    <Components.Generic.Menu.Root position="left" portalElement={portalElement}
      onOpenChange={(open: boolean) => (open ? sideMenu.freezeMenu() : sideMenu.unfreezeMenu())}>
      <Components.Generic.Menu.Trigger>
        <Components.SideMenu.Button className="bn-button lx-side-menu__handle" label={t.handle} draggable
          icon={<GripVertical size={16} strokeWidth={2} aria-hidden />}
          // The menu library opens on press, which would swallow the drag gesture. Like Notion, a press
          // starts a drag and only a click (press and release without moving) opens the actions.
          {...{ onPointerDownCapture: stopPress, onMouseDownCapture: stopPress }}
          onDragStart={(event: React.DragEvent) => {
            blockDragStarted(editor);
            sideMenu.blockDragStart(event, block);
          }}
          onDragEnd={(event: React.DragEvent) => {
            sideMenu.blockDragEnd();
            blockDragEnded(editor, event, { moved: t.moved });
          }} />
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown className="bn-menu-dropdown bn-drag-handle-menu lx-block-menu">
        <TurnIntoItem label={t.turnInto} />
        <ActionItem kind="duplicate" icon={<CopyPlus size={16} aria-hidden />} shortcut="Ctrl+D">{t.duplicate}</ActionItem>
        <ActionItem kind="copy" icon={<Copy size={16} aria-hidden />}>{t.copy}</ActionItem>
        <ActionItem kind="up" icon={<ArrowUp size={16} aria-hidden />} shortcut="Ctrl+Shift+↑">{t.moveUp}</ActionItem>
        <ActionItem kind="down" icon={<ArrowDown size={16} aria-hidden />} shortcut="Ctrl+Shift+↓">{t.moveDown}</ActionItem>
        <BlockColorsItem>{t.colors}</BlockColorsItem>
        <TableRowHeaderItem>{t.headerRow}</TableRowHeaderItem>
        <TableColumnHeaderItem>{t.headerCol}</TableColumnHeaderItem>
        <Components.Generic.Menu.Divider className="bn-menu-divider" />
        <ActionItem kind="delete" icon={<Trash2 size={16} aria-hidden />} shortcut="Del">{t.delete}</ActionItem>
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}

const stopPress = (event: React.SyntheticEvent) => event.stopPropagation();

type Action = "duplicate" | "copy" | "up" | "down" | "delete";

/** The blocks an action applies to: the whole selection when the handle's block is part of it. */
function targetBlocks(editor: LessonEditorType, block: { id: string }) {
  const selected = editor.getSelection()?.blocks;
  return selected && selected.length > 1 && selected.some((b) => b.id === block.id) ? selected : [editor.getBlock(block.id)!];
}

function ActionItem({ kind, icon, shortcut, children }: { kind: Action; icon: ReactNode; shortcut?: string; children: ReactNode }) {
  const Components = useComponentsContext()!;
  const t = useCopy(copy);
  const editor = useBlockNoteEditor() as unknown as LessonEditorType;
  const block = useExtensionState(SideMenuExtension, { editor: editor as never, selector: (state) => state?.block });
  if (!block) return null;
  const disabled = (kind === "up" && !editor.getPrevBlock(block.id) && !editor.getParentBlock(block.id))
    || (kind === "down" && !editor.getNextBlock(block.id) && !editor.getParentBlock(block.id));
  if (disabled) return null;
  return (
    <Components.Generic.Menu.Item className={`bn-menu-item lx-block-menu__item${kind === "delete" ? " lx-block-menu__item--danger" : ""}`} icon={icon}
      onClick={() => {
        runBlockAction(editor, kind, targetBlocks(editor, block));
        announce({ duplicate: t.duplicated, copy: t.copied, up: t.movedUp, down: t.movedDown, delete: t.deleted }[kind]);
      }}>
      <span className="lx-block-menu__label">{children}</span>
      {shortcut && <kbd className="lx-block-menu__kbd" aria-hidden>{shortcut}</kbd>}
    </Components.Generic.Menu.Item>
  );
}

type AnyBlock = ReturnType<LessonEditorType["getBlock"]> & {};

/** One undoable editor transaction per action; nothing here bypasses the editor's history. */
export function runBlockAction(editor: LessonEditorType, kind: Action, blocks: AnyBlock[]) {
  if (!blocks.length) return;
  const first = blocks[0], last = blocks[blocks.length - 1];
  switch (kind) {
    case "duplicate": {
      // Fresh ids (the editor assigns them); props such as quiz, flashcard and image references are kept.
      const strip = (b: AnyBlock): AnyBlock => ({ ...b, id: undefined as never, children: b.children.map((c) => strip(c as AnyBlock)) });
      const inserted = editor.insertBlocks(blocks.map(strip) as never, last, "after");
      if (inserted[0] && Array.isArray(inserted[0].content)) editor.setTextCursorPosition(inserted[0], "end");
      return;
    }
    case "copy": {
      const html = editor.blocksToHTMLLossy(blocks as never);
      const text = blocks.map((b) => editor.blocksToMarkdownLossy([b] as never)).join("").trim();
      void writeClipboard(html, text);
      return;
    }
    case "up": case "down": {
      editor.transact(() => {
        if (blocks.length > 1) editor.setSelection(first, last);
        else editor.setTextCursorPosition(first, Array.isArray(first.content) ? "end" : "start");
        if (kind === "up") editor.moveBlocksUp(); else editor.moveBlocksDown();
      });
      return;
    }
    case "delete":
      editor.removeBlocks(blocks as never);
      return;
  }
}

async function writeClipboard(html: string, text: string) {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
    } else await navigator.clipboard?.writeText(text);
  } catch {
    await navigator.clipboard?.writeText(text).catch(() => {});
  }
}

const withoutToggle = (props: Record<string, unknown> = {}) => Object.fromEntries(Object.entries(props).filter(([key]) => key !== "isToggleable"));

/** Text blocks can change type in place; their children and inline content stay. */
const TURN_INTO = new Set(["paragraph", "heading", "quote", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem"]);

function TurnIntoItem({ label }: { label: string }) {
  const Components = useComponentsContext()!;
  const dict = useDictionary();
  const portalElement = usePortalElement();
  const editor = useBlockNoteEditor() as unknown as LessonEditorType;
  const block = useExtensionState(SideMenuExtension, { editor: editor as never, selector: (state) => state?.block });
  const items = useMemo(() => blockTypeSelectItems(dict).filter((item) => TURN_INTO.has(item.type) && !item.props?.isToggleable && Number(item.props?.level ?? 1) <= 3 && item.type in editor.schema.blockSchema), [dict, editor]);
  if (!block || !TURN_INTO.has(block.type)) return null;
  const current = (item: (typeof items)[number]) => item.type === block.type && Object.entries(item.props ?? {}).every(([k, v]) => k === "isToggleable" || (block.props as Record<string, unknown>)[k] === v);
  return (
    <Components.Generic.Menu.Root position="right" sub portalElement={portalElement}>
      <Components.Generic.Menu.Trigger sub>
        <Components.Generic.Menu.Item className="bn-menu-item lx-block-menu__item" subTrigger icon={<Repeat2 size={16} aria-hidden />}>
          <span className="lx-block-menu__label">{label}</span>
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown sub className="bn-menu-dropdown lx-block-menu">
        {items.map((item) => (
          <Components.Generic.Menu.Item key={item.name} className="bn-menu-item lx-block-menu__item" checked={current(item)}
            icon={item.icon ? <item.icon size={16} aria-hidden /> : undefined}
            onClick={() => {
              const targets = targetBlocks(editor, block).filter((b) => TURN_INTO.has(b.type));
              editor.transact(() => { for (const b of targets) editor.updateBlock(b, { type: item.type, props: withoutToggle(item.props) } as never); });
            }}>
            {item.name}
          </Components.Generic.Menu.Item>
        ))}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}
