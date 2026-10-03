import { asBlocks, blockText, parseYouTube, cellInlines, inlineText, type Block, type CitationContent, type Inline, type TableContent } from "./doc";

/**
 * Converts between the editor's BlockNote JSON and the backend's normalized
 * `LessonDocument` v1 (convex/learnModel.ts): flat blocks with `parentId`, plain text,
 * block-level citations with structured locators.
 *
 * v1 cannot yet hold everything the editor produces. Anything it cannot hold is reported in
 * `lost` so the save path can warn instead of silently dropping it.
 */

export type Locator =
  | { kind: "page"; page: number }
  | { kind: "slide"; slide: number }
  | { kind: "time"; start: number; end?: number }
  | { kind: "section"; label: string };

export interface ChaosCitation { sourceId: string; locator: Locator }
interface Common { id: string; parentId?: string; citations: ChaosCitation[]; conceptIds: string[] }
export type ChaosBlock =
  | (Common & { type: "paragraph"; text: string })
  | (Common & { type: "heading"; text: string; level: 1 | 2 | 3 })
  | (Common & { type: "list"; text: string; style: "bullet" | "number" | "check"; checked?: boolean })
  | (Common & { type: "image"; sourceId: string; alt: string; caption: string })
  | (Common & { type: "diagram"; text: string; format: "mermaid" })
  | (Common & { type: "youtube"; videoId: string; start?: number; end?: number; caption: string })
  | (Common & { type: "equation"; text: string; display: boolean })
  | (Common & { type: "table"; rows: string[][]; headerRows: number })
  | (Common & { type: "source"; sourceId: string; label: string })
  | (Common & { type: "quiz"; asset: { kind: "form" | "quiz"; id: string } });
export interface ChaosDocument { schemaVersion: 1; blocks: ChaosBlock[] }

export type LossKind = "formatting" | "links" | "callout" | "code" | "quote" | "divider" | "toggle" | "video" | "imageUrl" | "imageCredit" | "annotations" | "tableCells" | "unknown";

const toNumber = (s: string) => Number(s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));

/** "page 23", "p. 23", "pp 23", "ص 23", "صفحة 23", "slide 4", "شريحة 4", "12:30", "1:02-3:04", anything else → section. */
export function parseLocator(raw: string): Locator {
  const text = raw.trim();
  const page = text.match(/^(?:pages?|pp?\.?|ص\.?|صفحة)\s*([0-9٠-٩]+)$/i);
  if (page && toNumber(page[1]) >= 1) return { kind: "page", page: toNumber(page[1]) };
  const slide = text.match(/^(?:slides?|شريحة|الشريحة)\s*([0-9٠-٩]+)$/i);
  if (slide && toNumber(slide[1]) >= 1) return { kind: "slide", slide: toNumber(slide[1]) };
  const time = text.match(/^(\d{1,2}(?::\d{2}){1,2})(?:\s*[-–]\s*(\d{1,2}(?::\d{2}){1,2}))?$/);
  if (time) {
    const secs = (t: string) => t.split(":").map(Number).reduce((a, n) => a * 60 + n, 0);
    const start = secs(time[1]);
    const end = time[2] ? secs(time[2]) : undefined;
    if (end === undefined || end > start) return end === undefined ? { kind: "time", start } : { kind: "time", start, end };
  }
  return { kind: "section", label: text.slice(0, 300) || "—" };
}

export function formatLocator(locator: Locator, locale: "en" | "ar" = "en"): string {
  const ar = locale === "ar";
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  switch (locator.kind) {
    case "page": return `${ar ? "صفحة" : "page"} ${locator.page}`;
    case "slide": return `${ar ? "شريحة" : "slide"} ${locator.slide}`;
    case "time": return locator.end ? `${clock(locator.start)}–${clock(locator.end)}` : clock(locator.start);
    case "section": return locator.label;
  }
}

