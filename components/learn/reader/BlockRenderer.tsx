"use client";
import Diagram from "./Diagram";

import InlineQuiz from "./InlineQuiz";
import InlineFlashcards from "./InlineFlashcards";
import { Fragment, memo, useEffect, useMemo, useState } from "react";
import { useStableCallback } from "@/lib/stableCallback";
import { PlayCircle } from "lucide-react";
import { asBlocks, blockText, cellInlines, formatTimestamp, inlineText, parseAnnotations, youTubeEmbedUrl, type Block, type CitationContent, type Inline, type LinkContent, type StyledText, type TableContent } from "@/lib/learn/doc";
import { resolveLearnFileUrl as resolveFileUrl } from "@/lib/learn/data";
import type { Highlight, LessonSource } from "@/lib/learn/types";
import { calloutIcon, sourceIcon, sourceLabel, useBlockCopy, type CalloutTone } from "../blockShared";
import ReaderMath from "./ReaderMath";
import { useCopy } from "@/lib/i18n";
import { TermText } from "./Glossary";
import type { GlossaryEntry } from "@/lib/learn/glossary";

const copy = {
  en: { play: (range: string) => `Play video${range ? `, ${range}` : ""}`, enlarge: "View full screen", codeLabel: (lang: string) => `Code${lang && lang !== "text" ? `, ${lang}` : ""}`, source: "Open source" },
  ar: { play: (range: string) => `شغّل الفيديو${range ? `، ${range}` : ""}`, enlarge: "عرض بملء الشاشة", codeLabel: (lang: string) => `شيفرة${lang && lang !== "text" ? `، ${lang}` : ""}`, source: "افتح المصدر" },
};

export interface RendererProps {
  content: unknown;
  sources: LessonSource[];
  highlights?: Highlight[];
  onCite?: (sourceId: string, locator: string) => void;
  onOpenImage?: (block: Block, url: string) => void;
  /** Controls drawn beside a block (save, note, discuss). */
  blockAside?: (block: Block) => React.ReactNode;
  /** Content drawn under a block (private notes). */
  blockAfter?: (block: Block) => React.ReactNode;
  activeBlockId?: string;
}

/** Only http(s) and mailto links become anchors; anything else renders as text. */
function safeHref(href: string): string | undefined {
  try {
    const url = new URL(href, "https://example.invalid");
    return ["http:", "https:", "mailto:"].includes(url.protocol) && !href.startsWith("//") ? href : undefined;
  } catch { return undefined; }
}

const COLORS = new Set(["gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"]);

function styled(text: StyledText, key: string, children: React.ReactNode = text.text): React.ReactNode {
  const s = text.styles ?? {};
  let node: React.ReactNode = children;
  if (s.code) node = <code>{node}</code>;
  if (s.bold) node = <strong>{node}</strong>;
  if (s.italic) node = <em>{node}</em>;
  if (s.underline) node = <u>{node}</u>;
  if (s.strike) node = <s>{node}</s>;
  const color = typeof s.textColor === "string" && COLORS.has(s.textColor) ? s.textColor : undefined;
  const bg = typeof s.backgroundColor === "string" && COLORS.has(s.backgroundColor) ? s.backgroundColor : undefined;
  if (color || bg) node = <span data-text-color={color} data-background-color={bg}>{node}</span>;
  return <Fragment key={key}>{node}</Fragment>;
}

/** Wraps the parts of `text` (starting at `at` in the block's plain text) that fall inside highlight ranges. */
function withMarks(text: string, at: number, ranges: { start: number; end: number; h: Highlight }[], key: string, terms?: Set<GlossaryEntry>): React.ReactNode {
  // Glossary terms are marked inside plain and highlighted text alike.
  const plain = (piece: string, k: string) => terms ? <TermText key={k} text={piece} seen={terms} keyPrefix={k} /> : piece;
  const hits = ranges.filter((r) => r.end > at && r.start < at + text.length);
  if (!hits.length) return plain(text, `${key}-p`);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const r of hits) {
    const s = Math.max(0, r.start - at);
    const e = Math.min(text.length, r.end - at);
    if (s > cursor) parts.push(plain(text.slice(cursor, s), `${key}-p${cursor}`));
    if (e > Math.max(s, cursor)) parts.push(<mark key={`${key}-${r.h.id}-${s}`} className="lx-hl" data-color={r.h.color} data-highlight-id={r.h.id}>{plain(text.slice(Math.max(s, cursor), e), `${key}-m${s}`)}</mark>);
    cursor = Math.max(cursor, e);
  }
  if (cursor < text.length) parts.push(plain(text.slice(cursor), `${key}-p${cursor}`));
  return parts;
}

