import { expect, it, vi } from "vitest";
import { focusLessonEnd, isBlankEditorTarget } from "@/components/learn/editor/focusEnd";
import type { LessonEditorType } from "@/components/learn/editor/blocks";

it("focuses the end of the final nested writing line", () => {
  const editor = { document: [{ id: "first", children: [], content: [] }, { id: "last", content: [], children: [{ id: "child", children: [], content: [] }] }], focus: vi.fn(), setTextCursorPosition: vi.fn(), insertBlocks: vi.fn() };
  focusLessonEnd(editor as unknown as LessonEditorType);
  expect(editor.setTextCursorPosition).toHaveBeenCalledWith("child", "end");
  expect(editor.insertBlocks).not.toHaveBeenCalled();
  expect(editor.focus).toHaveBeenCalledOnce();
});

it("creates a writing line after final media", () => {
  const editor = { document: [{ id: "image", children: [] }], focus: vi.fn(), setTextCursorPosition: vi.fn(), insertBlocks: vi.fn(() => [{ id: "line" }]) };
  focusLessonEnd(editor as unknown as LessonEditorType);
  expect(editor.insertBlocks).toHaveBeenCalledWith([{ type: "paragraph" }], "image", "after");
  expect(editor.setTextCursorPosition).toHaveBeenCalledWith("line", "end");
});

it("leaves existing blocks and toolbar controls alone", () => {
  const blank = document.createElement("div");
  expect(isBlankEditorTarget(blank)).toBe(true);
  for (const markup of ['<div class="bn-block-outer"><span>Text</span></div>', '<button><span>Publish</span></button>', '<div role="menu"><span>Item</span></div>']) {
    blank.innerHTML = markup;
    expect(isBlankEditorTarget(blank.querySelector("span"))).toBe(false);
  }
});
