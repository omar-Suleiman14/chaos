"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, GitFork, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { WsConfirm, WsTabs } from "@/components/workspace/primitives";
import { Select } from "@/components/workspace/Select";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { UnavailableLesson } from "@/components/learn/reader/LessonReader";
import { ProvenanceLine } from "@/components/learn/ui";
import { useCardReviews, useFlashcardSet, useLearnActions, useLearnViewer } from "@/lib/learn/data";
import { newId } from "@/lib/learn/data";
import type { Flashcard, Visibility } from "@/lib/learn/types";
import { errorMessage } from "@/lib/errors";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    back: "Flashcards", modes: { study: "Study", edit: "Edit" }, loading: "Loading set…",
    title: "Title", description: "Description", visibility: "Who can see it", vis: { private: "Only me", unlisted: "Anyone with the link", public: "Public" } as Record<Visibility, string>,
    front: "Front", back2: "Back", add: "Add card", remove: "Remove card", up: "Move up", down: "Move down", fromLesson: "From lesson",
    flip: "Show answer", hint: "Space or Enter to flip · 1 Again · 2 Knew it", again: "Again", knew: "Knew it",
    progress: (done: number, total: number) => `${done} of ${total} known well`, finished: "Round done. Cards you missed come back first.", restart: "Start another round", reset: "Reset progress",
    noCards: "This set has no cards yet.", addFirst: "Add cards", fork: "Copy to my sets", forked: "Copied to your sets", deleteSet: "Delete set",
    deleteTitle: "Delete this set?", deleteBody: "The cards and your study progress are deleted. This can’t be undone.", card: (i: number, n: number) => `Card ${i} of ${n}`,
    boxLabel: (b: number) => `Review level ${b} of 5`,
  },
  ar: {
    back: "البطاقات", modes: { study: "ذاكر", edit: "عدّل" }, loading: "جارٍ تحميل المجموعة…",
    title: "العنوان", description: "الوصف", visibility: "من يستطيع رؤيتها", vis: { private: "أنا فقط", unlisted: "كل من لديه الرابط", public: "عامة" } as Record<Visibility, string>,
    front: "الوجه", back2: "الظهر", add: "أضف بطاقة", remove: "أزل البطاقة", up: "لأعلى", down: "لأسفل", fromLesson: "من الدرس",
    flip: "اعرض الإجابة", hint: "المسافة أو Enter للقلب · 1 مرة أخرى · 2 عرفتها", again: "مرة أخرى", knew: "عرفتها",
    progress: (done: number, total: number) => `${done} من ${total} محفوظة جيدًا`, finished: "انتهت الجولة. تعود البطاقات التي أخطأتها أولًا.", restart: "ابدأ جولة أخرى", reset: "صفّر التقدم",
    noCards: "لا بطاقات في هذه المجموعة بعد.", addFirst: "أضف بطاقات", fork: "انسخ إلى مجموعاتي", forked: "نُسخت إلى مجموعاتك", deleteSet: "احذف المجموعة",
    deleteTitle: "حذف هذه المجموعة؟", deleteBody: "تُحذف البطاقات وتقدّمك في المذاكرة. لا يمكن التراجع.", card: (i: number, n: number) => `البطاقة ${i} من ${n}`,
    boxLabel: (b: number) => `مستوى المراجعة ${b} من 5`,
  },
};

