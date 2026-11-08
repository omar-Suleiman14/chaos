import { LEARN_LIMITS } from "@/convex/learnModel";
import { fromDurableDocument, toDurableDocument } from "@/lib/learn/chaosDocument";
import { asBlocks, blockText, inlineText, walk, type Block, type Inline } from "@/lib/learn/doc";
import { normalizeEditorLinks, sanitizeClipboardHtml } from "@/lib/learn/editorPolicy";
import { parsePortableLesson, toPortableLesson, type PortableMeta } from "@/lib/learn/portable";
import type { LessonEditorType } from "./blocks";
import { converterMap, isolate, type LessonConverter, type LessonEditorExtension } from "./extensions";

/**
 * Lesson import and export through the live editor. Every conversion reports what it could not
 * carry over (`lost`), so the writer is told instead of discovering it later.
 *
 * Export: Markdown, HTML (standalone page, also used for print/PDF), plain text, portable JSON.
 * Import: Markdown, HTML (sanitized like a paste), plain text, portable JSON.
 */

export type ExportFormat = "markdown" | "html" | "text" | "json";
export type ImportFormat = "markdown" | "html" | "text" | "json";

/** What a conversion left out or changed. */
export type LossKind = "quizzes" | "flashcards" | "images" | "media" | "calloutStyle" | "colors" | "underline" | "citations" | "links" | "sourceReferences" | "unsupportedBlocks" | "tableFormatting" | "headingLevels" | "overLimit";

export interface ExportResult { content: string; mime: string; extension: string; lost: LossKind[] }
export interface ImportResult { blocks: Block[]; lost: LossKind[]; skipped: number }

