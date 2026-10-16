import { getNodeById } from "@blocknote/core";
import type { LessonEditorType } from "./blocks";
import { announce } from "./announce";

/**
 * Visual feedback around BlockNote's native block drag (SideMenuExtension.blockDragStart and the
 * ProseMirror drop that follows). Everything here is local DOM state: classes, a body flag, scroll
 * position. It never dispatches a document change, so pointer movement cannot trigger a save.
 *
 * Start  the dragged blocks dim, text selection is suspended and the
 *        drag preview gets the editor's width and theme (`body[data-lx-block-drag]`).
 * Move   the page scrolls smoothly when the pointer nears the top or bottom edge.
 * Drop   the moved blocks keep their ids, so they are found again and settle in.
 *
 * ProseMirror owns the blocks' DOM and redraws nodes whose attributes change under it, so the
 * per-block states are rules in one <style> element keyed by block id, never attributes on blocks.
 * Cancel (Escape, or a drop outside the editor) the selection from before the drag returns.
 */

interface ActiveDrag {
  ids: string[];
  root: HTMLElement;
  scroller: HTMLElement;
  selection: LessonEditorType["prosemirrorView"]["state"]["selection"];
  stopScroll: () => void;
}

let active: ActiveDrag | undefined;

/** Pixels per frame to scroll for a pointer `y` inside a scroll area spanning `top`..`bottom`. */
export function autoScrollVelocity(y: number, top: number, bottom: number, edge = 80, max = 22): number {
  const zone = Math.min(edge, (bottom - top) / 4);
  if (zone <= 0) return 0;
  if (y < top + zone) return -Math.ceil(max * ((top + zone - Math.max(y, top)) / zone) ** 2);
  if (y > bottom - zone) return Math.ceil(max * ((Math.min(y, bottom) - (bottom - zone)) / zone) ** 2);
  return 0;
}

function scrollParent(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

function startAutoScroll(scroller: HTMLElement): () => void {
  let pointerY: number | undefined;
  let frame = 0;
  const isPage = scroller === document.scrollingElement || scroller === document.documentElement;
  const tick = () => {
    frame = 0;
    if (pointerY === undefined) return;
    const rect = isPage ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
    const velocity = autoScrollVelocity(pointerY, rect.top, rect.bottom);
    if (!velocity) return;
    scroller.scrollTop += velocity;
    frame = requestAnimationFrame(tick);
  };
  const onDragOver = (event: DragEvent) => {
    pointerY = event.clientY;
    if (!frame) frame = requestAnimationFrame(tick);
  };
  document.addEventListener("dragover", onDragOver);
  return () => {
    document.removeEventListener("dragover", onDragOver);
    if (frame) cancelAnimationFrame(frame);
  };
}

/** Ids of the top-level blocks in the current (node or multi-node) selection. */
function selectedBlockIds(editor: LessonEditorType): string[] {
  const { state } = editor.prosemirrorView;
  const { from, to } = state.selection;
  const ids: string[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    // Ancestors overlap the selection too; only blocks it fully contains were picked up.
    if (node.type.name !== "blockContainer" || pos < from || pos + node.nodeSize > to) return true;
    if (typeof node.attrs.id === "string") ids.push(node.attrs.id);
    return false;
  });
  return ids;
}

const blockSelector = (ids: string[]) => ids.map((id) => `.lx-editor .bn-block-outer[data-id="${CSS.escape(id)}"]`).join(", ");

let sheet: HTMLStyleElement | undefined;
let settleTimer = 0;
/** Replaces the per-block drag rules: `source` dims, `settle` animates in. */
function setBlockStyles(rules: { source?: string[]; settle?: string[] }) {
  if (!sheet?.isConnected) {
    sheet = document.createElement("style");
    sheet.dataset.lxBlockDrag = "";
    document.head.appendChild(sheet);
  }
  const css: string[] = [];
  if (rules.source?.length) css.push(`${blockSelector(rules.source)} { opacity: 0.4; transition: opacity 120ms ease; }`);
  if (rules.settle?.length) css.push(`${blockSelector(rules.settle)} { animation: lx-settle 160ms cubic-bezier(.2, .8, .2, 1); }`, `${rules.settle.map((id) => `.lx-editor .bn-block-outer[data-id="${CSS.escape(id)}"] > .bn-block > .bn-block-content`).join(", ")} { animation: lx-settle-tint 600ms ease-out; border-radius: 4px; }`);
  sheet.textContent = css.join("\n");
}

/** Call before SideMenuExtension.blockDragStart: it needs the selection as it was. */
export function blockDragStarted(editor: LessonEditorType) {
  const root = (editor.prosemirrorView.dom as HTMLElement).closest<HTMLElement>(".lx-editor");
  if (!root) return;
  finish();
  const previous = editor.prosemirrorView.state.selection;
  const editorWidth = (editor.prosemirrorView.dom as HTMLElement).querySelector(".bn-block-group")?.getBoundingClientRect().width;
  document.body.dataset.lxBlockDrag = root.dir === "rtl" ? "rtl" : "ltr";
  if (editorWidth) document.body.style.setProperty("--lx-drag-width", `${Math.round(editorWidth)}px`);
  root.dataset.dragging = "true";
  const scroller = scrollParent(root);
  active = { ids: [], root, scroller, selection: previous, stopScroll: startAutoScroll(scroller) };
  // blockDragStart selects the dragged block(s) synchronously; mark them once it has.
  queueMicrotask(() => {
    if (!active) return;
    active.ids = selectedBlockIds(editor);
    setBlockStyles({ source: active.ids });
  });
}