function FlashcardSetPage() {
  const t = useCopy(copy);
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const set = useFlashcardSet(id);
  const viewer = useLearnViewer();
  const reviews = useCardReviews(id);
  const actions = useLearnActions();
  const [mode, setMode] = useState<"study" | "edit">(params.get("mode") === "edit" ? "edit" : "study");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const owner = !!set && set.ownerId === viewer?.id;

  if (set === undefined) return <PageSkeleton label={t.loading} />;
  if (set === null) return <UnavailableLesson backHref="/dashboard/learn/flashcards" />;
  const run = (fn: () => void) => { setError(""); try { fn(); } catch (err) { setError(errorMessage(err)); } };

  return (
    <div className="lx-page lx-page--narrow">
      <Link href="/dashboard/learn/flashcards" className="lx-link" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><ArrowLeft size={14} className="lx-flip" aria-hidden />{t.back}</Link>
      <header className="lx-hero">
        <div>
          <h1 className="ws-page-title">{set.title}</h1>
          {set.description && <p className="lx-help">{set.description}</p>}
          {set.forkedFrom && <ProvenanceLine provenance={set.forkedFrom} hrefFor={(sid) => `/dashboard/learn/flashcards/${sid}`} />}
          {set.lessonId && <Link className="lx-link" href={`/learn/${set.lessonId}`}><BookOpen size={13} aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} /> {t.fromLesson}</Link>}
        </div>
        <div className="lx-actions">
          {!owner && viewer?.signedIn && <button type="button" className="ws-btn" onClick={() => run(() => router.push(`/dashboard/learn/flashcards/${actions.forkFlashcardSet(set.id)}`))}><GitFork size={16} aria-hidden />{t.fork}</button>}
          {owner && <button type="button" className="ws-btn ws-btn--ghost" onClick={() => setConfirm(true)}><Trash2 size={16} aria-hidden />{t.deleteSet}</button>}
        </div>
      </header>
      {error && <p className="lx-error" role="alert">{error}</p>}
      {owner && <WsTabs tabs={["study", "edit"] as const} value={mode} onChange={setMode} label={set.title} labels={t.modes} />}
      {mode === "edit" && owner ? <EditCards setId={set.id} title={set.title} description={set.description} cards={set.cards} visibility={set.visibility} onError={setError} />
        : <Study setId={set.id} cards={set.cards} reviews={reviews ?? []} onEdit={owner ? () => setMode("edit") : undefined} />}
      {confirm && <WsConfirm title={t.deleteTitle} body={t.deleteBody} confirmLabel={t.deleteSet} onClose={() => setConfirm(false)} onConfirm={() => run(() => { actions.deleteFlashcardSet(set.id); router.push("/dashboard/learn/flashcards"); })} />}
    </div>
  );
}

