"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "@/lib/toast";
import { SignInButton } from "@/lib/auth/client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Check, RotateCcw, X } from "lucide-react";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { useCardReviews, useLearnActions, useLearnViewer } from "@/lib/learn/data";
import type { Flashcard, Visibility } from "@/lib/learn/types";
import { useLessonActivity } from "../reader/ActivityContext";
import { localeDir } from "@/lib/locale";
import { useCopy, useLocale } from "@/lib/i18n";

const copy = {
  en: {
    deviceProgress: "Progress is saved on this device.", sync: "Sign in to save future reviews across devices", retained: "Your existing device progress stays here.", noPublished: "No published study snapshot is available.", publishSnapshot: "Publish study snapshot",
    back: "Flashcards", modes: { study: "Study", edit: "Edit" }, loading: "Loading set…",
    title: "Title", description: "Description", visibility: "Who can see it", vis: { private: "Only me", unlisted: "Anyone with the link", public: "Public" } as Record<Visibility, string>,
    front: "Front", back2: "Back", add: "Add card", remove: "Remove card", up: "Move up", down: "Move down", fromLesson: "From lesson",
    previous: "Previous card", next: "Next card",
    flip: "Show answer", hint: "Space or Enter to flip · 1 Again · 2 Knew it", again: "Again", knew: "Knew it",
    progress: (done: number, total: number) => `${done} of ${total} known well`, finished: "Round done. Cards you missed come back first.", restart: "Start another round", reset: "Restart round",
    noCards: "This set has no cards yet.", addFirst: "Add cards", fork: "Copy to my sets", forked: "Copied to your sets", deleteSet: "Delete set",
    deleteTitle: "Delete this set?", deleteBody: "The cards and your study progress are deleted. This can’t be undone.", card: (i: number, n: number) => `Card ${i} of ${n}`,
    boxLabel: (b: number) => `Review level ${b} of 5`,
  },
  ar: {
    deviceProgress: "يُحفظ تقدمك على هذا الجهاز.", sync: "سجّل الدخول لحفظ المراجعات القادمة عبر الأجهزة", retained: "يبقى تقدمك السابق محفوظًا هنا.", noPublished: "لا توجد نسخة منشورة للمذاكرة.", publishSnapshot: "انشر نسخة للمذاكرة",
    back: "البطاقات", modes: { study: "ذاكر", edit: "عدّل" }, loading: "جارٍ تحميل المجموعة…",
    title: "العنوان", description: "الوصف", visibility: "من يستطيع رؤيتها", vis: { private: "أنا فقط", unlisted: "كل من لديه الرابط", public: "عامة" } as Record<Visibility, string>,
    front: "الوجه", back2: "الظهر", add: "أضف بطاقة", remove: "أزل البطاقة", up: "لأعلى", down: "لأسفل", fromLesson: "من الدرس",
    previous: "البطاقة السابقة", next: "البطاقة التالية",
    flip: "اعرض الإجابة", hint: "المسافة أو Enter للقلب · 1 مرة أخرى · 2 عرفتها", again: "مرة أخرى", knew: "عرفتها",
    progress: (done: number, total: number) => `${done} من ${total} محفوظة جيدًا`, finished: "انتهت الجولة. تعود البطاقات التي أخطأتها أولًا.", restart: "ابدأ جولة أخرى", reset: "صفّر التقدم",
    noCards: "لا بطاقات في هذه المجموعة بعد.", addFirst: "أضف بطاقات", fork: "انسخ إلى مجموعاتي", forked: "نُسخت إلى مجموعاتك", deleteSet: "احذف المجموعة",
    deleteTitle: "حذف هذه المجموعة؟", deleteBody: "تُحذف البطاقات وتقدّمك في المذاكرة. لا يمكن التراجع.", card: (i: number, n: number) => `البطاقة ${i} من ${n}`,
    boxLabel: (b: number) => `مستوى المراجعة ${b} من 5`,
  },
};


export default function FlashcardStudy({ setId, onEdit }: { setId: string; onEdit?: () => void }) {
  const { locale } = useLocale();
  const t = useCopy(copy);
  const viewer = useLearnViewer();
  const actions = useLearnActions();
  const version = useQuery(api.flashcards.getPublished, { setId: setId as Id<"flashcardSets"> });
  const reviews = useCardReviews(setId);
  if (version === undefined || reviews === undefined) return <PageSkeleton label={t.loading} />;
  if (!version) return <div className="lx-empty"><p>{t.noPublished}</p>{onEdit && <button type="button" className="ws-btn" onClick={async () => { try { await actions.publishFlashcardStudy(setId); } catch (err) { toast.error(err); } }}>{t.publishSnapshot}</button>}</div>;
  return <section aria-label={version.title} dir={localeDir(locale)}>
    {!viewer?.signedIn && <p className="lx-notice" style={{ fontSize: 14 }}>{t.deviceProgress} <SignInButton mode="modal"><button type="button" className="lx-link">{t.sync}</button></SignInButton>. {t.retained}</p>}
    <StudyRound key={version._id + ":" + (viewer?.id ?? "guest")} setId={setId} cards={version.cards} reviews={reviews} onEdit={onEdit} onReview={async (cardId, knewIt) => { await actions.reviewCard(setId, cardId, knewIt); }} />
  </section>;
}

