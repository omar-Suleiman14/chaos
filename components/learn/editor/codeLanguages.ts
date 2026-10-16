import { codeBlockOptions } from "@blocknote/code-block";

/**
 * Stored lessons may name a code language any way (assistants write "js", "py", "" or
 * languages the highlighter lacks). BlockNote's code block only opens with its own language ids,
 * so the editor shows the matching id (or plain text) and hands the stored name back unchanged
 * when it saves, unless the writer picked another language.
 */
const languages = codeBlockOptions.supportedLanguages as Record<string, { aliases?: readonly string[] }>;

export function editorCodeLanguage(stored: unknown): string {
  const name = typeof stored === "string" ? stored : "";
  if (Object.hasOwn(languages, name)) return name;
  const lower = name.trim().toLowerCase();
  for (const [id, { aliases }] of Object.entries(languages)) if (id === lower || aliases?.includes(lower)) return id;
  return "text";
}

interface Node { id?: string; type?: string; props?: Record<string, unknown>; children?: Node[] }
/** Block id → the stored language and the id the editor shows for it. */
export type LanguageRestore = Map<string, { stored: unknown; shown: string }>;

/** Copies `blocks` with editor-safe code languages; returns what to restore on save. */
export function toEditorCodeLanguages<T>(blocks: T[]): { blocks: T[]; restore: LanguageRestore } {
  const restore: LanguageRestore = new Map();
  const visit = (items: Node[]): Node[] => items.map((block) => {
    let next = block;
    if (block.type === "codeBlock" && block.id) {
      const shown = editorCodeLanguage(block.props?.language);
      if (shown !== block.props?.language) {
        restore.set(block.id, { stored: block.props?.language, shown });
        next = { ...block, props: { ...block.props, language: shown } };
      }
    }
    return next.children?.length ? { ...next, children: visit(next.children) } : next;
  });
  const converted = visit(blocks as Node[]) as T[];
  return { blocks: restore.size ? converted : blocks, restore };
}

/** The editor document with the stored language names put back where the writer kept them. */
export function fromEditorCodeLanguages<T>(blocks: T[], restore: LanguageRestore): T[] {
  if (!restore.size) return blocks;
  const visit = (items: Node[]): Node[] => items.map((block) => {
    const original = block.id ? restore.get(block.id) : undefined;
    let next = block;
    if (original && block.type === "codeBlock" && block.props?.language === original.shown) next = { ...block, props: { ...block.props, language: original.stored } };
    return next.children?.length ? { ...next, children: visit(next.children) } : next;
  });
  return visit(blocks as Node[]) as T[];
}
