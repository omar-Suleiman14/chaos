"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import katex from "katex";
import FlashcardBlockEditor from "./FlashcardBlockEditor";
import InlineFlashcards from "../reader/InlineFlashcards";
import "katex/dist/katex.min.css";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, defaultProps, imageParse } from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec, ResizableFileBlockWrapper, SourceBlockWithPreview, useResolveUrl } from "@blocknote/react";
import { createCodeBlockSpec } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import { AlertTriangle, BookMarked, FileText, Image as ImageIcon, Info, Lightbulb, Link2, PlayCircle, Presentation, Stethoscope, Star, Video } from "lucide-react";
import { formatTimestamp, parseTimestamp, parseYouTube } from "@/lib/learn/doc";
import type { LessonSource, SourceKind } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";

/** What custom blocks need from the lesson around them (its sources, dialogs owned by the editor page). */
export interface LessonEditorBridge {
  sources: LessonSource[];
  readOnly: boolean;
  manageSources: () => void;
  editImage: (blockId: string) => void;
  editCitation: (blockId: string | null, current?: { sourceId: string; locator: string }, onDone?: (value: { sourceId: string; locator: string } | null) => void) => void;
}
export const EditorBridge = createContext<LessonEditorBridge>({ sources: [], readOnly: true, manageSources: () => {}, editImage: () => {}, editCitation: () => {} });

const copy = {
  en: {
    tones: { info: "Note", tip: "Tip", warning: "Caution", clinical: "Clinical", key: "Key point" },
    toneLabel: "Callout style", equation: "Add an equation", equationPlaceholder: "LaTeX, e.g. \\frac{a}{b}", equationError: "This equation has an error.",
    ytPaste: "Paste a YouTube link", ytInvalid: "That isn't a YouTube link.", ytStart: "From", ytEnd: "To", ytCaption: "Why watch this part (optional)", ytTimeHelp: "mm:ss",
    ytRangeError: "End must be after start.", ytWatch: (range: string) => `Watch ${range}`,
    sourcePick: "Choose a source", sourceAdd: "Add or edit sources…", sourceNone: "This lesson has no sources yet.", sourceMissing: "Source removed", locator: "Where (e.g. page 23, slide 4)",
    citationMissing: "Missing source", kinds: { pdf: "PDF", slides: "Slides", link: "Link", video: "Video", book: "Book", article: "Article", reference: "Reference" } as Record<SourceKind, string>,
    open: "Open", altMissing: "No description yet", diagram: "Diagram", credit: "Credit",
  },
  ar: {
    tones: { info: "ملاحظة", tip: "نصيحة", warning: "تنبيه", clinical: "سريري", key: "نقطة أساسية" },
    toneLabel: "نمط التنبيه", equation: "أضف معادلة", equationPlaceholder: "LaTeX، مثل \\frac{a}{b}", equationError: "في هذه المعادلة خطأ.",
    ytPaste: "الصق رابط YouTube", ytInvalid: "هذا ليس رابط YouTube.", ytStart: "من", ytEnd: "إلى", ytCaption: "لماذا تشاهد هذا الجزء (اختياري)", ytTimeHelp: "د:ث",
    ytRangeError: "يجب أن تكون النهاية بعد البداية.", ytWatch: (range: string) => `شاهد ${range}`,
    sourcePick: "اختر مصدرًا", sourceAdd: "أضف المصادر أو عدّلها…", sourceNone: "لا مصادر لهذا الدرس بعد.", sourceMissing: "المصدر محذوف", locator: "الموضع (مثل صفحة 23، شريحة 4)",
    citationMissing: "مصدر مفقود", kinds: { pdf: "PDF", slides: "شرائح", link: "رابط", video: "فيديو", book: "كتاب", article: "مقال", reference: "مرجع" } as Record<SourceKind, string>,
    open: "فتح", altMissing: "لا وصف بعد", diagram: "رسم توضيحي", credit: "المصدر",
  },
};

export const useBlockCopy = () => useCopy(copy);

/* ── Callout ─────────────────────────────────────────────────────────────── */

export const CALLOUT_TONES = ["info", "tip", "warning", "clinical", "key"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];
export const calloutIcon: Record<CalloutTone, typeof Info> = { info: Info, tip: Lightbulb, warning: AlertTriangle, clinical: Stethoscope, key: Star };