function Study({ setId, cards, reviews, onEdit }: { setId: string; cards: Flashcard[]; reviews: { cardId: string; box: number; reviewedAt: number }[]; onEdit?: () => void }) {
  const t = useCopy(copy);
  const actions = useLearnActions();
  const boxOf = (cardId: string) => reviews.find((r) => r.cardId === cardId)?.box ?? 0;
  // Lowest box first: new and missed cards come back before the ones you know.
  const order = () => [...cards].sort((a, b) => boxOf(a.id) - boxOf(b.id)).map((c) => c.id);
  const [queue, setQueue] = useState(order);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards.find((c) => c.id === queue[index]);
  const known = cards.filter((c) => boxOf(c.id) >= 3).length;
  const answer = (knewIt: boolean) => { if (!card) return; actions.reviewCard(setId, card.id, knewIt); setFlipped(false); setIndex((i) => i + 1); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable=true], button")) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlipped((f) => !f); }
      if (flipped && e.key === "1") answer(false);
      if (flipped && e.key === "2") answer(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!cards.length) return <div className="lx-empty"><p>{t.noCards}</p>{onEdit && <button type="button" className="ws-btn" onClick={onEdit}>{t.addFirst}</button>}</div>;
  return (
    <div className="lx-section" style={{ gap: 16 }}>
      <div className="lx-panel__row"><span className="lx-muted" role="status">{t.progress(known, cards.length)}</span>
        <button type="button" className="lx-link" onClick={() => { actions.resetReviews(setId); setIndex(0); setQueue(order()); }}><RotateCcw size={12} aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} /> {t.reset}</button>
      </div>
      {card ? (
        <>
          <p className="lx-muted" aria-live="polite">{t.card(index + 1, queue.length)}</p>
          <div className="lx-flip">
            <button type="button" className="lx-flip__card" data-flipped={flipped} onClick={() => setFlipped((f) => !f)} aria-label={flipped ? card.back : `${card.front}. ${t.flip}`}>
              <span className="lx-flip__face" aria-hidden={flipped}>{card.front}</span>
              <span className="lx-flip__face lx-flip__face--back" aria-hidden={!flipped}>{card.back}</span>
              <span className="lx-flip__hint" aria-hidden>{t.hint}</span>
            </button>
          </div>
          <div className="lx-boxes" role="img" aria-label={t.boxLabel(boxOf(card.id))}>{[1, 2, 3, 4, 5].map((b) => <span key={b} data-on={boxOf(card.id) >= b} />)}</div>
          <div className="lx-actions" style={{ justifyContent: "center" }}>
            {!flipped ? <button type="button" className="ws-btn ws-btn--primary" onClick={() => setFlipped(true)}>{t.flip}</button> : (
              <>
                <button type="button" className="ws-btn" onClick={() => answer(false)}><X size={16} aria-hidden />{t.again}</button>
                <button type="button" className="ws-btn ws-btn--primary" onClick={() => answer(true)}><Check size={16} aria-hidden />{t.knew}</button>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="lx-empty"><Check size={26} aria-hidden /><p>{t.finished}</p><button type="button" className="ws-btn ws-btn--primary" onClick={() => { setIndex(0); setQueue(order()); }}>{t.restart}</button></div>
      )}
    </div>
  );
}

function EditCards({ setId, title, description, cards, visibility, onError }: { setId: string; title: string; description: string; cards: Flashcard[]; visibility: Visibility; onError: (m: string) => void }) {
  const t = useCopy(copy);
  const actions = useLearnActions();
  const save = (patch: Parameters<typeof actions.updateFlashcardSet>[1]) => { try { actions.updateFlashcardSet(setId, patch); } catch (err) { onError(errorMessage(err)); } };
  const setCards = (next: Flashcard[]) => save({ cards: next });
  const move = (i: number, d: number) => { const next = [...cards]; [next[i], next[i + d]] = [next[i + d], next[i]]; setCards(next); };
  return (
    <div className="lx-form">
      <div className="lx-form__row">
        <label className="lx-field">{t.title}<input className="lx-input" defaultValue={title} maxLength={160} onBlur={(e) => e.target.value !== title && save({ title: e.target.value })} /></label>
        <label className="lx-field">{t.visibility}<Select label={t.visibility} value={visibility} onChange={(v) => save({ visibility: v as Visibility })} options={(["private", "unlisted", "public"] as const).map((v) => ({ value: v, label: t.vis[v] }))} /></label>
      </div>
      <label className="lx-field">{t.description}<textarea className="lx-textarea" rows={2} defaultValue={description} maxLength={500} onBlur={(e) => e.target.value !== description && save({ description: e.target.value })} /></label>
      <div className="lx-cards-edit">
        {cards.map((c, i) => (
          <div key={c.id} className="lx-cards-edit__row">
            <span className="lx-muted" style={{ paddingTop: 10 }}>{i + 1}</span>
            <textarea className="lx-textarea" style={{ minHeight: 64 }} defaultValue={c.front} placeholder={t.front} aria-label={`${t.front} ${i + 1}`} maxLength={1000} onBlur={(e) => e.target.value !== c.front && setCards(cards.map((x) => x.id === c.id ? { ...x, front: e.target.value } : x))} />
            <textarea className="lx-textarea" style={{ minHeight: 64 }} defaultValue={c.back} placeholder={t.back2} aria-label={`${t.back2} ${i + 1}`} maxLength={2000} onBlur={(e) => e.target.value !== c.back && setCards(cards.map((x) => x.id === c.id ? { ...x, back: e.target.value } : x))} />
            <span style={{ display: "grid" }}>
              <button type="button" className="ws-icon-button" disabled={i === 0} aria-label={t.up} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
              <button type="button" className="ws-icon-button" disabled={i === cards.length - 1} aria-label={t.down} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
              <button type="button" className="ws-icon-button" aria-label={t.remove} onClick={() => setCards(cards.filter((x) => x.id !== c.id))}><Trash2 size={13} /></button>
            </span>
          </div>
        ))}
      </div>
      <button type="button" className="ws-btn" style={{ justifySelf: "start" }} onClick={() => setCards([...cards, { id: newId("card"), front: "", back: "" }])}><Plus size={15} aria-hidden />{t.add}</button>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><FlashcardSetPage /></Suspense>;
}