function hasFormatting(content: Inline[] | undefined, lost: Set<LossKind>) {
  for (const c of content ?? []) {
    if (c.type === "link") lost.add("links");
    if (c.type === "text" && Object.values((c as { styles?: object }).styles ?? {}).some(Boolean)) lost.add("formatting");
  }
}

function inlineCitations(content: Inline[] | undefined): ChaosCitation[] {
  return (content ?? []).filter((c): c is CitationContent => c.type === "citation" && !!(c as CitationContent).props?.sourceId)
    .map((c) => ({ sourceId: c.props.sourceId, locator: parseLocator(c.props.locator) }));
}

export interface ToChaosOptions {
  /** Maps an image URL to the backend source id holding that file; undefined when it isn't uploaded yet. */
  imageSourceId?: (url: string) => string | undefined;
}

export function toChaosDocument(content: unknown, options: ToChaosOptions = {}): { document: ChaosDocument; lost: LossKind[] } {
  const lost = new Set<LossKind>();
  const out: ChaosBlock[] = [];
  const visit = (blocks: Block[], parentId?: string) => {
    for (const block of blocks) {
      const inline = Array.isArray(block.content) ? block.content : undefined;
      hasFormatting(inline, lost);
      const common: Common = { id: block.id, ...(parentId ? { parentId } : {}), citations: inlineCitations(inline), conceptIds: [] };
      const text = inline ? inlineText(inline) : "";
      const p = block.props;
      switch (block.type) {
        case "paragraph": out.push({ ...common, type: "paragraph", text }); break;
        case "heading": out.push({ ...common, type: "heading", text, level: Math.min(3, Math.max(1, Number(p.level) || 1)) as 1 | 2 | 3 }); break;
        case "bulletListItem": out.push({ ...common, type: "list", style: "bullet", text }); break;
        case "numberedListItem": out.push({ ...common, type: "list", style: "number", text }); break;
        case "checkListItem": out.push({ ...common, type: "list", style: "check", text, checked: !!p.checked }); break;
        case "equation": out.push({ ...common, type: "equation", text, display: true }); break;
        case "youtube":
          if (p.videoId) out.push({ ...common, type: "youtube", videoId: String(p.videoId), ...(Number(p.start) ? { start: Number(p.start) } : {}), ...(Number(p.end) ? { end: Number(p.end) } : {}), caption: String(p.caption ?? "") });
          break;
        case "image": {
          const sourceId = options.imageSourceId?.(String(p.url ?? ""));
          if (!sourceId) { lost.add("imageUrl"); break; }
          if (p.credit) lost.add("imageCredit");
          if (p.annotations) lost.add("annotations");
          out.push({ ...common, type: "image", sourceId, alt: String(p.alt ?? ""), caption: String(p.caption ?? "") });
          break;
        }
        case "source":
          if (p.sourceId) out.push({ ...common, type: "source", sourceId: String(p.sourceId), label: String(p.locator ?? "") });
          break;
        case "table": {
          const table = block.content as TableContent | undefined;
          if (!table || Array.isArray(table)) break;
          if (table.rows.some((r) => r.cells.some((c) => !Array.isArray(c) && ((c.props?.colspan as number) > 1 || (c.props?.rowspan as number) > 1)))) lost.add("tableCells");
          const rows = table.rows.map((r) => r.cells.map((c) => { hasFormatting(cellInlines(c), lost); return inlineText(cellInlines(c)); }));
          const width = Math.max(1, ...rows.map((r) => r.length));
          out.push({ ...common, type: "table", rows: rows.map((r) => [...r, ...Array(width - r.length).fill("")]), headerRows: Math.min(rows.length, table.headerRows ?? 0) });
          break;
        }
        // Not in v1: kept as their text so nothing a reader needs disappears.
        case "callout": lost.add("callout"); out.push({ ...common, type: "paragraph", text }); break;
        case "codeBlock": lost.add("code"); out.push({ ...common, type: "paragraph", text }); break;
        case "quote": lost.add("quote"); out.push({ ...common, type: "paragraph", text }); break;
        case "toggleListItem": lost.add("toggle"); out.push({ ...common, type: "paragraph", text }); break;
        case "divider": lost.add("divider"); break;
        case "video": lost.add("video"); break;
        default: {
          lost.add("unknown");
          const fallback = blockText(block);
          if (fallback) out.push({ ...common, type: "paragraph", text: fallback });
        }
      }
      const kept = out.some((b) => b.id === block.id);
      if (block.children?.length) visit(block.children, kept ? block.id : parentId);
    }
  };
  visit(asBlocks(content));
  return { document: { schemaVersion: 1, blocks: out }, lost: [...lost] };
}

