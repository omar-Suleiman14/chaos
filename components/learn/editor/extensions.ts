import type { ReactElement, ReactNode } from "react";
import type { Block } from "@/lib/learn/doc";
import type { LessonEditorType } from "./blocks";

/**
 * Extension points of the lesson editor: commands, toolbar actions, shortcuts and export
 * converters a host adds without editing the editor. Every call into extension code is isolated:
 * an extension that throws is reported (onError) and skipped, and the editor keeps working.
 *
 * Blocks themselves are not registered here. The lesson schema is fixed by what the durable
 * document stores (convex/learnModel.ts); a block that could be inserted but not saved would lose
 * the writer's work. Portable block registration is packaging-phase work (see docs).
 */

/** Bumped when an extension contract changes incompatibly. */
export const LESSON_EDITOR_API_VERSION = 1;

interface LessonSlashCommand {
  key: string;
  title: string;
  subtext?: string;
  aliases?: string[];
  /** Group heading; defaults to the editor's "Other" group. */
  group?: string;
  icon?: ReactElement;
  run: (editor: LessonEditorType) => void;
}

interface LessonToolbarAction {
  key: string;
  label: string;
  icon: ReactNode;
  /** Shown only when this returns true for the current selection. */
  isAvailable?: (editor: LessonEditorType) => boolean;
  run: (editor: LessonEditorType) => void;
}

export interface LessonShortcut {
  /** "Mod" is Ctrl on Windows/Linux and Cmd on macOS, e.g. "Mod-Shift-k", "Alt-ArrowUp". */
  combo: string;
  /** Return false to let the editor handle the key after all. */
  run: (editor: LessonEditorType) => boolean | void;
}

/** Serializer hooks for export: return undefined to fall back to the built-in conversion. */
export interface LessonConverter {
  blockType: string;
  toMarkdown?: (block: Block) => string | undefined;
  toHTML?: (block: Block) => string | undefined;
  toText?: (block: Block) => string | undefined;
}

export interface LessonEditorExtension {
  id: string;
  apiVersion: number;
  slashCommands?: LessonSlashCommand[];
  toolbarActions?: LessonToolbarAction[];
  shortcuts?: LessonShortcut[];
  converters?: LessonConverter[];
}