/** Finds each highlight's quote in the block text, preferring the occurrence nearest its saved offset. */
export function locateHighlights(text: string, highlights: Highlight[]) {
  const out: { start: number; end: number; h: Highlight }[] = [];
  for (const h of highlights) {
    if (!h.quote) continue;
    let best = -1;
    for (let i = text.indexOf(h.quote); i !== -1; i = text.indexOf(h.quote, i + 1)) {
      if (best === -1 || Math.abs(i - h.offset) < Math.abs(best - h.offset)) best = i;
    }
    if (best !== -1) out.push({ start: best, end: best + h.quote.length, h });
  }
  return out.sort((a, b) => a.start - b.start);
}

function Inlines({ content, sources, highlights = [], onCite, keyPrefix }: { content: Inline[]; sources: LessonSource[]; highlights?: Highlight[]; onCite?: RendererProps["onCite"]; keyPrefix: string }) {
  const ranges = locateHighlights(inlineText(content), highlights);
  // Each glossary term is marked once per block; links and code stay untouched.
  const terms = new Set<GlossaryEntry>();
  // Start offset of every run in the block's plain text, for placing highlights.
  const starts: number[][] = [];
  let offset = 0;
  for (const c of content) {
    const runs = c.type === "text" ? [(c as StyledText).text] : c.type === "link" ? (c as LinkContent).content.map((t) => t.text) : [];
    starts.push(runs.map((text) => { const at = offset; offset += text.length; return at; }));
  }
  return (
    <>
      {content.map((c, i) => {
        const key = `${keyPrefix}-${i}`;
        if (c.type === "text") {
          const t = c as StyledText;
          return styled(t, key, withMarks(t.text, starts[i][0], ranges, key, t.styles?.code ? undefined : terms));
        }
        if (c.type === "link") {
          const l = c as LinkContent;
          const href = safeHref(l.href);
          const inner = l.content.map((t, j) => { const k = `${key}-${j}`; return styled(t, k, withMarks(t.text, starts[i][j], ranges, k)); });
          return href ? <a key={key} href={href} target={href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer nofollow ugc">{inner}</a> : <Fragment key={key}>{inner}</Fragment>;
        }
        if (c.type === "citation") {
          const p = (c as CitationContent).props;
          const source = sources.find((s) => s.id === p.sourceId);
          if (!source) return null;
          return <button key={key} type="button" className="lx-cite" onClick={() => onCite?.(p.sourceId, p.locator)} aria-label={`${sourceLabel(source, p.locator)}`}>{sourceLabel(source, p.locator)}</button>;
        }
        return null;
      })}
    </>
  );
}

function useFileUrl(url: string) {
  const [resolved, setResolved] = useState(url.startsWith("chaos-learn-file:") ? "" : url);
  useEffect(() => { let live = true; void resolveFileUrl(url).then((u) => { if (live) setResolved(u); }); return () => { live = false; }; }, [url]);
  return resolved;
}

function ReaderImage({ block, onOpen }: { block: Block; onOpen?: (block: Block, url: string) => void }) {
  const t = useCopy(copy);
  const bt = useBlockCopy();
  const p = block.props as Record<string, string | number | undefined>;
  const url = useFileUrl(String(p.url ?? ""));
  const credit = String(p.credit ?? "");
  const creditUrl = safeHref(String(p.creditUrl ?? ""));
  // Annotations are parsed so invalid data is dropped early; hotspot UI will draw them.
  parseAnnotations(p.annotations);
  if (!url) return <div className="lx-embed-empty" style={{ minHeight: 120 }} aria-hidden />;
  return (
    <figure className="lx-reader-figure" data-kind={p.figureKind}>
      <button type="button" onClick={() => onOpen?.(block, url)} aria-label={`${t.enlarge}${p.alt ? `: ${p.alt}` : ""}`}>
        <img src={url} alt={String(p.alt ?? "")} width={p.previewWidth ? Number(p.previewWidth) : undefined} loading="lazy" decoding="async" />
      </button>
      {(p.caption || credit) && (
        <figcaption>
          {p.caption}
          {credit && <small>{bt.credit}: {creditUrl ? <a href={creditUrl} target="_blank" rel="noopener noreferrer nofollow">{credit}</a> : credit}</small>}
        </figcaption>
      )}
    </figure>
  );
}

function ReaderYouTube({ block }: { block: Block }) {
  const t = useCopy(copy);
  const bt = useBlockCopy();
  const [playing, setPlaying] = useState(false);
  const p = block.props as { videoId: string; start: number; end: number; caption: string; title?: string };
  if (!/^[A-Za-z0-9_-]{11}$/.test(p.videoId ?? "")) return null;
  const range = p.start || p.end ? `${formatTimestamp(p.start)}–${p.end ? formatTimestamp(p.end) : "…"}` : "";
  return (
    <div className="lx-youtube">
      <div className="lx-youtube__frame">
        {playing ? (
          <iframe src={`${youTubeEmbedUrl(p.videoId, p.start, p.end)}&autoplay=1`} title={p.title || p.caption || "YouTube"} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        ) : (
          <>
            {/* Facade: YouTube loads only when the reader asks for it. */}
            <img src={`https://i.ytimg.com/vi/${p.videoId}/hqdefault.jpg`} alt="" loading="lazy" />
            <button type="button" className="lx-youtube__launch" onClick={() => setPlaying(true)} aria-label={t.play(range)}><PlayCircle size={56} aria-hidden /></button>
            {range && <span className="lx-youtube__range">{bt.ytWatch(range)}</span>}
          </>
        )}
      </div>
      {p.caption && <p className="lx-caption">{p.caption}</p>}
    </div>
  );
}

function ReaderSource({ block, sources, onCite }: { block: Block; sources: LessonSource[]; onCite?: RendererProps["onCite"] }) {
  const bt = useBlockCopy();
  const t = useCopy(copy);
  const source = sources.find((s) => s.id === block.props.sourceId);
  if (!source) return null;
  const Icon = sourceIcon[source.kind];
  const locator = String(block.props.locator ?? "");
  return (
    <aside className="lx-source" aria-label={`${bt.kinds[source.kind]}: ${source.title}`}>
      <span className="lx-source__icon" aria-hidden><Icon size={18} /></span>
      <div className="lx-source__main">
        <span className="lx-source__kind">{bt.kinds[source.kind]}</span>
        <strong>{source.title}</strong>
        <span className="lx-muted">{[source.author, source.year, source.owner && source.owner !== source.author ? `© ${source.owner}` : "", source.license].filter(Boolean).join(" · ")}</span>
        {locator && <span>{locator}</span>}
      </div>
      <button type="button" className="lx-link" onClick={() => onCite?.(source.id, locator)}>{t.source}</button>
    </aside>
  );
}

function Table({ table, sources, onCite, id }: { table: TableContent; sources: LessonSource[]; onCite?: RendererProps["onCite"]; id: string }) {
  const headerRows = table.headerRows ?? 0;
  const headerCols = table.headerCols ?? 0;
  return (
    <div className="lx-table-wrap" tabIndex={0} role="region" aria-label="Table">
      <table>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.cells.map((cell, c) => {
                const Tag = r < headerRows || c < headerCols ? "th" : "td";
                const props = Array.isArray(cell) ? {} : cell.props ?? {};
                return (
                  <Tag key={c} colSpan={Number(props.colspan) > 1 ? Number(props.colspan) : undefined} rowSpan={Number(props.rowspan) > 1 ? Number(props.rowspan) : undefined}
                    scope={Tag === "th" ? (r < headerRows ? "col" : "row") : undefined}>
                    <Inlines content={cellInlines(cell)} sources={sources} onCite={onCite} keyPrefix={`${id}-${r}-${c}`} />
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type BodyProps = { block: Block; sources: LessonSource[]; highlights?: Highlight[]; onCite: RendererProps["onCite"]; onOpenImage?: RendererProps["onOpenImage"] };

const sameHighlights = (a: Highlight[] = [], b: Highlight[] = []) =>
  a.length === b.length && a.every((h, i) => h === b[i] || (h.id === b[i].id && h.quote === b[i].quote && h.offset === b[i].offset && h.color === b[i].color));

/**
 * A finished block renders once. When an agent appends blocks to a lesson, or a highlight
 * lands elsewhere, the blocks already on screen are skipped: blocks keep their identity
 * across updates (useSharedBlocks) and the handlers are stable, so only changed blocks render.
 */
const BlockBody = memo(function BlockBody({ block, sources, highlights: hl, onCite, onOpenImage }: BodyProps) {
  const t = useCopy(copy);
  const inline = Array.isArray(block.content) ? <Inlines content={block.content} sources={sources} highlights={hl} onCite={onCite} keyPrefix={block.id} /> : null;
  const align = typeof block.props.textAlignment === "string" && block.props.textAlignment !== "left" ? { textAlign: block.props.textAlignment === "right" ? "end" : block.props.textAlignment } as React.CSSProperties : undefined;
  switch (block.type) {
    case "heading": {
      const level = Math.min(3, Math.max(1, Number(block.props.level) || 1));
      const Tag = (["h2", "h3", "h4"] as const)[level - 1];
      return <Tag style={align}>{inline}</Tag>;
    }
    case "quiz": case "lessonQuiz": {
      let asset: { kind: "form" | "quiz"; id: string } | undefined;
      try { asset = block.props.assetKind && block.props.assetId ? { kind: block.props.assetKind as "form" | "quiz", id: String(block.props.assetId) } : JSON.parse(String(block.props.lessonData)).asset; } catch { return null; }
      return asset && <InlineQuiz asset={asset}/>;
    }
    case "flashcards": case "lessonFlashcards": {
      let setId = typeof block.props.setId === "string" ? block.props.setId : "";
      if (!setId) { try { setId = JSON.parse(String(block.props.lessonData)).setId; } catch { return null; } }
      return setId ? <InlineFlashcards setId={setId} /> : null;
    }
    case "paragraph": return <p style={align}>{inline}</p>;
    case "quote": return <blockquote>{inline}</blockquote>;
    case "diagram": case "lessonDiagram": {
      let text = String(block.props.text ?? "");
      if (!text) { try { text = JSON.parse(String(block.props.lessonData)).text; } catch { return null; } }
      return <Diagram text={text} />;
    }
    case "codeBlock": {
      const lang = String(block.props.language ?? "");
      if (lang === "mermaid") return <Diagram text={blockText(block)} />;
      return <pre aria-label={t.codeLabel(lang)} data-language={lang}><code>{blockText(block)}</code></pre>;
    }
    case "divider": return <hr />;
    case "equation": {
      return <ReaderMath source={blockText(block)} />;
    }
    case "callout": {
      const tone = (block.props.tone as CalloutTone) ?? "info";
      const Icon = calloutIcon[tone] ?? calloutIcon.info;
      return <div className="lx-callout" data-tone={tone} role="note"><span className="lx-callout__icon" aria-hidden><Icon size={18} /></span><div className="lx-callout__body">{inline}</div></div>;
    }
    case "image": return <ReaderImage block={block} onOpen={onOpenImage} />;
    case "youtube": return <ReaderYouTube block={block} />;
    case "source": return <ReaderSource block={block} sources={sources} onCite={onCite} />;
    case "table": return block.content && !Array.isArray(block.content) ? <Table table={block.content} sources={sources} onCite={onCite} id={block.id} /> : null;
    case "checkListItem": return <div className="lx-check"><input type="checkbox" checked={!!block.props.checked} readOnly aria-readonly tabIndex={-1} /> <span>{inline}</span></div>;
    case "toggleListItem": return null; // rendered by the wrapper as <details>
    case "video": case "audio": case "file": {
      const href = safeHref(String(block.props.url ?? ""));
      return href ? <p><a href={href} target="_blank" rel="noopener noreferrer">{String(block.props.name || block.props.caption || href)}</a></p> : null;
    }
    default: return inline ? <p>{inline}</p> : null;
  }
}, (a, b) => a.block === b.block && a.sources === b.sources && a.onCite === b.onCite && a.onOpenImage === b.onOpenImage && sameHighlights(a.highlights, b.highlights));

type ListProps = Omit<RendererProps, "content" | "highlights"> & { highlights: Map<string, Highlight[]> };

const body = (block: Block, props: ListProps) =>
  <BlockBody block={block} sources={props.sources} highlights={props.highlights.get(block.id)} onCite={props.onCite} onOpenImage={props.onOpenImage} />;

function BlockShell({ block, props, children }: { block: Block; props: ListProps; children?: React.ReactNode }) {
  return (
    <div className="lx-block" id={block.id} data-block-id={block.id} data-type={block.type} data-active={props.activeBlockId === block.id || undefined}>
      {props.blockAside && <div className="lx-block__handle">{props.blockAside(block)}</div>}
      {children}
      {props.blockAfter?.(block)}
    </div>
  );
}

function BlockList({ blocks, props }: { blocks: Block[]; props: ListProps }) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === "bulletListItem" || block.type === "numberedListItem") {
      const group: Block[] = [];
      while (i < blocks.length && blocks[i].type === block.type) group.push(blocks[i++]);
      i--;
      const List = block.type === "bulletListItem" ? "ul" : "ol";
      out.push(
        <List key={group[0].id} className="lx-block" data-type="list" start={List === "ol" && Number(group[0].props.start) > 1 ? Number(group[0].props.start) : undefined}>
          {group.map((item) => (
            <li key={item.id} id={item.id} data-block-id={item.id} data-active={props.activeBlockId === item.id || undefined} style={{ position: "relative" }}>
              {props.blockAside && <div className="lx-block__handle">{props.blockAside(item)}</div>}
              {body(item, props)}
              {item.children.length > 0 && <BlockList blocks={item.children} props={props} />}
              {props.blockAfter?.(item)}
            </li>
          ))}
        </List>,
      );
      continue;
    }
    if (block.type === "toggleListItem") {
      out.push(
        <BlockShell key={block.id} block={block} props={props}>
          <details>
            <summary><Inlines content={Array.isArray(block.content) ? block.content : []} sources={props.sources} highlights={props.highlights.get(block.id)} onCite={props.onCite} keyPrefix={block.id} /></summary>
            <div><BlockList blocks={block.children} props={props} /></div>
          </details>
        </BlockShell>,
      );
      continue;
    }
    out.push(
      <BlockShell key={block.id} block={block} props={props}>
        {body(block, props)}
        {block.children.length > 0 && <div className="lx-children"><BlockList blocks={block.children} props={props} /></div>}
      </BlockShell>,
    );
  }
  return <>{out}</>;
}

/**
 * Gives unchanged blocks the object they had on the previous render, so memoized bodies
 * can compare by reference. Convex delivers a fresh document on every update.
 */
function useSharedBlocks(content: unknown) {
  const [seen] = useState(() => new Map<string, { key: string; block: Block }>());
  return useMemo(() => {
    const share = (blocks: Block[]): Block[] => blocks.map((block) => {
      const children = share(block.children ?? []);
      const key = JSON.stringify([block.type, block.props, block.content ?? null]);
      const prior = seen.get(block.id);
      const same = prior?.key === key && prior.block.children.length === children.length && prior.block.children.every((c, i) => c === children[i]);
      if (same) return prior.block;
      const next = prior?.key === key ? { ...prior.block, children } : { ...block, children };
      seen.set(block.id, { key, block: next });
      return next;
    });
    return share(asBlocks(content));
  }, [content, seen]);
}

/** Same reference while the value is unchanged by content. */
function useByContent<T>(value: T): T {
  const key = JSON.stringify(value ?? null);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- keyed by content on purpose
  return useMemo(() => value, [key]);
}

/** A stable function that always calls the latest `fn`; undefined while there is none. */
function useLatest<A extends unknown[]>(fn: ((...args: A) => void) | undefined) {
  const stable = useStableCallback((...args: A) => fn?.(...args));
  return fn ? stable : undefined;
}

export default function BlockRenderer({ content, highlights, sources, onCite, onOpenImage, ...rest }: RendererProps) {
  const blocks = useSharedBlocks(content);
  const byBlock = useMemo(() => {
    const map = new Map<string, Highlight[]>();
    for (const h of highlights ?? []) map.set(h.blockId, [...(map.get(h.blockId) ?? []), h]);
    return map;
  }, [highlights]);
  const props: ListProps = { ...rest, sources: useByContent(sources), highlights: byBlock, onCite: useLatest(onCite), onOpenImage: useLatest(onOpenImage) };
  return <BlockList blocks={blocks} props={props} />;
}
