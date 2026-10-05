"use client";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { GlossaryEntry, GlossaryMatcher } from "@/lib/learn/glossary";
import { splitTerms } from "@/lib/learn/glossary";
import { useCopy, useLocale } from "@/lib/i18n";

const copy = {
  en: { lookUp: (term: string) => `Look up ${term}`, close: "Close", definition: "Definition", meaning: "Meaning" },
  ar: { lookUp: (term: string) => `ابحث عن ${term}`, close: "إغلاق", definition: "التعريف", meaning: "المعنى" },
};

export interface OpenTerm { entry: GlossaryEntry; rect: DOMRect; from?: HTMLElement | null }
export const GlossaryContext = createContext<{ matcher: GlossaryMatcher | null; open: (term: OpenTerm) => void } | null>(null);

/** Text with the lesson's glossary terms marked; tapping one opens its look-up card. */
export function TermText({ text, seen, keyPrefix }: { text: string; seen: Set<GlossaryEntry>; keyPrefix: string }) {
  const glossary = useContext(GlossaryContext);
  const t = useCopy(copy);
  const parts = splitTerms(text, glossary?.matcher ?? null, seen);
  if (parts.length === 1 && typeof parts[0] === "string") return <>{text}</>;
  // A span, not a button: highlight offsets skip buttons, which would shift saved highlights.
  return <>{parts.map((part, i) => typeof part === "string" ? part : (
    <span key={`${keyPrefix}-t${i}`} role="button" tabIndex={0} className="lx-term" aria-haspopup="dialog" aria-label={t.lookUp(part.text)}
      onClick={(e) => glossary?.open({ entry: part.entry, rect: e.currentTarget.getBoundingClientRect(), from: e.currentTarget })}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); glossary?.open({ entry: part.entry, rect: e.currentTarget.getBoundingClientRect(), from: e.currentTarget }); } }}>{part.text}</span>
  ))}</>;
}

function languageName(code: string | undefined, locale: string) {
  if (!code) return undefined;
  try { return new Intl.DisplayNames([locale], { type: "language" }).of(code); } catch { return code; }
}

/** The look-up card: definition first, then the word and its meaning in the learner's language. */
export function TermCard({ term, onClose }: { term: OpenTerm; onClose: () => void }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const { entry, rect } = term;
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const below = rect.bottom + h + 12 < window.innerHeight || rect.top - h - 12 < 8;
    setPos({ left: Math.max(8, Math.min(window.innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)), top: below ? rect.bottom + 8 : rect.top - h - 8 });
    el.focus();
  }, [rect]);
  useEffect(() => {
    const from = term.from;
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: PointerEvent) => { if (!card.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
      from?.focus({ preventScroll: true });
    };
  }, [term.from, onClose]);
  const language = entry.language ?? "ar";
  const other = entry.translation || entry.explanation;
  return (
    <div ref={card} className="lx-termcard" role="dialog" aria-label={entry.term} tabIndex={-1} style={pos}>
      <header>
        <div><strong dir="auto">{entry.term}</strong>{entry.pronunciation && <span className="lx-termcard__say" dir="auto">{entry.pronunciation}</span>}</div>
        <button type="button" onClick={onClose} aria-label={t.close}><X size={15} aria-hidden /></button>
      </header>
      <section><h4>{t.definition}</h4><p dir="auto">{entry.definition}</p></section>
      {other && (
        <section lang={language} dir={/^(ar|fa|he|ur|ps|yi)(-|$)/i.test(language) ? "rtl" : "auto"}>
          <h4>{languageName(language, locale) ?? t.meaning}</h4>
          {entry.translation && <p className="lx-termcard__word">{entry.translation}</p>}
          {entry.explanation && <p>{entry.explanation}</p>}
        </section>
      )}
    </div>
  );
}