const lossCopy: Record<"en" | "ar", Record<LossKind, string>> = {
  en: {
    quizzes: "quizzes", flashcards: "flashcard sets", images: "image files (their alt text is kept)", media: "audio and video files", calloutStyle: "callout colours (callouts became quotes)",
    colors: "text colours and highlights", underline: "underlines", citations: "citation links (kept as text)", links: "links Chaos cannot store (kept as text)",
    sourceReferences: "links to sources, quizzes and flashcards from another lesson", unsupportedBlocks: "blocks lessons cannot store", tableFormatting: "formatting inside table cells",
    headingLevels: "heading levels below 3 (became level 3)", overLimit: "blocks beyond the 500-block lesson limit",
  },
  ar: {
    quizzes: "الاختبارات", flashcards: "مجموعات البطاقات", images: "ملفات الصور (بقي النص البديل)", media: "ملفات الصوت والفيديو", calloutStyle: "ألوان التنبيهات (أصبحت اقتباسات)",
    colors: "ألوان النص والتظليل", underline: "التسطير", citations: "روابط الاستشهادات (بقيت نصًا)", links: "روابط لا يمكن حفظها (بقيت نصًا)",
    sourceReferences: "الروابط إلى مصادر واختبارات وبطاقات من درس آخر", unsupportedBlocks: "كتل لا يحفظها الدرس", tableFormatting: "التنسيق داخل خلايا الجداول",
    headingLevels: "مستويات العناوين بعد الثالث (أصبحت من المستوى الثالث)", overLimit: "الكتل التي تتجاوز حد 500 كتلة",
  },
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const textRun = (text: string, styles: Record<string, unknown> = {}) => ({ type: "text", text, styles });

export interface ExportContext {
  /** Title of a source by id, for source blocks and citations. */
  sourceTitle?: (sourceId: string) => string | undefined;
  extensions?: readonly LessonEditorExtension[];
  onExtensionError?: (extension: string, error: unknown) => void;
}

/** Inline content without citation chips: "[Source, page 23]" text in their place. */
function plainInlines(content: Inline[], ctx: ExportContext, lost: Set<LossKind>): Inline[] {
  return content.map((item) => {
    if (item.type !== "citation") return item;
    lost.add("citations");
    const props = (item as { props?: { sourceId?: string; locator?: string } }).props ?? {};
    const title = (props.sourceId && ctx.sourceTitle?.(props.sourceId)) || "source";
    return textRun(`[${title}${props.locator ? `, ${props.locator}` : ""}]`) as Inline;
  });
}

/** Lesson blocks as standard BlockNote blocks that Markdown and HTML converters understand. */
function standIns(blocks: Block[], ctx: ExportContext, lost: Set<LossKind>): Block[] {
  return blocks.flatMap((block): Block[] => {
    const children = standIns(block.children ?? [], ctx, lost);
    const p = block.props ?? {};
    const content = Array.isArray(block.content) ? plainInlines(block.content, ctx, lost) : block.content;
    if (p.textColor && p.textColor !== "default" || p.backgroundColor && p.backgroundColor !== "default") lost.add("colors");
    const base = { id: block.id, props: {}, children };
    switch (block.type) {
      case "callout": lost.add("calloutStyle"); return [{ ...base, type: "quote", content }];
      case "equation": return [{ ...base, type: "codeBlock", props: { language: "latex" }, content: [textRun(blockText(block))] as Inline[] }];
      case "lessonDiagram": return [{ ...base, type: "codeBlock", props: { language: "mermaid" }, content: [textRun(String(p.text ?? ""))] as Inline[] }];
      case "youtube": {
        if (!p.videoId) return children;
        const start = Number(p.start) > 0 ? `&t=${Number(p.start)}s` : "";
        const href = `https://www.youtube.com/watch?v=${encodeURIComponent(String(p.videoId))}${start}`;
        return [{ ...base, type: "paragraph", content: [{ type: "link", href, content: [textRun(String(p.caption || "YouTube video"))] }] as Inline[] }];
      }
      case "source": {
        const title = (p.sourceId && ctx.sourceTitle?.(String(p.sourceId))) || "Source";
        return [{ ...base, type: "quote", content: [textRun(`${title}${p.locator ? ` · ${p.locator}` : ""}`)] as Inline[] }];
      }
      case "image": {
        lost.add("images");
        const text = [p.alt, p.caption].filter(Boolean).join(" — ");
        return text ? [{ ...base, type: "paragraph", content: [textRun(`[Image: ${text}]`, { italic: true })] as Inline[] }] : children;
      }
      case "lessonQuiz": lost.add("quizzes"); return children;
      case "lessonFlashcards": lost.add("flashcards"); return children;
      case "video": case "audio": case "file": lost.add("media"); return children;
      default: return [{ ...block, ...(content !== undefined ? { content } : {}), children }];
    }
  });
}

function formatLosses(blocks: Block[], format: ExportFormat, lost: Set<LossKind>) {
  if (format === "html" || format === "json") return;
  for (const { block } of walk(blocks)) {
    const runs = Array.isArray(block.content) ? block.content.flatMap((i) => (i.type === "link" ? ((i as { content?: Inline[] }).content ?? []) : [i])) : [];
    for (const run of runs) {
      const styles = (run as { styles?: Record<string, unknown> }).styles ?? {};
      if (styles.underline) lost.add("underline");
      if (styles.textColor || styles.backgroundColor) lost.add("colors");
    }
  }
}

/** Splits top-level blocks into runs the editor converts and blocks an extension converts. */
function convert(blocks: Block[], ctx: ExportContext, pick: (c: LessonConverter) => ((b: Block) => string | undefined) | undefined, builtIn: (chunk: Block[]) => string, lost: Set<LossKind>, join: string): string {
  const converters = converterMap(ctx.extensions ?? []);
  const parts: string[] = [];
  let chunk: Block[] = [];
  const flush = () => { if (chunk.length) parts.push(builtIn(standIns(chunk, ctx, lost)).trim()); chunk = []; };
  for (const block of blocks) {
    const converter = converters.get(block.type);
    const fn = converter && pick(converter);
    const ext = fn && (ctx.extensions ?? []).find((e) => e.converters?.includes(converter!));
    const custom = fn ? isolate(ext?.id ?? "converter", () => fn(block), undefined, ctx.onExtensionError) : undefined;
    if (custom === undefined) { chunk.push(block); continue; }
    flush();
    parts.push(custom.trim());
  }
  flush();
  return parts.filter(Boolean).join(join) + "\n";
}

function plainText(blocks: Block[], ctx: ExportContext, lost: Set<LossKind>): string {
  const lines: string[] = [];
  const visit = (items: Block[], depth: number) => {
    for (const block of items) {
      const pad = "  ".repeat(depth);
      const p = block.props ?? {};
      let text: string;
      switch (block.type) {
        case "lessonDiagram": text = String(p.text ?? ""); break;
        case "youtube": text = p.videoId ? `${p.caption ? `${p.caption}: ` : ""}https://www.youtube.com/watch?v=${p.videoId}` : ""; break;
        case "source": text = `${(p.sourceId && ctx.sourceTitle?.(String(p.sourceId))) || "Source"}${p.locator ? ` · ${p.locator}` : ""}`; break;
        case "image": lost.add("images"); text = [p.alt, p.caption].filter(Boolean).join(" — "); text = text ? `[Image: ${text}]` : ""; break;
        case "lessonQuiz": lost.add("quizzes"); text = ""; break;
        case "lessonFlashcards": lost.add("flashcards"); text = ""; break;
        case "table": {
          const table = block.content as { rows?: { cells: unknown[] }[] } | undefined;
          text = (table?.rows ?? []).map((row) => row.cells.map((cell) => inlineText(Array.isArray(cell) ? cell as Inline[] : (cell as { content?: Inline[] }).content)).join("\t")).join("\n");
          break;
        }
        default: {
          const runs = Array.isArray(block.content) ? plainInlines(block.content, ctx, lost) : [];
          text = runs.map((r) => (r.type === "link" ? `${inlineText((r as { content?: Inline[] }).content)} (${(r as { href: string }).href})` : inlineText([r]))).join("");
          if (block.type === "bulletListItem" || block.type === "toggleListItem") text = `• ${text}`;
          if (block.type === "checkListItem") text = `${p.checked ? "[x]" : "[ ]"} ${text}`;
          if (block.type === "numberedListItem") text = `- ${text}`;
        }
      }
      if (text) lines.push(text.split("\n").map((l) => pad + l).join("\n"));
      visit(block.children ?? [], depth + 1);
    }
  };
  visit(blocks, 0);
  return lines.join("\n\n") + "\n";
}

/** A standalone, readable HTML page: no scripts, inline styles only, the lesson's language and direction. */
function htmlPage(body: string, meta: PortableMeta & { dir?: "ltr" | "rtl" }): string {
  const lang = escapeHtml(meta.language || "en");
  return `<!doctype html>
<html lang="${lang}" dir="${meta.dir === "rtl" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title || "Lesson")}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.7 system-ui, -apple-system, "Segoe UI", "Noto Sans Arabic", sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; }
  h1, h2, h3 { line-height: 1.25; } blockquote { margin-inline: 0; padding-inline-start: 1em; border-inline-start: 3px solid currentColor; opacity: .85; }
  pre { overflow: auto; padding: 12px; border-radius: 6px; background: rgba(127,127,127,.12); } table { border-collapse: collapse; } td, th { border: 1px solid rgba(127,127,127,.4); padding: 4px 8px; }
  @media print { body { margin: 0; max-width: none; } a { color: inherit; } }
</style>
</head>
<body>
${meta.title ? `<h1>${escapeHtml(meta.title)}</h1>\n` : ""}${meta.description ? `<p><em>${escapeHtml(meta.description)}</em></p>\n` : ""}${body}
</body>
</html>
`;
}

export function exportLesson(editor: LessonEditorType, format: ExportFormat, meta: PortableMeta & { dir?: "ltr" | "rtl" } = {}, ctx: ExportContext = {}): ExportResult {
  const blocks = structuredClone(asBlocks(editor.document));
  const lost = new Set<LossKind>();
  formatLosses(blocks, format, lost);
  switch (format) {
    case "markdown": {
      const body = convert(blocks, ctx, (c) => c.toMarkdown, (chunk) => editor.blocksToMarkdownLossy(chunk as never), lost, "\n\n");
      const head = [meta.title ? `# ${meta.title}` : "", meta.description ? `_${meta.description}_` : ""].filter(Boolean).join("\n\n");
      return { content: head ? `${head}\n\n${body}` : body, mime: "text/markdown", extension: "md", lost: [...lost] };
    }
    case "html": {
      const body = convert(blocks, ctx, (c) => c.toHTML, (chunk) => editor.blocksToHTMLLossy(chunk as never), lost, "\n");
      return { content: htmlPage(body, meta), mime: "text/html", extension: "html", lost: [...lost] };
    }
    case "text": {
      const converters = converterMap(ctx.extensions ?? []);
      const body = blocks.map((block) => {
        const converter = converters.get(block.type);
        const ext = converter && (ctx.extensions ?? []).find((e) => e.converters?.includes(converter));
        const custom = converter?.toText ? isolate(ext?.id ?? "converter", () => converter.toText!(block), undefined, ctx.onExtensionError) : undefined;
        return custom ?? plainText([block], ctx, lost);
      }).map((s) => s.trim()).filter(Boolean).join("\n\n");
      const head = [meta.title, meta.description].filter(Boolean).join("\n\n");
      return { content: `${head ? `${head}\n\n` : ""}${body}\n`, mime: "text/plain", extension: "txt", lost: [...lost] };
    }
    case "json": {
      // The durable shape: exactly what the lesson stores, so nothing is lost.
      const document = toDurableDocument(JSON.parse(JSON.stringify(editor.document)));
      return { content: JSON.stringify(toPortableLesson(document, meta), null, 2) + "\n", mime: "application/json", extension: "json", lost: [] };
    }
  }
}

/* ── Import ──────────────────────────────────────────────────────────────── */

export function importFormatFor(name: string, type = ""): ImportFormat | undefined {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["md", "markdown", "mdown", "mkd"].includes(ext) || type === "text/markdown") return "markdown";
  if (["html", "htm", "xhtml"].includes(ext) || type === "text/html") return "html";
  if (ext === "json" || type === "application/json") return "json";
  if (ext === "txt" || type === "text/plain") return "text";
  return undefined;
}

