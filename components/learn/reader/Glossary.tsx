"use client";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Volume2, X } from "lucide-react";
import type { GlossaryEntry, GlossaryMatcher } from "@/lib/learn/glossary";
import { splitTerms } from "@/lib/learn/glossary";
import { useCopy, useLocale } from "@/lib/i18n";
import { pronounce } from "@/lib/learn/narration/pronounce";
import { baseLang, dominantLang } from "@/lib/learn/narration/speakable";

const copy = {
  en: { lookUp: (term: string) => `Look up ${term}`, close: "Close", definition: "Definition", meaning: "Meaning", listen: "Pronounce", pronounce: (word: string) => `Pronounce ${word}` },
  ar: { lookUp: (term: string) => `ابحث عن ${term}`, close: "إغلاق", definition: "التعريف", meaning: "المعنى", listen: "انطق الكلمة", pronounce: (word: string) => `انطق ${word}` },
};

export interface OpenTerm { entry: GlossaryEntry; rect: DOMRect; from?: HTMLElement | null }
export const GlossaryContext = createContext<{ matcher: GlossaryMatcher | null; open: (term: OpenTerm) => void } | null>(null);

/** Text with the lesson's glossary terms marked; tapping one opens its look-up card. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Inline glossary terms preserve saved text offsets; the span button implements Enter and Space, and the look-up card uses managed focus. */
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
/* oxlint-enable jsx-a11y/prefer-tag-over-role */

function languageName(code: string | undefined, locale: string) {
  if (!code) return undefined;
  try { return new Intl.DisplayNames([locale], { type: "language" }).of(code); } catch { return code; }
}

/**
 * The look-up card, laid out like a dictionary entry: the word with its pronunciation and a speaker
 * that says only the word, the definition, then the word in the learner's language with its own speaker.
 */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Inline glossary terms preserve saved text offsets; the span button implements Enter and Space, and the look-up card uses managed focus. */
export function TermCard({ term, onClose, canSpeak = false }: { term: OpenTerm; onClose: () => void; canSpeak?: boolean }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const [below, setBelow] = useState(true);
  const [speaking, setSpeaking] = useState<"term" | "translation" | null>(null);
  const stopSpeech = useRef<(() => void) | null>(null);
  const { entry, rect } = term;
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const under = rect.bottom + h + 12 < window.innerHeight || rect.top - h - 12 < 8;
    setBelow(under);
    setPos({ left: Math.max(8, Math.min(window.innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)), top: under ? rect.bottom + 10 : rect.top - h - 10 });
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
      stopSpeech.current?.();
      from?.focus({ preventScroll: true });
    };
  }, [term.from, onClose]);
  const language = entry.language ?? "ar";
  const other = entry.translation || entry.explanation;
  const say = (which: "term" | "translation") => {
    stopSpeech.current?.();
    if (speaking === which) return; // a second tap stops it
    const text = which === "term" ? entry.term : entry.translation ?? "";
    setSpeaking(which);
    stopSpeech.current = pronounce(text, { lang: which === "term" ? dominantLang(text, "en") : baseLang(language), onEnd: () => setSpeaking((s) => (s === which ? null : s)) });
  };
  return (
    <div ref={card} className="lx-termcard ws-glass" data-side={below ? "below" : "above"} role="dialog" aria-label={entry.term} tabIndex={-1} style={pos}>
      <header>
        <strong dir="auto">{entry.term}</strong>
        <button type="button" className="lx-termcard__close" onClick={onClose} aria-label={t.close}><X size={14} aria-hidden /></button>
      </header>
      {(canSpeak || entry.pronunciation) && (
        <div className="lx-termcard__phonetic">
          {canSpeak ? (
            <button type="button" className="lx-termcard__speak" aria-pressed={speaking === "term"} onClick={() => say("term")}
              aria-label={entry.pronunciation ? `${t.pronounce(entry.term)}, ${entry.pronunciation}` : t.pronounce(entry.term)}>
              <SpeakerGlyph speaking={speaking === "term"} />
              <span dir="auto">{entry.pronunciation || t.listen}</span>
            </button>
          ) : <span className="lx-termcard__say" dir="auto">{entry.pronunciation}</span>}
        </div>
      )}
      <section><h4>{t.definition}</h4><p dir="auto">{entry.definition}</p></section>
      {other && (
        <section lang={language} dir={/^(ar|fa|he|ur|ps|yi)(-|$)/i.test(language) ? "rtl" : "auto"}>
          <h4>{languageName(language, locale) ?? t.meaning}</h4>
          {entry.translation && (
            <p className="lx-termcard__word">
              <span>{entry.translation}</span>
              {canSpeak && (
                <button type="button" className="lx-termcard__speak lx-termcard__speak--icon" aria-pressed={speaking === "translation"} onClick={() => say("translation")} aria-label={t.pronounce(entry.translation)}>
                  <SpeakerGlyph speaking={speaking === "translation"} />
                </button>
              )}
            </p>
          )}
          {entry.explanation && <p>{entry.explanation}</p>}
        </section>
      )}
    </div>
  );
}
/* oxlint-enable jsx-a11y/prefer-tag-over-role */

/** A speaker whose waves pulse while it talks. */
function SpeakerGlyph({ speaking }: { speaking: boolean }) {
  return <span className="lx-speaker" data-speaking={speaking || undefined} aria-hidden><Volume2 size={15} /></span>;
}
