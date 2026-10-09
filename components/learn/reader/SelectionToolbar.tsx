"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookA, Bookmark, GraduationCap, HelpCircle, Lightbulb, MessageSquare, MessageSquarePlus, NotebookPen, Sparkles, Volume2, Wand2 } from "lucide-react";
import type { HighlightColor } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    label: "Selection actions", lookUp: "Look Up", read: "Read aloud", explain: "Explain", simplify: "Simplify", example: "Example", quiz: "Quiz me", save: "Save", note: "Note", discuss: "Discuss",
    highlight: (c: string) => `Highlight ${c}`, colors: { yellow: "yellow", green: "green", blue: "blue", pink: "pink" } as Record<HighlightColor, string>,
    chatgpt: "Ask ChatGPT", claude: "Ask Claude", hint: "Text selected. Press Alt+Enter for actions.",
  },
  ar: {
    label: "إجراءات التحديد", lookUp: "ابحث عن المعنى", read: "اقرأ بصوت عالٍ", explain: "اشرح", simplify: "بسّط", example: "مثال", quiz: "اختبرني", save: "احفظ", note: "ملاحظة", discuss: "ناقش",
    highlight: (c: string) => `تظليل ${c}`, colors: { yellow: "أصفر", green: "أخضر", blue: "أزرق", pink: "وردي" } as Record<HighlightColor, string>,
    chatgpt: "اسأل ChatGPT", claude: "اسأل Claude", hint: "حُدّد نص. اضغط Alt+Enter للإجراءات.",
  },
};

export interface TextSelection { text: string; blockId: string; offset: number; rect: DOMRect }
export type SelectionAction = "lookup" | "read" | "explain" | "simplify" | "example" | "quiz" | "save" | "note" | "discuss" | "chatgpt" | "claude" | `highlight:${HighlightColor}`;

const COLORS: HighlightColor[] = ["yellow", "green", "blue", "pink"];
const SWATCH: Record<HighlightColor, string> = { yellow: "#facc15", green: "#4ade80", blue: "#60a5fa", pink: "#f472b6" };

/** Plain-text offset of a DOM point inside a block, ignoring controls (buttons) drawn around the text. */
function offsetWithin(block: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(block, 0);
  range.setEnd(node, offset);
  const fragment = range.cloneContents();
  fragment.querySelectorAll("button, .lx-block__handle, .lx-block__marks, .lx-note-inline").forEach((el) => el.remove());
  return fragment.textContent?.length ?? 0;
}

export function useTextSelection(root: React.RefObject<HTMLElement | null>): [TextSelection | null, () => void] {
  const [selection, setSelection] = useState<TextSelection | null>(null);
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount || !root.current) { setSelection(null); return; }
      const range = sel.getRangeAt(0);
      if (!root.current.contains(range.commonAncestorContainer)) { setSelection(null); return; }
      // Annotation offsets refer to the original UTF-16 text, including whitespace.
      const text = sel.toString();
      if (!text.trim()) { setSelection(null); return; }
      const start = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest<HTMLElement>("[data-block-id]");
      if (!text || !start) { setSelection(null); return; }
      setSelection({ text, blockId: start.dataset.blockId!, offset: offsetWithin(start, range.startContainer, range.startOffset), rect: range.getBoundingClientRect() });
    };
    const onChange = () => { if (!frame) frame = requestAnimationFrame(read); };
    document.addEventListener("selectionchange", onChange);
    window.addEventListener("scroll", onChange, { passive: true });
    return () => { document.removeEventListener("selectionchange", onChange); window.removeEventListener("scroll", onChange); cancelAnimationFrame(frame); };
  }, [root]);
  return [selection, () => { document.getSelection()?.removeAllRanges(); setSelection(null); }];
}