export const IMPORT_ACCEPT = ".md,.markdown,.html,.htm,.txt,.json,text/markdown,text/html,text/plain,application/json";
/** Larger files are refused before they are read: the whole lesson document is limited to 300 kB. */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

const STORABLE = new Set(["paragraph", "heading", "quote", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "codeBlock", "table", "divider", "callout", "equation", "youtube", "lessonDiagram"]);

/**
 * Makes parsed blocks storable: unknown and file-backed blocks go, headings past level 3 become
 * level 3, table cells lose formatting, links are normalized, ids are dropped so the editor
 * assigns fresh ones. Everything changed is reported.
 */
function storableBlocks(input: Block[], lost: Set<LossKind>, schemaTypes: ReadonlySet<string> = STORABLE): { blocks: Block[]; skipped: number } {
  let skipped = 0;
  const visit = (items: Block[]): Block[] => items.flatMap((block): Block[] => {
    const children = visit(block.children ?? []);
    if (!STORABLE.has(block.type) || !schemaTypes.has(block.type)) {
      skipped++;
      lost.add(block.type === "image" ? "images" : ["video", "audio", "file"].includes(block.type) ? "media" : ["source", "lessonQuiz", "lessonFlashcards"].includes(block.type) ? "sourceReferences" : "unsupportedBlocks");
      return children;
    }
    const props = { ...(block.props ?? {}) };
    if (block.type === "heading") {
      if (Number(props.level) > 3) { props.level = 3; lost.add("headingLevels"); }
      delete props.isToggleable;
    }
    let content = block.content;
    if (block.type === "table" && content && !Array.isArray(content)) {
      const table = content;
      let styled = false;
      const rows = (table.rows ?? []).map((row) => ({ cells: row.cells.map((cell) => {
        const runs = Array.isArray(cell) ? cell : cell.content ?? [];
        if (!Array.isArray(cell) || runs.some((r) => r.type !== "text" || Object.keys((r as { styles?: object }).styles ?? {}).length)) styled = true;
        return [textRun(inlineText(runs))] as Inline[];
      }) }));
      if (styled) lost.add("tableFormatting");
      content = { type: "tableContent", headerRows: table.headerRows, rows };
    }
    const { id: _id, ...rest } = block;
    void _id;
    return [{ ...rest, props, ...(content !== undefined ? { content } : {}), children } as Block];
  });
  const blocks = visit(input);
  const links = normalizeEditorLinks(blocks);
  if (links.removed) lost.add("links");
  return { blocks: links.blocks, skipped };
}