const textContent = (text: string) => (text ? [{ type: "text", text, styles: {} }] : []);

/** Backend document → editor blocks. `imageUrl` resolves image source ids to displayable URLs. */
export function fromChaosDocument(document: ChaosDocument, imageUrl: (sourceId: string) => string = () => "", locale: "en" | "ar" = "en"): Block[] {
  const byId = new Map<string, Block>();
  const roots: Block[] = [];
  for (const b of document.blocks) {
    const cites = b.citations.map((c) => ({ type: "citation", props: { sourceId: c.sourceId, locator: formatLocator(c.locator, locale) } }));
    const withCites = (text: string) => [...textContent(text), ...(cites.length ? [{ type: "text", text: " ", styles: {} }, ...cites] : [])] as Inline[];
    let block: Block;
    switch (b.type) {
      case "paragraph": block = { id: b.id, type: "paragraph", props: {}, content: withCites(b.text), children: [] }; break;
      case "heading": block = { id: b.id, type: "heading", props: { level: b.level }, content: withCites(b.text), children: [] }; break;
      case "list": block = { id: b.id, type: b.style === "bullet" ? "bulletListItem" : b.style === "number" ? "numberedListItem" : "checkListItem", props: b.style === "check" ? { checked: !!b.checked } : {}, content: withCites(b.text), children: [] }; break;
      case "equation": block = { id: b.id, type: "equation", props: {}, content: textContent(b.text) as Inline[], children: [] }; break;
      case "diagram": block = { id: b.id, type: "codeBlock", props: { language: "mermaid" }, content: textContent(b.text) as Inline[], children: [] }; break;
      case "youtube": block = { id: b.id, type: "youtube", props: { videoId: b.videoId, start: b.start ?? 0, end: b.end ?? 0, caption: b.caption }, children: [] }; break;
      case "image": block = { id: b.id, type: "image", props: { url: imageUrl(b.sourceId), alt: b.alt, caption: b.caption, sourceId: b.sourceId }, children: [] }; break;
      case "source": block = { id: b.id, type: "source", props: { sourceId: b.sourceId, locator: b.label }, children: [] }; break;
      case "table": block = { id: b.id, type: "table", props: {}, content: { type: "tableContent", headerRows: b.headerRows, rows: b.rows.map((r) => ({ cells: r.map((cell) => textContent(cell) as Inline[]) })) }, children: [] }; break;
      case "quiz": block = { id: b.id, type: "paragraph", props: { quizKind: b.asset.kind, quizId: b.asset.id }, content: [], children: [] }; break;
    }
    byId.set(b.id, block);
    const parent = b.parentId ? byId.get(b.parentId) : undefined;
    if (parent) parent.children.push(block); else roots.push(block);
  }
  return roots;
}
import type { LessonDocument } from "../../convex/learnModel";
import { editorBlocksToLessonDocument, lessonDocumentToEditorBlocks } from "../lessonBlockAdapter";