export default function SelectionToolbar({ selection, onAction, canWrite, aiLabel, canLookUp, canRead, within }: {
  selection: TextSelection; onAction: (action: SelectionAction) => void; canWrite: boolean;
  /** The device can speak: offer Read aloud for exactly the selected text. */
  canRead?: boolean;
  /** On large screens the toolbar stays inside this element (the lesson column), never over the sidebars. */
  within?: React.RefObject<HTMLElement | null>;
  /** The selection is a glossary term, so Look Up can open its card. */
  canLookUp?: boolean;
  /** When in-product AI is off, Explain/Simplify/Example/Quiz go to an external assistant; the label says so. */
  aiLabel?: string;
}) {
  const t = useCopy(copy);
  const bar = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const area = within?.current && window.matchMedia("(min-width: 1181px)").matches ? within.current.getBoundingClientRect() : null;
    el.style.maxWidth = area ? `${Math.min(area.width + 16, window.innerWidth - 16)}px` : "";
    const min = area ? Math.max(8, area.left - 8) : 8;
    const max = area ? Math.min(window.innerWidth - 8, area.right + 8) : window.innerWidth - 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const r = selection.rect;
    const above = r.top - h - 10 > 64;
    setPos({ left: Math.max(min, Math.min(max - w, r.left + r.width / 2 - w / 2)), top: above ? r.top - h - 8 : Math.min(window.innerHeight - h - 8, r.bottom + 8) });
  }, [selection, within]);
  // Alt+Enter moves focus into the toolbar for keyboard users; Escape returns.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "Enter") { e.preventDefault(); bar.current?.querySelector<HTMLButtonElement>("button")?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const item = (action: SelectionAction, Icon: typeof Sparkles, label: string) => (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAction(action)}><Icon size={15} aria-hidden />{label}</button>
  );
  return (
    <>
      <output className="sr-only" >{t.hint}</output>
      <div ref={bar} className="lx-seltools ws-glass" role="toolbar" tabIndex={-1} aria-label={t.label} style={pos}
        onKeyDown={(e) => {
          const buttons = Array.from(bar.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
          const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const step = (e.key === "ArrowRight") !== rtl ? 1 : -1; buttons[(i + step + buttons.length) % buttons.length]?.focus(); }
          if (e.key === "Escape") { e.preventDefault(); (document.getSelection()?.anchorNode?.parentElement as HTMLElement | null)?.closest<HTMLElement>("[data-block-id]")?.focus(); }
        }}>
        {canLookUp && <>{item("lookup", BookA, t.lookUp)}<span className="lx-seltools__sep" aria-hidden /></>}
        {canRead && <>{item("read", Volume2, t.read)}<span className="lx-seltools__sep" aria-hidden /></>}
        {item("explain", Lightbulb, t.explain)}
        {item("simplify", Wand2, t.simplify)}
        {item("example", Sparkles, t.example)}
        {item("quiz", HelpCircle, t.quiz)}
        {aiLabel && <span className="lx-muted lx-seltools__note" style={{ fontSize: 11, paddingInline: 4 }}>{aiLabel}</span>}
        <span className="lx-seltools__sep" aria-hidden />
        {canWrite && <span className="lx-seltools__swatches">{COLORS.map((c) => (
          <button key={c} type="button" aria-label={t.highlight(t.colors[c])} title={t.highlight(t.colors[c])} onMouseDown={(e) => e.preventDefault()} onClick={() => onAction(`highlight:${c}`)}>
            <span className="lx-seltools__swatch" style={{ background: SWATCH[c] }} aria-hidden />
          </button>
        ))}</span>}
        {canWrite && item("note", NotebookPen, t.note)}
        {canWrite && item("save", Bookmark, t.save)}
        {canWrite && item("discuss", MessageSquarePlus, t.discuss)}
        <span className="lx-seltools__sep" aria-hidden />
        {item("chatgpt", MessageSquare, t.chatgpt)}
        {item("claude", GraduationCap, t.claude)}
      </div>
    </>
  );
}