function finish() {
  if (!active) return;
  active.stopScroll();
  delete active.root.dataset.dragging;
  setBlockStyles({});
  delete document.body.dataset.lxBlockDrag;
  document.body.style.removeProperty("--lx-drag-width");
  active = undefined;
}

const SETTLE_MS = 160;

/** Call after SideMenuExtension.blockDragEnd. */
export function blockDragEnded(editor: LessonEditorType, event: React.DragEvent, labels: { moved: string } = { moved: "" }) {
  const drag = active;
  finish();
  if (!drag) return;
  const cancelled = event.dataTransfer?.dropEffect === "none";
  if (cancelled) {
    // Nothing moved: put the caret/selection back where it was, without touching the document.
    const view = editor.prosemirrorView;
    if (drag.selection.$anchor.doc === view.state.doc) view.dispatch(view.state.tr.setSelection(drag.selection).setMeta("addToHistory", false));
    return;
  }
  // The drop has been applied by now; moved blocks keep their ids.
  if (!drag.ids.length) return;
  setBlockStyles({ settle: drag.ids });
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => setBlockStyles({}), SETTLE_MS + 500);
  if (labels.moved) announce(labels.moved);
}

/* ── Where a dragged block lands ────────────────────────────────────────────
   ProseMirror chooses "before" or "after" from the text position under the pointer, so releasing
   over the lower half of a short line could still land above it. Like Notion, the lesson editor
   uses the block's vertical half: upper half → above, lower half → below (or, for a block with
   nested children, as its first child, which is where the line is drawn). The drop indicator
   (DropCursor's computeDropPosition hook) and the drop itself use this same answer. */

export interface BlockDropTarget { id: string; placement: "before" | "after" | "firstChild"; pos: number }

function blockOuterAt(root: Element, x: number, y: number): HTMLElement | undefined {
  const hit = (px: number) => document.elementsFromPoint(px, y).find((el) => root.contains(el) && el.closest(".bn-block-outer"))?.closest<HTMLElement>(".bn-block-outer") ?? undefined;
  const group = root.querySelector(".bn-block-group")?.getBoundingClientRect();
  // Pointer in the gutter or the margin: look at the text column on the same line.
  return hit(x) ?? (group ? hit(Math.min(Math.max(x, group.left + 48), group.right - 48)) : undefined);
}

/**
 * `undefined`: not a lesson block drag (or no block under the pointer), let BlockNote decide.
 * `null`: a block cannot be dropped into itself; nothing happens.
 */
export function blockDropTarget(editor: LessonEditorType, clientX: number, clientY: number, dragged = active?.ids ?? []): BlockDropTarget | null | undefined {
  if (!dragged.length) return undefined;
  const root = editor.prosemirrorView.dom as HTMLElement;
  const outer = blockOuterAt(root, clientX, clientY);
  const id = outer?.dataset.id;
  if (!outer || !id) return undefined;
  for (let el: HTMLElement | null = outer; el && root.contains(el); el = el.parentElement?.closest<HTMLElement>(".bn-block-outer") ?? null) {
    if (el.dataset.id && dragged.includes(el.dataset.id)) return null;
  }
  const content = outer.querySelector(":scope > .bn-block > .bn-block-content")?.getBoundingClientRect();
  const upper = !content || clientY < content.top + content.height / 2;
  const block = editor.getBlock(id);
  if (!block) return undefined;
  const firstChild = !upper && block.children.length && !outer.querySelector(":scope > .bn-block > .bn-block-content [data-show-children='false']") ? block.children[0] : undefined;
  const target = firstChild && !dragged.includes(firstChild.id) ? { id: firstChild.id, placement: "firstChild" as const } : { id, placement: upper ? ("before" as const) : ("after" as const) };
  const info = getNodeById(target.placement === "firstChild" ? target.id : id, editor.prosemirrorView.state.doc);
  if (!info) return undefined;
  const pos = target.placement === "after" ? info.posBeforeNode + info.node.nodeSize : info.posBeforeNode;
  return { ...target, id: target.placement === "firstChild" ? target.id : id, pos };
}

/** Moves the dragged blocks to `target` as one undoable change, keeping ids, children and props. */
export function moveBlocksTo(editor: LessonEditorType, ids: string[], target: BlockDropTarget) {
  const blocks = ids.map((blockId) => editor.getBlock(blockId)).filter((b): b is NonNullable<typeof b> => !!b);
  if (!blocks.length) return;
  editor.transact(() => {
    editor.removeBlocks(blocks.map((b) => b.id));
    editor.insertBlocks(blocks as never, target.id, target.placement === "after" ? "after" : "before");
  });
}

/** Capture-phase drop handler for the editor wrapper: performs a lesson block drop itself. */
export function handleBlockDrop(editor: LessonEditorType, event: React.DragEvent): boolean {
  if (!active?.ids.length || !editor.prosemirrorView.dragging) return false;
  const target = blockDropTarget(editor, event.clientX, event.clientY);
  if (target === undefined) return false;
  event.preventDefault();
  event.stopPropagation();
  editor.prosemirrorView.dragging = null;
  if (target) moveBlocksTo(editor, active.ids, target);
  return true;
}
