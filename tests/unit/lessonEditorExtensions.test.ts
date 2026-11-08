import { describe, expect, it, vi } from "vitest";
import { converterMap, eventCombo, findShortcut, isolate, LESSON_EDITOR_API_VERSION, normalizeCombo, validateExtensions, type LessonEditorExtension } from "@/components/learn/editor/extensions";

const ext = (over: Partial<LessonEditorExtension> = {}): LessonEditorExtension => ({ id: "demo", apiVersion: LESSON_EDITOR_API_VERSION, ...over });
const run = () => {};

describe("lesson editor extensions", () => {
  it("loads compatible extensions", () => {
    const { valid, problems } = validateExtensions([ext({ slashCommands: [{ key: "glossary-term", title: "Glossary term", run }], shortcuts: [{ combo: "Mod-Shift-g", run }], toolbarActions: [{ key: "define", label: "Define", icon: null, run }], converters: [{ blockType: "callout", toMarkdown: () => "x" }] })], ["paragraph"]);
    expect(problems).toEqual([]);
    expect(valid).toHaveLength(1);
  });

  it("rejects incompatible or conflicting extensions as a whole", () => {
    const { valid, problems } = validateExtensions([
      ext({ id: "old", apiVersion: 0 }),
      ext({ id: "dup-command", slashCommands: [{ key: "paragraph", title: "P", run }] }),
      ext({ id: "editor-key", shortcuts: [{ combo: "Mod-z", run }] }),
      ext({ id: "bad-combo", shortcuts: [{ combo: "Hyper-q", run }] }),
      ext({ id: "a", shortcuts: [{ combo: "Alt-ArrowUp", run }] }),
      ext({ id: "b", shortcuts: [{ combo: "Alt-ArrowUp", run }] }),
      ext({ id: "a" }),
      ext({ id: "Bad Id" }),
      ext({ id: "empty-converter", converters: [{ blockType: "callout" }] }),
    ], ["paragraph"]);
    expect(valid.map((e) => e.id)).toEqual(["a"]);
    expect(new Set(problems.map((p) => p.extension))).toEqual(new Set(["old", "dup-command", "editor-key", "bad-combo", "b", "a", "Bad Id", "empty-converter"]));
    expect(problems.find((p) => p.extension === "old")?.message).toMatch(/API 0/);
  });

  it("normalizes key combinations per platform", () => {
    expect(normalizeCombo("Shift-Mod-K")).toBe("Mod-Shift-k");
    expect(eventCombo({ key: "K", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }, false)).toBe("Mod-Shift-k");
    expect(eventCombo({ key: "k", ctrlKey: false, metaKey: true, altKey: false, shiftKey: true }, true)).toBe("Mod-Shift-k");
    expect(eventCombo({ key: "k", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, true)).toBe("Ctrl-k");
    const shortcut = { combo: "Mod-Shift-g", run };
    expect(findShortcut([ext({ shortcuts: [shortcut] })], { key: "G", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }, false)?.shortcut).toBe(shortcut);
    expect(findShortcut([ext({ shortcuts: [shortcut] })], { key: "g", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, false)).toBeUndefined();
  });

  it("isolates failures", () => {
    const onError = vi.fn();
    expect(isolate("x", () => { throw new Error("boom"); }, "fallback", onError)).toBe("fallback");
    expect(onError).toHaveBeenCalledWith("x", expect.any(Error));
    expect(isolate("x", () => 42, 0, onError)).toBe(42);
  });

  it("first registered converter wins", () => {
    const first = { blockType: "callout", toText: () => "1" }, second = { blockType: "callout", toText: () => "2" };
    expect(converterMap([ext({ id: "one", converters: [first] }), ext({ id: "two", converters: [second] })]).get("callout")).toBe(first);
  });
});