export const Callout = createReactBlockSpec(
  { type: "callout", propSchema: { tone: { default: "info", values: CALLOUT_TONES } }, content: "inline" },
  {
    render: function CalloutBlock({ block, editor, contentRef }) {
      const t = useBlockCopy();
      const tone = block.props.tone as CalloutTone;
      const Icon = calloutIcon[tone];
      const next = CALLOUT_TONES[(CALLOUT_TONES.indexOf(tone) + 1) % CALLOUT_TONES.length];
      return (
        <div className="lx-callout" data-tone={tone}>
          <button type="button" contentEditable={false} className="lx-callout__icon" disabled={!editor.isEditable}
            aria-label={`${t.toneLabel}: ${t.tones[tone]}`} title={`${t.tones[tone]} → ${t.tones[next]}`}
            onClick={() => editor.updateBlock(block, { props: { tone: next } })}>
            <Icon size={18} aria-hidden />
          </button>
          <div className="lx-callout__body" ref={contentRef} />
        </div>
      );
    },
  },
);

/* ── Equation (LaTeX, rendered with KaTeX) ───────────────────────────────── */

export function renderMath(source: string, display = true): { html: string; error?: string } {
  try {
    return { html: katex.renderToString(source, { displayMode: display, throwOnError: true, output: "htmlAndMathml", strict: "ignore", trust: false }) };
  } catch (err) {
    return { html: "", error: err instanceof Error ? err.message : String(err) };
  }
}

export const Equation = createReactBlockSpec(
  { type: "equation", propSchema: {}, content: "plain" },
  {
    meta: { hasPreview: true, code: true },
    render: function EquationBlock({ block, editor, contentRef }) {
      const t = useBlockCopy();
      const source = Array.isArray(block.content) ? block.content.map((c) => ("text" in c ? c.text : "")).join("") : "";
      const rendered = useMemo(() => (source.trim() ? renderMath(source) : { html: "" }), [source]);
      const [lastGood, setLastGood] = useState(rendered.html);
      useEffect(() => { if (rendered.html) setLastGood(rendered.html); }, [rendered.html]);
      const preview = (rendered.html || lastGood) ? <span className="lx-math" dangerouslySetInnerHTML={{ __html: rendered.html || lastGood }} /> : undefined;
      return (
        <SourceBlockWithPreview block={block} editor={editor} contentRef={contentRef} source={source} preview={preview}
          error={rendered.error ? <span role="alert">{t.equationError} {rendered.error}</span> : undefined}
          emptySourcePlaceholder={t.equation} sourcePlaceholder={t.equationPlaceholder} />
      );
    },
  },
);

/* ── Image / diagram ─────────────────────────────────────────────────────── */

/**
 * The default image block plus teaching metadata: real alt text (not the file name), credit/source
 * line, a photo/diagram presentation, and `annotations`, a versioned JSON string reserved for
 * diagram hotspots (see lib/learn/doc.ts) so they can arrive without a schema change.
 */
/** The file wrapper is typed for the default file props; ours are a superset. */
const FileWrapper = ResizableFileBlockWrapper as unknown as React.FC<Record<string, unknown> & { buttonIcon: React.ReactNode; children: React.ReactNode }>;

export const LessonImage = createReactBlockSpec(
  {
    type: "image",
    content: "none",
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      backgroundColor: defaultProps.backgroundColor,
      name: { default: "" },
      url: { default: "" },
      caption: { default: "" },
      showPreview: { default: true },
      previewWidth: { default: undefined, type: "number" },
      alt: { default: "" },
      credit: { default: "" },
      creditUrl: { default: "" },
      figureKind: { default: "photo", values: ["photo", "diagram"] as const },
      annotations: { default: "" },
    },
  },
  {
    meta: { fileBlockAccept: ["image/*"] },
    parse: imageParse({}) as never,
    runsBefore: ["file"],
    render: function ImageBlock(props) {
      const t = useBlockCopy();
      const bridge = useContext(EditorBridge);
      const { block } = props;
      const resolved = useResolveUrl(block.props.url);
      return (
        <FileWrapper {...(props as object)} buttonIcon={<ImageIcon size={24} />}>
          <figure className="lx-figure" data-kind={block.props.figureKind}>
            <img className="bn-visual-media" src={resolved.loadingState === "loading" ? block.props.url : resolved.downloadUrl} alt={block.props.alt}
              width={block.props.previewWidth} contentEditable={false} draggable={false} />
            {!bridge.readOnly && (
              <button type="button" contentEditable={false} className="lx-figure__alt" data-missing={!block.props.alt || undefined} onClick={() => bridge.editImage(block.id)}>
                {block.props.figureKind === "diagram" ? `${t.diagram} · ` : ""}{block.props.alt ? `Alt: ${block.props.alt}` : t.altMissing}
                {block.props.credit ? ` · ${t.credit}: ${block.props.credit}` : ""}
              </button>
            )}
          </figure>
        </FileWrapper>
      );
    },
  },
);

