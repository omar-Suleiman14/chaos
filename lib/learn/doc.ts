/**
 * Pure helpers over lesson documents (BlockNote block JSON). No React, no storage:
 * shared by the editor, the reader, search and the backend contract tests.
 */

export interface StyledText { type: "text"; text: string; styles?: Record<string, string | boolean> }
export interface LinkContent { type: "link"; href: string; content: StyledText[] }
export interface CitationContent { type: "citation"; props: { sourceId: string; locator: string }; content?: undefined }
export type Inline = StyledText | LinkContent | CitationContent | { type: string; props?: Record<string, unknown>; content?: unknown };

export interface TableCell { type: "tableCell"; content: Inline[]; props?: Record<string, unknown> }
export interface TableContent { type: "tableContent"; columnWidths?: (number | undefined)[]; headerRows?: number; headerCols?: number; rows: { cells: (Inline[] | TableCell)[] }[] }

export interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content?: Inline[] | TableContent;
  children: Block[];
}

export const asBlocks = (content: unknown): Block[] => (Array.isArray(content) ? (content as Block[]) : []);

export function cellInlines(cell: Inline[] | TableCell): Inline[] {
  return Array.isArray(cell) ? cell : cell.content ?? [];
}

export function inlineText(content: Inline[] | undefined): string {
  if (!content) return "";
  return content.map((c) => {
    if (c.type === "text") return (c as StyledText).text;
    if (c.type === "link") return (c as LinkContent).content.map((t) => t.text).join("");
    return "";
  }).join("");
}

/** Plain text of one block, without its children. Media blocks give their caption. */
export function blockText(block: Block): string {
  const c = block.content;
  if (c && !Array.isArray(c) && c.type === "tableContent") return c.rows.map((r) => r.cells.map((cell) => inlineText(cellInlines(cell))).join(" | ")).join("\n");
  if (Array.isArray(c)) return inlineText(c);
  const p = block.props;
  return [p.caption, p.alt, p.title, p.note].filter((x): x is string => typeof x === "string" && !!x).join(" — ");
}

export function* walk(blocks: Block[], depth = 0): Generator<{ block: Block; depth: number }> {
  for (const block of blocks) {
    yield { block, depth };
    if (block.children?.length) yield* walk(block.children, depth + 1);
  }
}

export function documentText(content: unknown): string {
  return [...walk(asBlocks(content))].map(({ block }) => blockText(block)).filter(Boolean).join("\n");
}

export function findBlock(content: unknown, id: string): Block | undefined {
  for (const { block } of walk(asBlocks(content))) if (block.id === id) return block;
  return undefined;
}

export interface OutlineItem { id: string; level: 1 | 2 | 3; text: string }

/** Headings in reading order. Empty headings are skipped; levels past 3 fold into 3. */
export function outline(content: unknown): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (const { block } of walk(asBlocks(content))) {
    if (block.type !== "heading") continue;
    const text = blockText(block).trim();
    if (!text) continue;
    const level = Math.min(3, Math.max(1, Number(block.props.level) || 1)) as 1 | 2 | 3;
    items.push({ id: block.id, level, text });
  }
  return items;
}

/** Minutes at ~200 words a minute (Arabic reads at a similar word rate), at least 1. */
export function readingMinutes(content: unknown): number {
  const words = documentText(content).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function excerpt(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/* ── YouTube ─────────────────────────────────────────────────────────────── */

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Accepts watch, youtu.be, shorts, embed and live links. Returns the video id and any t=/start= time. */
export function parseYouTube(input: string): { id: string; start?: number } | null {
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\.|^m\.|^music\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      id = m?.[1] ?? null;
    }
  }
  if (!id || !YT_ID.test(id)) return null;
  const t = url.searchParams.get("t") ?? url.searchParams.get("start");
  const start = t ? parseTimestamp(t) : null;
  return start ? { id, start } : { id };
}

