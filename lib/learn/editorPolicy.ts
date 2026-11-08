import { safeLessonLink } from "../../convex/learnValidation";

/**
 * Input rules for the lesson editor, applied where content enters it (typing a link, uploading,
 * pasting) so that what the writer sees is what the durable save path accepts. The server
 * (convex/learnValidation.ts) stays the authority; these checks only stop content that would
 * otherwise be accepted on screen and then fail, or be silently changed, at save time.
 */



const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * The link address the lesson will store, or null when it cannot be stored. Bare addresses
 * ("example.com/page") get https://, as the editor's own autolinking does. Everything else
 * (javascript:, data:, tel:, ftp:, relative paths, credentials) is refused.
 */
export function normalizeLessonLink(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (safeLessonLink(href)) return href;
  if (!SCHEME.test(href) && !href.startsWith("/") && !href.startsWith("#") && /^[^\s/?#]+\.[^\s/?#]+/.test(href)) {
    const withScheme = `https://${href}`;
    if (safeLessonLink(withScheme)) return withScheme;
  }
  return null;
}

/** For BlockNote's `links.isValidLink`: also called with bare addresses before autolinking adds https://. */
export const isLessonLinkAllowed = (href: string): boolean => normalizeLessonLink(href) !== null;

/* ── Uploads ──────────────────────────────────────────────────────────────── */

/** Image types the private source upload stores (lib/learn/mediaClient.ts kinds). */
const LESSON_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
/** Same limit as MEDIA_MAX_BYTES in mediaClient.ts (kept here so this file has no client imports). */
export const LESSON_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

export type UploadProblem = "empty" | "type" | "size";

/** Why this file cannot be uploaded into a lesson, or null when it can. */
export function checkLessonImage(file: { type: string; size: number }): UploadProblem | null {
  if (!file.size) return "empty";
  if (!(LESSON_IMAGE_TYPES as readonly string[]).includes(file.type.toLowerCase())) return "type";
  if (file.size > LESSON_IMAGE_MAX_BYTES) return "size";
  return null;
}

export const uploadProblemCopy: Record<"en" | "ar", Record<UploadProblem, (name: string) => string>> = {
  en: {
    empty: (name) => `“${name}” is empty. Choose the image file again.`,
    type: (name) => `“${name}” is not a PNG, JPEG or WebP image. Convert it to one of those and upload it again.`,
    size: (name) => `“${name}” is larger than 25 MB. Compress or resize it, then upload it again.`,
  },
  ar: {
    empty: (name) => `الملف «${name}» فارغ. اختر ملف الصورة مرة أخرى.`,
    type: (name) => `الملف «${name}» ليس صورة PNG أو JPEG أو WebP. حوّله إلى أحد هذه الصيغ ثم ارفعه مرة أخرى.`,
    size: (name) => `حجم الملف «${name}» أكبر من 25 ميغابايت. اضغطه أو صغّر أبعاده ثم ارفعه مرة أخرى.`,
  },
};

/* ── Content normalization before save ───────────────────────────────────── */

interface LinkLike { type: "link"; href: string; content: unknown[] }
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Normalizes inline links in editor blocks: bare addresses gain https://, links that cannot be
 * stored become their plain text. Returns the same array when nothing changed. `removed` counts
 * the links that were turned into text, so the writer can be told instead of losing them quietly.
 */
export function normalizeEditorLinks<T>(blocks: T[]): { blocks: T[]; removed: number } {
  let removed = 0;
  let changed = false;
  const inline = (items: unknown[]): unknown[] => {
    let local = false;
    const next = items.flatMap((item) => {
      if (!isRecord(item) || item.type !== "link") return [item];
      const link = item as unknown as LinkLike;
      const href = normalizeLessonLink(String(link.href ?? ""));
      if (href === link.href) return [item];
      local = true;
      if (href) return [{ ...link, href }];
      removed++;
      return Array.isArray(link.content) ? link.content : [];
    });
    if (local) changed = true;
    return local ? next : items;
  };
  const visit = (list: unknown[]): unknown[] => {
    let local = false;
    const next = list.map((value) => {
      if (!isRecord(value)) return value;
      let block = value;
      if (Array.isArray(block.content)) {
        const content = inline(block.content);
        if (content !== block.content) block = { ...block, content };
      } else if (isRecord(block.content) && block.content.type === "tableContent" && Array.isArray(block.content.rows)) {
        const table = block.content as { rows: { cells: unknown[] }[] };
        let tableChanged = false;
        const rows = table.rows.map((row) => {
          const cells = row.cells.map((cell) => {
            if (Array.isArray(cell)) { const c = inline(cell); if (c !== cell) tableChanged = true; return c; }
            if (isRecord(cell) && Array.isArray(cell.content)) { const c = inline(cell.content); if (c !== cell.content) { tableChanged = true; return { ...cell, content: c }; } }
            return cell;
          });
          return tableChanged ? { ...row, cells } : row;
        });
        if (tableChanged) block = { ...block, content: { ...block.content, rows } };
      }
      if (Array.isArray(block.children) && block.children.length) {
        const children = visit(block.children);
        if (children !== block.children) block = { ...block, children };
      }
      if (block !== value) local = true;
      return block;
    });
    return local ? next : list;
  };
  const result = visit(blocks) as T[];
  return { blocks: changed ? result : blocks, removed };
}

/* ── Clipboard HTML ───────────────────────────────────────────────────────── */

/** Elements whose content is never lesson text. */
const DROP = new Set(["script", "style", "noscript", "template", "iframe", "frame", "frameset", "object", "embed", "applet", "form", "input", "button", "select", "textarea", "option", "meta", "link", "base", "title", "head", "svg", "math", "canvas", "audio", "video", "source", "track", "picture", "map", "area", "dialog", "xml"]);
/** Formatting inside table cells: the lesson table stores plain text per cell. */
const CELL_UNWRAP = new Set(["b", "strong", "i", "em", "u", "s", "strike", "del", "ins", "mark", "code", "a", "span", "font", "sub", "sup", "small", "big", "p", "div", "br", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6"]);
/** Attributes kept after sanitizing; BlockNote's own HTML (blocknote/html) is not sanitized here. */
const KEEP_ATTRS: Record<string, string[]> = { a: ["href"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"], ol: ["start"], li: [], code: [], pre: [] };

export interface SanitizedClipboard { html: string; removedImages: number; removedMedia: number; removedLinks: number }

/**
 * Cleans HTML from other apps (browsers, Word, Google Docs, Notion) before the editor parses it:
 * scripts, styles, forms, embeds and Office markup go; event handlers, classes and inline styles
 * go; links that the lesson cannot store become text. Images and media are taken out too, because
 * a lesson only stores images uploaded to its private sources; the counts say what was left out.
 */
export function sanitizeClipboardHtml(html: string, parser: DOMParser = new DOMParser()): SanitizedClipboard {
  const doc = parser.parseFromString(html, "text/html");
  let removedImages = 0, removedMedia = 0, removedLinks = 0;
  const walker = doc.createTreeWalker(doc.body, 0x80 /* NodeFilter.SHOW_COMMENT */);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const c of comments) c.parentNode?.removeChild(c);

  const unwrap = (el: Element) => { el.replaceWith(...Array.from(el.childNodes)); };
  const visit = (el: Element, inCell: boolean) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      // Office namespaced tags (o:p, w:sdt, v:shape) carry layout only.
      if (tag.includes(":")) { if (tag === "o:p") child.remove(); else { visit(child, inCell); unwrap(child); } continue; }
      if (tag === "img") { removedImages++; child.remove(); continue; }
      if (tag === "video" || tag === "audio" || tag === "iframe" || tag === "embed" || tag === "object") { removedMedia++; child.remove(); continue; }
      if (DROP.has(tag)) { child.remove(); continue; }
      const cell = inCell || tag === "td" || tag === "th";
      visit(child, cell);
      if (tag === "a") {
        const href = normalizeLessonLink(child.getAttribute("href") ?? "");
        if (!href) { if (child.hasAttribute("href")) removedLinks++; unwrap(child); continue; }
        child.setAttribute("href", href);
      }
      if (inCell && CELL_UNWRAP.has(tag)) {
        if (tag === "br" || tag === "p" || tag === "div" || tag === "li") child.after(doc.createTextNode(" "));
        unwrap(child);
        continue;
      }
      const keep = KEEP_ATTRS[tag] ?? [];
      for (const attr of Array.from(child.attributes)) if (!keep.includes(attr.name.toLowerCase())) child.removeAttribute(attr.name);
    }
  };
  visit(doc.body, false);
  return { html: doc.body.innerHTML, removedImages, removedMedia, removedLinks };
}

/** True when clipboard HTML came from BlockNote itself (copying inside Chaos), which is already clean. */
export const isBlockNoteClipboard = (types: readonly string[]) => types.includes("blocknote/html");
