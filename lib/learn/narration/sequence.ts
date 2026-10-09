/**
 * The narration of a lesson, built from its structured blocks (never from the page DOM).
 * Pure and synchronous; built only when the reader presses Listen or Read aloud.
 */
import { asBlocks, blockText, cellInlines, inlineText, type Block } from "@/lib/learn/doc";
import { activityOf } from "./activity";
export { activityOf } from "./activity";
import { baseLang, dominantLang, languageSpans, sentences, speakable, speakLatex, type Chunk, type Lang } from "./speakable";

/** One utterance: one sentence (or part of one) in one language. */
export interface SpeechStep {
  kind: "speech";
  /** Element id of the block on the page (block id, or the lesson title/lead). */
  target: string;
  section: number;
  lang: Lang;
  text: string;
  map: Chunk[];
  /** The whole sentence in the block's display text, when the display text maps 1:1 to the page. */
  sentence?: [number, number];
  /** First step of its sentence: sentence-level navigation lands here. */
  sentenceStart: boolean;
}
export interface CheckpointStep { kind: "checkpoint"; target: string; section: number; activity: "quiz" | "flashcards"; key: string }
export type Step = SpeechStep | CheckpointStep;
export interface NarrationSection { id: string; title: string; first: number }
export interface Narration { steps: Step[]; sections: NarrationSection[] }

/** Blocks that are UI, decoration or media without words to read. */
const SILENT = new Set(["divider", "youtube", "source", "video", "audio", "file", "codeBlock", "diagram", "lessonDiagram"]);

const CALLOUT_PREFIX: Record<string, Record<Lang, string>> = {
  warning: { en: "Warning. ", ar: "تحذير. " },
  clinical: { en: "Clinical note. ", ar: "ملاحظة سريرية. " },
  key: { en: "Key point. ", ar: "نقطة أساسية. " },
  tip: { en: "Tip. ", ar: "نصيحة. " },
};
const FIGURE: Record<Lang, string> = { en: "Figure: ", ar: "شكل: " };
const NO_ALT = /^(?:image|img|photo|picture|screenshot|figure|untitled)?[\s_-]*\d*$|\.(?:png|jpe?g|gif|webp|svg|avif|heic)$/i;

export interface NarrationInput { title?: string; description?: string; language?: string; titleTarget?: string; leadTarget?: string }