/** Parses an imported file into storable editor blocks (not yet inserted). */
export async function parseImport(editor: LessonEditorType, text: string, format: ImportFormat): Promise<ImportResult> {
  const lost = new Set<LossKind>();
  let parsed: Block[];
  switch (format) {
    case "markdown": parsed = asBlocks(await editor.tryParseMarkdownToBlocks(text)); break;
    case "html": {
      const clean = sanitizeClipboardHtml(text);
      if (clean.removedImages) lost.add("images");
      if (clean.removedMedia) lost.add("media");
      if (clean.removedLinks) lost.add("links");
      parsed = asBlocks(await editor.tryParseHTMLToBlocks(clean.html));
      break;
    }
    case "text":
      parsed = text.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
        .map((part) => ({ type: "paragraph", props: {}, content: [textRun(part)] as Inline[], children: [] } as unknown as Block));
      break;
    case "json": {
      const result = parsePortableLesson(text);
      if (!result.ok) throw new Error(result.problems.slice(0, 3).join("\n"));
      const blocks = result.lesson.document.blocks;
      if (blocks.some((b) => b.citations.length)) lost.add("citations");
      parsed = fromDurableDocument(result.lesson.document);
      break;
    }
  }
  const schemaTypes = new Set(Object.keys(editor.schema.blockSchema));
  const { blocks, skipped } = storableBlocks(parsed, lost, schemaTypes);
  const room = Math.max(0, LEARN_LIMITS.blocks - [...walk(asBlocks(editor.document))].length);
  let count = 0;
  const limited = blocks.filter((b) => { const size = [...walk([b])].length; if (count + size > room) return false; count += size; return true; });
  if (limited.length < blocks.length) lost.add("overLimit");
  return { blocks: limited, lost: [...lost], skipped: skipped + (blocks.length - limited.length) };
}