export interface ExtensionProblem { extension: string; message: string }

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const COMBO = /^(?:(?:Mod|Ctrl|Meta|Alt|Shift)-)*(?:[A-Za-z0-9]|Arrow(?:Up|Down|Left|Right)|Enter|Escape|Backspace|Delete|Tab|Space|F\d{1,2}|[[\]\\/.,;'`=-])$/;

/** Shortcuts the editor itself owns; an extension cannot take them over. */
const RESERVED = new Set(["Mod-z", "Mod-Shift-z", "Mod-y", "Mod-b", "Mod-i", "Mod-u", "Mod-c", "Mod-x", "Mod-v", "Mod-a", "Mod-d", "Mod-k", "Mod-e", "Mod-Shift-ArrowUp", "Mod-Shift-ArrowDown", "Tab", "Shift-Tab", "Enter", "Backspace", "Delete", "Escape"]);

/**
 * Compatibility and conflict checks. `builtInKeys` are the editor's own slash command keys.
 * An extension with any problem is not loaded at all, so it cannot half-apply.
 */
export function validateExtensions(extensions: readonly LessonEditorExtension[], builtInKeys: Iterable<string> = []): { valid: LessonEditorExtension[]; problems: ExtensionProblem[] } {
  const problems: ExtensionProblem[] = [];
  const valid: LessonEditorExtension[] = [];
  const ids = new Set<string>();
  const commandKeys = new Set(builtInKeys);
  const combos = new Set<string>();
  for (const ext of extensions) {
    const local: string[] = [];
    const name = typeof ext?.id === "string" ? ext.id : "(unnamed)";
    if (!ext || typeof ext !== "object") { problems.push({ extension: name, message: "Not an extension object." }); continue; }
    if (!ID.test(ext.id)) local.push("Use a lowercase id of letters, digits, dots, hyphens or underscores.");
    else if (ids.has(ext.id)) local.push("Another extension already uses this id.");
    if (ext.apiVersion !== LESSON_EDITOR_API_VERSION) local.push(`Built for editor API ${ext.apiVersion}; this editor provides API ${LESSON_EDITOR_API_VERSION}.`);
    const keys = new Set<string>();
    for (const c of ext.slashCommands ?? []) {
      if (!c || !ID.test(c.key) || !c.title?.trim() || typeof c.run !== "function") local.push(`Slash command ${String(c?.key)} needs a key, a title and a run function.`);
      else if (commandKeys.has(c.key) || keys.has(c.key)) local.push(`Slash command ${c.key} duplicates an existing command.`);
      else keys.add(c.key);
    }
    for (const a of ext.toolbarActions ?? []) if (!a || !ID.test(a.key) || !a.label?.trim() || typeof a.run !== "function") local.push(`Toolbar action ${String(a?.key)} needs a key, a label and a run function.`);
    const extCombos = new Set<string>();
    for (const s of ext.shortcuts ?? []) {
      const combo = normalizeCombo(s?.combo ?? "");
      if (!COMBO.test(s?.combo ?? "") || typeof s.run !== "function") local.push(`Shortcut ${String(s?.combo)} is not a valid key combination.`);
      else if (RESERVED.has(combo)) local.push(`Shortcut ${s.combo} belongs to the editor.`);
      else if (combos.has(combo) || extCombos.has(combo)) local.push(`Shortcut ${s.combo} is already taken.`);
      else extCombos.add(combo);
    }
    for (const c of ext.converters ?? []) if (!c?.blockType || !(c.toMarkdown || c.toHTML || c.toText)) local.push(`Converter for ${String(c?.blockType)} needs a block type and at least one serializer.`);
    if (local.length) { problems.push(...local.map((message) => ({ extension: name, message }))); continue; }
    ids.add(ext.id);
    keys.forEach((k) => commandKeys.add(k));
    extCombos.forEach((c) => combos.add(c));
    valid.push(ext);
  }
  return { valid, problems };
}

/** Runs extension code; a throw is reported and replaced by `fallback`. */
export function isolate<T>(extension: string, fn: () => T, fallback: T, onError?: (extension: string, error: unknown) => void): T {
  try { return fn(); } catch (error) {
    if (onError) onError(extension, error);
    else console.error(`Lesson editor extension "${extension}" failed`, error);
    return fallback;
  }
}

/** Canonical form: modifiers in Mod, Ctrl, Meta, Alt, Shift order; single letters lower case. */
export function normalizeCombo(combo: string): string {
  const parts = combo.split("-").filter(Boolean);
  if (combo.endsWith("--")) parts.push("-");
  const key = parts.pop() ?? "";
  const order = ["Mod", "Ctrl", "Meta", "Alt", "Shift"];
  const mods = order.filter((m) => parts.includes(m));
  return [...mods, key.length === 1 ? key.toLowerCase() : key].join("-");
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** The combo a keyboard event produces, in normalizeCombo form ("Mod" for the platform's command key). */
export function eventCombo(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, mac = isMac()): string {
  const mods: string[] = [];
  const mod = mac ? event.metaKey : event.ctrlKey;
  if (mod) mods.push("Mod");
  if (event.ctrlKey && mac) mods.push("Ctrl");
  if (event.metaKey && !mac) mods.push("Meta");
  if (event.altKey) mods.push("Alt");
  if (event.shiftKey) mods.push("Shift");
  const key = event.key === " " ? "Space" : event.key;
  return [...mods, key.length === 1 ? key.toLowerCase() : key].join("-");
}

/** The extension shortcut for this key event, if any. */
export function findShortcut(extensions: readonly LessonEditorExtension[], event: Parameters<typeof eventCombo>[0], mac?: boolean): { extension: string; shortcut: LessonShortcut } | undefined {
  const combo = eventCombo(event, mac);
  for (const ext of extensions) for (const shortcut of ext.shortcuts ?? []) if (normalizeCombo(shortcut.combo) === combo) return { extension: ext.id, shortcut };
  return undefined;
}

/** Converters by block type; the first registered extension wins. */
export function converterMap(extensions: readonly LessonEditorExtension[]): Map<string, LessonConverter> {
  const map = new Map<string, LessonConverter>();
  for (const ext of extensions) for (const c of ext.converters ?? []) if (!map.has(c.blockType)) map.set(c.blockType, c);
  return map;
}