export function buildNarration(content: unknown, input: NarrationInput = {}): Narration {
  const fallback = baseLang(input.language);
  const steps: Step[] = [];
  const sections: NarrationSection[] = [];
  let section = -1;
  const openSection = (id: string, title: string) => { sections.push({ id, title, first: steps.length }); section = sections.length - 1; };

  /** Display text whose characters are exactly the text on the page: highlightable sentences and words. */
  const mapped = (target: string, display: string, prefix?: Record<Lang, string>) => {
    let first = true;
    for (const [s, e] of sentences(display)) {
      let sentenceStart = true;
      for (const span of languageSpans(display, s, e, fallback)) {
        const spoken = speakable(display, span.start, span.end, span.lang);
        if (!spoken.text.trim()) continue;
        if (first && prefix) {
          const lead = prefix[span.lang];
          spoken.text = lead + spoken.text;
          spoken.map = [{ s: 0, e: lead.length, ds: span.start, de: span.start, identity: false }, ...spoken.map.map((c) => ({ ...c, s: c.s + lead.length, e: c.e + lead.length }))];
        }
        first = false;
        steps.push({ kind: "speech", target, section, lang: span.lang, text: spoken.text, map: spoken.map, sentence: [s, e], sentenceStart });
        sentenceStart = false;
      }
    }
  };
  /** Text composed for listening (tables, captions, equations): the block is followed as a whole. */
  const loose = (target: string, text: string, lang?: Lang) => {
    for (const [s, e] of sentences(text)) {
      let sentenceStart = true;
      const spans = lang ? [{ lang, start: s, end: e }] : languageSpans(text, s, e, fallback);
      for (const span of spans) {
        const spoken = lang ? { text: text.slice(span.start, span.end) } : speakable(text, span.start, span.end, span.lang);
        if (!spoken.text.trim()) continue;
        steps.push({ kind: "speech", target, section, lang: span.lang, text: spoken.text, map: [], sentenceStart });
        sentenceStart = false;
      }
    }
  };

  if (input.title?.trim()) {
    openSection(input.titleTarget ?? "lesson-title", input.title.trim());
    mapped(input.titleTarget ?? "lesson-title", input.title);
    if (input.description?.trim()) mapped(input.leadTarget ?? "lesson-lead", input.description);
  }

  const visit = (blocks: Block[]) => {
    for (const block of blocks) {
      const activity = activityOf(block);
      if (activity) {
        if (section < 0) openSection(block.id, "");
        steps.push({ kind: "checkpoint", target: block.id, section, activity: activity.activity, key: activity.key });
        continue;
      }
      if (block.type === "heading") {
        const text = blockText(block);
        if (text.trim()) { openSection(block.id, text.trim()); mapped(block.id, text); }
      } else if (section < 0 && !SILENT.has(block.type)) openSection(block.id, "");

      if (SILENT.has(block.type) || block.type === "heading") { /* nothing more to read */ }
      else if (block.type === "equation") {
        const spoken = speakLatex(blockText(block));
        if (spoken) loose(block.id, `${spoken}.`, "en");
      } else if (block.type === "image") {
        const p = block.props;
        const caption = typeof p.caption === "string" ? p.caption.trim() : "";
        const alt = typeof p.alt === "string" ? p.alt.trim() : "";
        const text = caption || (alt && !NO_ALT.test(alt) ? alt : "");
        if (text) loose(block.id, FIGURE[dominantLang(text, fallback)] + text);
      } else if (block.type === "table") {
        const c = block.content;
        if (c && !Array.isArray(c) && c.type === "tableContent") {
          const rows = c.rows.map((r) => r.cells.map((cell) => inlineText(cellInlines(cell)).trim()));
          const header = (c.headerRows ?? 0) > 0 ? rows[0] : undefined;
          const lines = rows.slice(header ? 1 : 0).map((cells) => cells.map((cell, i) => cell && header?.[i] ? `${header[i]}: ${cell}` : cell).filter(Boolean).join(", ")).filter(Boolean);
          if (lines.length) loose(block.id, lines.map((l) => (/[.!?؟]$/.test(l) ? l : `${l}.`)).join("\n"));
        }
      } else if (Array.isArray(block.content)) {
        const text = inlineText(block.content);
        if (text.trim()) mapped(block.id, text, block.type === "callout" ? CALLOUT_PREFIX[String(block.props.tone)] : undefined);
      }
      if (block.children?.length) visit(block.children);
    }
  };
  visit(asBlocks(content));
  return { steps, sections };
}

/** Narration of arbitrary text (a selection): spoken as written, in its own languages, nothing on the page followed. */
export function buildTextNarration(text: string, language?: string): Narration {
  const fallback = baseLang(language);
  const steps: Step[] = [];
  for (const [s, e] of sentences(text)) {
    let sentenceStart = true;
    for (const span of languageSpans(text, s, e, fallback)) {
      const spoken = speakable(text, span.start, span.end, span.lang);
      if (!spoken.text.trim()) continue;
      steps.push({ kind: "speech", target: "", section: 0, lang: span.lang, text: spoken.text, map: spoken.map, sentenceStart });
      sentenceStart = false;
    }
  }
  return { steps, sections: [{ id: "selection", title: "", first: 0 }] };
}

/** First step of the section containing `index`, and of the sections around it. */
export function sectionStart(n: Narration, index: number, delta: -1 | 0 | 1): number {
  const step = n.steps[Math.min(index, n.steps.length - 1)];
  const current = step ? step.section : 0;
  const target = Math.max(0, Math.min(n.sections.length - 1, current + delta));
  return n.sections[target]?.first ?? 0;
}

/** First step at or after the block with this id (or the section it opens), for "start from here". */
export function stepForTarget(n: Narration, target: string): number {
  const i = n.steps.findIndex((s) => s.target === target);
  return i < 0 ? 0 : i;
}