/** Inserts imported blocks after the caret's block (replacing it when it is an empty line), as one undo step. */
export function insertImported(editor: LessonEditorType, blocks: Block[]) {
  if (!blocks.length) return [];
  const anchor = editor.getTextCursorPosition().block;
  const empty = anchor.type === "paragraph" && Array.isArray(anchor.content) && anchor.content.length === 0;
  let inserted: { id: string }[] = [];
  editor.transact(() => {
    inserted = empty ? editor.replaceBlocks([anchor], blocks as never).insertedBlocks : editor.insertBlocks(blocks as never, anchor, "after");
  });
  return inserted;
}

/** "quizzes, flashcard sets and images" in the interface language. */
export function describeLosses(lost: readonly LossKind[], locale: "en" | "ar"): string {
  const names = lost.map((k) => lossCopy[locale][k]);
  if (names.length <= 1) return names[0] ?? "";
  const and = locale === "ar" ? " و" : " and ";
  return `${names.slice(0, -1).join(locale === "ar" ? "، " : ", ")}${and}${names[names.length - 1]}`;
}

/** Saves `content` as a file named after the lesson. */
export function downloadText(content: string, title: string, extension: string, mime: string) {
  const name = (title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 80) || "lesson") + "." + extension;
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Opens the HTML export in a new window and starts the browser's print dialog (Save as PDF). */
export function printHtml(html: string): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.opener = null;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // After layout, so the dialog shows the finished page.
  win.setTimeout(() => win.print(), 250);
  return true;
}
