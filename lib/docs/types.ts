/**
 * Typed shape of the in-app docs. Content lives in content-en.ts and content-ar.ts:
 * sections hold articles, articles hold blocks. The same slugs and heading ids are
 * used in both languages so a link works after switching language.
 *
 * Inline markup inside any text string:
 *   **bold**   for names of buttons and settings
 *   `code`     for links, codes and file names
 *   [label](/path)  for links; paths starting with "/" stay in the app
 */
export type DocBlock =
  | { type: "p"; text: string }
  /** A numbered list of things to do, in order. */
  | { type: "steps"; items: string[] }
  /** A plain bulleted list. */
  | { type: "list"; items: string[] }
  | { type: "tip"; text: string }
  /** A second-level heading; `id` is stable across languages and appears in "On this page". */
  | { type: "heading"; id: string; text: string }
  /** Keyboard shortcuts: each row is a key combination and what it does. */
  | { type: "keys"; items: { keys: string[]; label: string }[] };

export interface DocArticle {
  slug: string;
  title: string;
  /** One sentence shown under the title and in the index. */
  summary: string;
  blocks: DocBlock[];
}

export interface DocSection {
  id: string;
  title: string;
  articles: DocArticle[];
}