/* ── YouTube with a watch range ──────────────────────────────────────────── */

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export const YouTube = createReactBlockSpec(
  {
    type: "youtube",
    content: "none",
    propSchema: { videoId: { default: "" }, url: { default: "" }, start: { default: 0 }, end: { default: 0 }, caption: { default: "" }, title: { default: "" } },
  },
  {
    render: function YouTubeBlock({ block, editor }) {
      const t = useBlockCopy();
      const [link, setLink] = useState("");
      const [error, setError] = useState("");
      const [from, setFrom] = useState(block.props.start ? formatTimestamp(block.props.start) : "");
      const [to, setTo] = useState(block.props.end ? formatTimestamp(block.props.end) : "");
      const editable = editor.isEditable;
      if (!block.props.videoId) {
        if (!editable) return <div className="lx-embed-empty" contentEditable={false}><Video size={18} aria-hidden /> YouTube</div>;
        return (
          <form className="lx-embed-input" contentEditable={false} onKeyDown={stop} onSubmit={(e) => {
            e.preventDefault();
            const parsed = parseYouTube(link);
            if (!parsed) { setError(t.ytInvalid); return; }
            editor.updateBlock(block, { props: { videoId: parsed.id, url: link.trim(), start: parsed.start ?? 0 } });
          }}>
            <PlayCircle size={18} aria-hidden />
            <input type="url" inputMode="url" placeholder={t.ytPaste} aria-label={t.ytPaste} value={link} onChange={(e) => { setLink(e.target.value); setError(""); }}
              onPaste={(e) => {
                const parsed = parseYouTube(e.clipboardData.getData("text"));
                if (parsed) { e.preventDefault(); editor.updateBlock(block, { props: { videoId: parsed.id, url: e.clipboardData.getData("text").trim(), start: parsed.start ?? 0 } }); }
              }} />
            {error && <span role="alert" className="lx-embed-input__error">{error}</span>}
          </form>
        );
      }
      const commit = () => {
        const start = from.trim() ? parseTimestamp(from) : 0;
        const end = to.trim() ? parseTimestamp(to) : 0;
        if (start === null || end === null) { setError(t.ytTimeHelp); return; }
        if (end && end <= start) { setError(t.ytRangeError); return; }
        setError("");
        editor.updateBlock(block, { props: { start, end } });
      };
      const range = block.props.start || block.props.end ? `${formatTimestamp(block.props.start)}–${block.props.end ? formatTimestamp(block.props.end) : "…"}` : "";
      return (
        <div className="lx-youtube" contentEditable={false}>
          <div className="lx-youtube__frame">
            {/* A still image while editing: an iframe would swallow clicks and keys inside the editor. */}
            <img src={`https://i.ytimg.com/vi/${block.props.videoId}/hqdefault.jpg`} alt="" loading="lazy" />
            <span className="lx-youtube__play" aria-hidden><PlayCircle size={42} /></span>
            {range && <span className="lx-youtube__range">{t.ytWatch(range)}</span>}
          </div>
          {editable && (
            <div className="lx-youtube__fields" onKeyDown={stop}>
              <label><span>{t.ytStart}</span><input value={from} placeholder="0:00" onChange={(e) => setFrom(e.target.value)} onBlur={commit} inputMode="numeric" aria-describedby={`${block.id}-time`} /></label>
              <label><span>{t.ytEnd}</span><input value={to} placeholder="—" onChange={(e) => setTo(e.target.value)} onBlur={commit} inputMode="numeric" aria-describedby={`${block.id}-time`} /></label>
              <span id={`${block.id}-time`} className="sr-only">{t.ytTimeHelp}</span>
              <input className="lx-youtube__caption" defaultValue={block.props.caption} placeholder={t.ytCaption} aria-label={t.ytCaption}
                onBlur={(e) => { if (e.target.value !== block.props.caption) editor.updateBlock(block, { props: { caption: e.target.value.slice(0, 300) } }); }} />
              {error && <span role="alert" className="lx-embed-input__error">{error}</span>}
            </div>
          )}
          {!editable && block.props.caption && <p className="lx-caption">{block.props.caption}</p>}
        </div>
      );
    },
  },
);

/* ── Source card and inline citation ─────────────────────────────────────── */

export const sourceIcon: Record<SourceKind, typeof FileText> = { pdf: FileText, slides: Presentation, link: Link2, video: Video, book: BookMarked, article: FileText, reference: BookMarked };

export function sourceLabel(source: LessonSource | undefined, locator?: string): string {
  const base = source ? source.shortLabel || source.title : "";
  return [base, locator?.trim()].filter(Boolean).join(" · ");
}

