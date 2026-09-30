import { asBlocks, blockText, cellInlines, inlineText, type Block, type CitationContent, type Inline, type TableContent } from "./doc";

/**
 * Converts between the editor's BlockNote JSON and the backend's normalized
 * `LessonDocument` v1 (convex/learnModel.ts): flat blocks with `parentId`, plain text,
 * block-level citations with structured locators.
 *
 * v1 cannot yet hold everything the editor produces. Anything it cannot hold is reported in
 * `lost` so the save path can warn instead of silently dropping it; the list doubles as the
 * backend's to-do (docs/learn-frontend-contract.md, "Document gaps").
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