/** Exact conversion for durable saves. Unsupported editor state is an error, never a partial save. */
export function toDurableDocument(input: unknown, original?: LessonDocument): LessonDocument {
  if (!Array.isArray(input)) throw new Error("Lesson content must be a block array.");
  const old = new Map(original?.blocks.map(b => [b.id, b]) ?? []);
  const visit = (items: unknown[]): unknown[] => items.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid editor block.");
    const b = value as Record<string, unknown>;
    if (Object.keys(b).some(k => !["id", "type", "props", "content", "children"].includes(k))) throw new Error("Unknown editor fields cannot be saved losslessly.");
    if (b.children !== undefined && !Array.isArray(b.children)) throw new Error("Invalid editor children cannot be saved losslessly.");
    if (b.props !== undefined && (!b.props || typeof b.props !== "object" || Array.isArray(b.props))) throw new Error("Invalid editor props.");
    const props = { ...(b.props as Record<string, unknown> ?? {}) };
    const previous = old.get(String(b.id));
    if (previous?.presentation) props.lessonPresentation = JSON.stringify({ ...previous.presentation, ...(props.textAlignment !== undefined ? { alignment: props.textAlignment } : {}), ...(props.textColor !== undefined ? { textColor: props.textColor } : {}), ...(props.backgroundColor !== undefined ? { backgroundColor: props.backgroundColor } : {}) });
    props.lessonConceptIds = JSON.stringify(previous?.conceptIds ?? []);
    props.lessonCitations = JSON.stringify(previous?.citations ?? []);
    // BlockNote supplies neutral default props even when an editor type does not declare them.
    for (const key of ["isToggleable"]) {
      if (props[key] === false) delete props[key];
      else if (props[key] !== undefined) throw new Error("Unsupported toggleable heading formatting.");
    }
    let type = b.type;
    let content = b.content;
    if (type === "table") {
      const table = content as { type?: string; rows?: { cells: unknown[] }[]; headerRows?: number; headerCols?: number; columnWidths?: unknown[] };
      if (table?.type !== "tableContent" || !Array.isArray(table.rows)) throw new Error("Invalid lesson table.");
      if (Object.keys(table).some(k => !["type", "rows", "headerRows", "headerCols", "columnWidths"].includes(k)) || table.rows.some(row => Object.keys(row).some(k => k !== "cells"))) throw new Error("Unknown table fields cannot be saved losslessly.");
      if ((table.headerCols ?? 0) !== 0 || table.columnWidths?.some(w => w !== undefined && w !== null)) throw new Error("Table column formatting cannot yet be saved losslessly.");
      const rows = table.rows.map(row => row.cells.map(cell => {
        if (!Array.isArray(cell)) throw new Error("Merged or styled table cells cannot yet be saved losslessly.");
        return cell.map(run => {
          if (!run || run.type !== "text" || typeof run.text !== "string" || Object.keys(run.styles ?? {}).length || Object.keys(run).some(k => !["type", "text", "styles"].includes(k))) throw new Error("Rich table cells cannot yet be saved losslessly.");
          return run.text;
        }).join("");
      }));
      props.lessonData = JSON.stringify({ rows, headerRows: table.headerRows ?? 0 });
      content = undefined;
    }
    if (type === "image") {
      const url = String(props.url ?? "");
      if (url.startsWith("chaos-source:")) props.sourceId = url.slice("chaos-source:".length);
      else if (url) throw new Error("Upload this image to durable Chaos sources before saving. Device-local files cannot be shared.");
      delete props.url;
    }
    if (type === "youtube") {
      if (props.url) {
        const parsed = parseYouTube(String(props.url));
        if (!parsed || parsed.id !== props.videoId) throw new Error("YouTube URL and video ID disagree.");
      }
      delete props.url;
      if (props.title) throw new Error("YouTube title annotations cannot yet be saved losslessly.");
      delete props.title;
      if (props.end === 0) delete props.end;
    }
    if (type === "source") {
      props.label = props.locator ?? props.label ?? "";
      delete props.locator;
    }
    if (type === "lessonQuiz" || type === "quiz") {
      type = "lessonQuiz";
      const kind = props.assetKind; const id = props.assetId;
      if (kind && id) props.lessonData = JSON.stringify({ asset: { kind, id } });
      delete props.assetKind; delete props.assetId;
    }
    if (type === "equation") props.display = previous?.type === "equation" ? previous.display : true;
    if (type === "codeBlock" && previous?.type === "diagram" && props.language === "mermaid") {
      type = "diagram";
      props.lessonData = JSON.stringify({ format: "mermaid", text: Array.isArray(content) ? inlineText(content as Inline[]) : "" });
      delete props.language;
      content = undefined;
    }
    return { id: b.id, type, props, ...(content === undefined ? {} : { content }), children: visit(Array.isArray(b.children) ? b.children : []) };
  });
  const converted = editorBlocksToLessonDocument(visit(input));
  if (!converted.ok) throw new Error(converted.problems.map(p => p.path + ": " + p.message).join("\n"));
  return converted.value;
}