export const SourceBlock = createReactBlockSpec(
  { type: "source", content: "none", propSchema: { sourceId: { default: "" }, locator: { default: "" }, note: { default: "" } } },
  {
    render: function SourceCard({ block, editor }) {
      const t = useBlockCopy();
      const bridge = useContext(EditorBridge);
      const source = bridge.sources.find((s) => s.id === block.props.sourceId);
      const editable = editor.isEditable;
      if (!source) {
        return (
          <div className="lx-source lx-source--empty" contentEditable={false} onKeyDown={stop}>
            <BookMarked size={18} aria-hidden />
            {block.props.sourceId ? <span>{t.sourceMissing}</span> : null}
            {editable && (bridge.sources.length ? (
              <select aria-label={t.sourcePick} value="" onChange={(e) => editor.updateBlock(block, { props: { sourceId: e.target.value } })}>
                <option value="" disabled>{t.sourcePick}</option>
                {bridge.sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            ) : <span className="lx-muted">{t.sourceNone}</span>)}
            {editable && <button type="button" className="lx-link" onClick={bridge.manageSources}>{t.sourceAdd}</button>}
          </div>
        );
      }
      const Icon = sourceIcon[source.kind];
      return (
        <div className="lx-source" contentEditable={false} onKeyDown={stop}>
          <span className="lx-source__icon" aria-hidden><Icon size={18} /></span>
          <div className="lx-source__main">
            <span className="lx-source__kind">{t.kinds[source.kind]}</span>
            <strong>{source.title}</strong>
            <span className="lx-muted">{[source.author, source.year, source.owner && source.owner !== source.author ? source.owner : ""].filter(Boolean).join(" · ")}</span>
            {editable ? (
              <input defaultValue={block.props.locator} placeholder={t.locator} aria-label={t.locator}
                onBlur={(e) => { if (e.target.value !== block.props.locator) editor.updateBlock(block, { props: { locator: e.target.value.slice(0, 80) } }); }} />
            ) : block.props.locator ? <span>{block.props.locator}</span> : null}
          </div>
          {editable && <button type="button" className="lx-link" onClick={bridge.manageSources}>{t.sourceAdd}</button>}
        </div>
      );
    },
  },
);

export const Citation = createReactInlineContentSpec(
  { type: "citation", propSchema: { sourceId: { default: "" }, locator: { default: "" } }, content: "none" },
  {
    render: function CitationChip({ inlineContent, editor }) {
      const t = useBlockCopy();
      const bridge = useContext(EditorBridge);
      const source = bridge.sources.find((s) => s.id === inlineContent.props.sourceId);
      const label = source ? sourceLabel(source, inlineContent.props.locator) : t.citationMissing;
      return (
        <button type="button" className="lx-cite" data-missing={!source || undefined} contentEditable={false}
          onClick={() => {
            if (!editor.isEditable) return;
            bridge.editCitation(null, { sourceId: inlineContent.props.sourceId, locator: inlineContent.props.locator }, (value) => {
              if (!value) return;
              // Inline atoms are replaced by selecting them and inserting the edited chip.
              editor.insertInlineContent([{ type: "citation", props: value }]);
            });
          }}>
          {label}
        </button>
      );
    },
  },
);

/* ── Schema ──────────────────────────────────────────────────────────────── */

/** Block types lessons use. Audio and generic file blocks stay out of the slash menu; sources cover documents. */
export const LessonQuiz = createReactBlockSpec(
 { type: "lessonQuiz", propSchema: { assetKind: { default: "form", values: ["form", "quiz"] as const }, assetId: { default: "" } }, content: "none" },
 { render: function QuizBlock({ block, editor }) {
  return <div contentEditable={false} className="lx-callout" data-tone="info"><strong>Quiz</strong>{editor.isEditable ? <div className="lx-form"><select aria-label="Quiz type" value={block.props.assetKind} onChange={e=>editor.updateBlock(block,{props:{assetKind:e.target.value as "form"|"quiz"}})}><option value="form">Quiz form</option><option value="quiz">Classic quiz</option></select><input aria-label="Quiz ID" placeholder="Paste the ID of a published quiz" value={block.props.assetId} onChange={e=>editor.updateBlock(block,{props:{assetId:e.target.value.trim()}})}/></div> : <span>{block.props.assetId}</span>}</div>;
 } }
);
export const LessonFlashcards = createReactBlockSpec(
  { type: "lessonFlashcards", propSchema: { setId: { default: "" } }, content: "none" },
  { render: function FlashcardsBlock({ block, editor }) {
    return <div contentEditable={false} className="lx-panel">
      {editor.isEditable ? <FlashcardBlockEditor setId={block.props.setId} onSelect={setId => editor.updateBlock(block, { props: { setId } })} /> : block.props.setId ? <InlineFlashcards setId={block.props.setId} /> : null}
    </div>;
  } },
);
export const lessonSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec(codeBlockOptions),
    image: LessonImage(),
    callout: Callout(),
    equation: Equation(),
    youtube: YouTube(),
    source: SourceBlock(),
    lessonQuiz: LessonQuiz(),
    lessonFlashcards: LessonFlashcards(),
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, citation: Citation },
});

export type LessonSchema = typeof lessonSchema;
export type LessonEditorType = typeof lessonSchema.BlockNoteEditor;
