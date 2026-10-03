import type { LessonEditorType } from "./blocks";

/** Blank document space is a writing target; existing blocks and controls keep their own cursor. */
export function isBlankEditorTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !target.closest(".bn-block-outer, .bn-block-content, .bn-side-menu, .bn-drag-handle, [draggable='true'], button, a, input, textarea, select, [role='menu'], [role='dialog'], [role='toolbar'], [role='listbox']");
}

export function focusLessonEnd(editor: LessonEditorType) {
  let last = editor.document.at(-1);
  if (!last) { editor.focus(); return; }
  while (last.children.length) last = last.children.at(-1)!;
  // Media and tables need an actual writing line after them.
  if (!Array.isArray(last.content)) last = editor.insertBlocks([{ type: "paragraph" }], last.id, "after")[0];
  if (!last) { editor.focus(); return; }
  editor.setTextCursorPosition(last.id, "end");
  editor.focus();
}