/** "90", "1:30", "01:02:03", "1h2m3s", "2m" → seconds. Invalid → null. */
export function parseTimestamp(value: string): number | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  if (/^\d+(:\d{1,2}){1,2}$/.test(v)) {
    const parts = v.split(":").map(Number);
    if (parts.slice(1).some((n) => n > 59)) return null;
    return parts.reduce((total, n) => total * 60 + n, 0);
  }
  const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return null;
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Privacy-enhanced embed; start/end limit playback to the useful section. */
export function youTubeEmbedUrl(id: string, start?: number, end?: number): string {
  // playsinline keeps iOS on YouTube's own inline controls instead of its bare fullscreen player.
  const params = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" });
  if (start) params.set("start", String(Math.floor(start)));
  if (end && (!start || end > start)) params.set("end", String(Math.floor(end)));
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

/* ── Image annotations (reserved for diagram hotspots) ───────────────────── */

/**
 * Hotspots are stored on image blocks as a versioned JSON string so the block schema never
 * has to change to support them. Coordinates are fractions of the image (0–1), so they
 * survive resizing. v1 is read and preserved; no hotspot UI ships yet.
 */
export interface Annotation { id: string; x: number; y: number; w?: number; h?: number; label: string; body?: string }
export interface AnnotationLayer { v: 1; items: Annotation[] }

export function parseAnnotations(raw: unknown): AnnotationLayer {
  if (typeof raw !== "string" || !raw) return { v: 1, items: [] };
  try {
    const parsed = JSON.parse(raw) as AnnotationLayer;
    if (parsed?.v !== 1 || !Array.isArray(parsed.items)) return { v: 1, items: [] };
    const inUnit = (n: unknown) => typeof n === "number" && n >= 0 && n <= 1;
    return { v: 1, items: parsed.items.filter((a) => a && typeof a.id === "string" && typeof a.label === "string" && inUnit(a.x) && inUnit(a.y)) };
  } catch {
    return { v: 1, items: [] };
  }
}

/* ── Version comparison ───────────────────────────────────────────────────── */

export interface BlockChange { blockId: string; kind: "added" | "removed" | "changed"; beforeText?: string; afterText?: string; type: string }

/** Block-level differences, matched by block id. Used by version history and connected-app change previews. */
export function diffDocuments(before: unknown, after: unknown): BlockChange[] {
  const a = new Map([...walk(asBlocks(before))].map(({ block }) => [block.id, block]));
  const b = new Map([...walk(asBlocks(after))].map(({ block }) => [block.id, block]));
  const changes: BlockChange[] = [];
  for (const [id, block] of b) {
    const old = a.get(id);
    if (!old) changes.push({ blockId: id, kind: "added", afterText: blockText(block), type: block.type });
    else if (old.type !== block.type || JSON.stringify(old.props) !== JSON.stringify(block.props) || JSON.stringify(old.content) !== JSON.stringify(block.content)) {
      changes.push({ blockId: id, kind: "changed", beforeText: blockText(old), afterText: blockText(block), type: block.type });
    }
  }
  for (const [id, block] of a) if (!b.has(id)) changes.push({ blockId: id, kind: "removed", beforeText: blockText(block), type: block.type });
  return changes;
}

/** Copies a document with fresh block ids, for forks (ids stay unique across lessons). */
export function cloneWithNewIds(content: unknown, makeId: () => string): Block[] {
  const copy = (blocks: Block[]): Block[] => blocks.map((block) => ({ ...block, id: makeId(), children: copy(block.children ?? []) }));
  return copy(asBlocks(structuredClone(content)));
}

/** Citations used in a document, in reading order, for the sources list. */
export function citations(content: unknown): { blockId: string; sourceId: string; locator: string }[] {
  const out: { blockId: string; sourceId: string; locator: string }[] = [];
  for (const { block } of walk(asBlocks(content))) {
    if (!Array.isArray(block.content)) continue;
    for (const inline of block.content) {
      if (inline.type === "citation") {
        const p = (inline as CitationContent).props;
        out.push({ blockId: block.id, sourceId: p.sourceId, locator: p.locator });
      }
    }
  }
  return out;
}