/** Stable content to real editor names; metadata without editor support survives in the save baseline. */
export function fromDurableDocument(document: LessonDocument): Block[] {
  const result = lessonDocumentToEditorBlocks(document);
  if (!result.ok) throw new Error(result.problems.map(p => p.message).join("\n"));
  const stable = new Map(document.blocks.map(b => [b.id, b]));
  const visit = (items: typeof result.value): Block[] => items.map(item => {
    const b = stable.get(item.id)!;
    const props: Record<string, unknown> = {};
    if (b.presentation?.alignment) props.textAlignment = b.presentation.alignment;
    if (b.presentation?.textColor) props.textColor = b.presentation.textColor;
    if (b.presentation?.backgroundColor) props.backgroundColor = b.presentation.backgroundColor;
    let type = item.type, content: Block["content"] = Array.isArray(item.content) ? item.content : item.content === undefined ? undefined : [{ type: "text", text: item.content, styles: {} }];
    if (b.type === "heading") props.level = b.level;
    if (b.type === "list" && b.checked !== undefined) props.checked = b.checked;
    if (b.type === "callout") props.tone = b.tone;
    if (b.type === "code") props.language = b.language;
    if (b.type === "image") Object.assign(props, { url: "chaos-source:" + b.sourceId, alt: b.alt, caption: b.caption, credit: b.credit ?? "", creditUrl: b.creditUrl ?? "", figureKind: b.figureKind ?? "photo", annotations: b.annotations ? JSON.stringify(b.annotations) : "", name: b.name ?? "", showPreview: b.showPreview ?? true, ...(b.previewWidth ? { previewWidth: b.previewWidth } : {}) });
    if (b.type === "youtube") Object.assign(props, { videoId: b.videoId, start: b.start ?? 0, end: b.end ?? 0, caption: b.caption, url: "", title: "" });
    if (b.type === "source") Object.assign(props, { sourceId: b.sourceId, locator: b.label });
    if (b.type === "equation" && b.inline?.some(r => r.href)) throw new Error("Equation links cannot be represented by this editor without data loss.");
    if (b.type === "equation") content = b.inline ? b.inline.map(r => ({ type: "text", text: r.text, styles: r.marks ?? {} })) : [{ type: "text", text: b.text, styles: {} }];
    if (b.type === "diagram") { type = "codeBlock"; props.language = "mermaid"; content = [{ type: "text", text: b.text, styles: {} }]; }
    if (b.type === "table") content = { type: "tableContent", headerRows: b.headerRows, rows: b.rows.map(row => ({ cells: row.map(text => [{ type: "text", text, styles: {} }]) })) };
    if (b.type === "quiz") { type = "lessonQuiz"; Object.assign(props, { assetKind: b.asset.kind, assetId: b.asset.id }); }
    return { id: b.id, type, props, ...(content === undefined ? {} : { content }), children: visit(item.children) };
  });
  return visit(result.value);
}