/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role -- The focusable study region scopes the documented study keyboard shortcuts. This labelled graphic is composed from inline SVG or multiple elements; a native img cannot represent it. */
export function StudyRound({ setId, cards: draftCards, reviews, onEdit, onReview }: { setId: string; cards: Flashcard[]; reviews: { cardId: string; box: number; reviewedAt: number }[]; onEdit?: () => void; onReview: (cardId: string, knewIt: boolean) => Promise<void> }) {
  const t = useCopy(copy);
  const report = useLessonActivity();
  const reviewed = useRef(new Set<string>());
  const round = useRef<HTMLDivElement>(null);
  const cards = draftCards;
  const boxOf = (cardId: string) => reviews.find((r) => r.cardId === cardId)?.box ?? 0;
  // Lowest box first: new and missed cards come back before the ones you know.
  const order = () => [...cards].sort((a, b) => boxOf(a.id) - boxOf(b.id)).map((c) => c.id);
  const [queue, setQueue] = useState(order);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const restart = () => { reviewed.current.clear(); setIndex(0); setFlipped(false); setQueue(order()); };
  const card = cards.find((c) => c.id === queue[index]);
  const known = cards.filter((c) => boxOf(c.id) >= 3).length;
  const [pending, setPending] = useState(false);
  const answer = async (knewIt: boolean) => { if (!card || pending) return; setPending(true); try { await onReview(card.id, knewIt); reviewed.current.add(card.id); if (reviewed.current.size === cards.length) report({ kind: "flashcards", id: setId, known: known + (knewIt && boxOf(card.id) === 2 ? 1 : !knewIt && boxOf(card.id) >= 3 ? -1 : 0), total: cards.length }); setFlipped(false); setIndex(i => i + 1); } catch (err) { toast.error(err); } finally { setPending(false); } };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!round.current?.contains(e.target as Node)) return;
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable=true], button")) return;
      if (pending) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlipped((f) => !f); }
      if (flipped && e.key === "1") answer(false);
      if (flipped && e.key === "2") answer(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!cards.length) return <div className="lx-empty"><p>{t.noCards}</p>{onEdit && <button type="button" className="ws-btn" onClick={onEdit}>{t.addFirst}</button>}</div>;
  return (
    <div ref={round} tabIndex={0} className="lx-section" style={{ gap: 16 }}>
      <div className="lx-panel__row"><output className="lx-muted" >{t.progress(known, cards.length)}</output>
        <button type="button" className="lx-link" disabled={pending} onClick={restart}><RotateCcw size={12} aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} /> {t.reset}</button>
      </div>
      <nav className="lx-actions" aria-label={t.back} style={{ justifyContent: "space-between" }}>
        <button type="button" className="ws-btn ws-btn--sm" disabled={pending || index === 0} onClick={() => { setIndex(i => i - 1); setFlipped(false); }}>{t.previous}</button>
        <button type="button" className="ws-btn ws-btn--sm" disabled={pending || index >= queue.length - 1} onClick={() => { setIndex(i => i + 1); setFlipped(false); }}>{t.next}</button>
      </nav>
      {card ? (
        <>
          <p className="lx-muted" aria-live="polite">{t.card(index + 1, queue.length)}</p>
          <div className="lx-flip">
            <button type="button" className="lx-flip__card" data-flipped={flipped} disabled={pending} onClick={() => setFlipped((f) => !f)} aria-label={flipped ? card.back : `${card.front}. ${t.flip}`}>
              <span className="lx-flip__face" dir="auto" aria-hidden={flipped}>{card.front}</span>
              <span className="lx-flip__face lx-flip__face--back" dir="auto" aria-hidden={!flipped}>{card.back}</span>
              <span className="lx-flip__hint" aria-hidden>{t.hint}</span>
            </button>
          </div>
          <div className="lx-boxes" role="img" aria-label={t.boxLabel(boxOf(card.id))}>{[1, 2, 3, 4, 5].map((b) => <span key={b} data-on={boxOf(card.id) >= b} />)}</div>
          <div className="lx-actions" style={{ justifyContent: "center" }}>
            {!flipped ? <button type="button" className="ws-btn ws-btn--primary" disabled={pending} onClick={() => setFlipped(true)}>{t.flip}</button> : (
              <>
                <button type="button" className="ws-btn" disabled={pending} onClick={() => answer(false)}><X size={16} aria-hidden />{t.again}</button>
                <button type="button" className="ws-btn ws-btn--primary" disabled={pending} onClick={() => answer(true)}><Check size={16} aria-hidden />{t.knew}</button>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="lx-empty"><Check size={26} aria-hidden /><p>{t.finished}</p><button type="button" className="ws-btn ws-btn--primary" onClick={restart}>{t.restart}</button></div>
      )}
    </div>
  );
}
/* oxlint-enable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role */
