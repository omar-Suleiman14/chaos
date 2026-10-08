"use client";

import { FocusTextarea } from "@/components/InitialFocus";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import FlashcardStudy from "@/components/learn/study/FlashcardStudy";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, GitFork, History, Plus, Trash2 } from "lucide-react";
import FlashcardVersionHistory from "@/components/learn/study/FlashcardVersionHistory";
import { WsConfirm, WsTabs } from "@/components/workspace/primitives";
import { Select } from "@/components/workspace/Select";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { UnavailableLesson } from "@/components/learn/reader/LessonReader";
import { ProvenanceLine } from "@/components/learn/ui";
import { useFlashcardSet, useLearnActions, useLearnViewer } from "@/lib/learn/data";
import { newId } from "@/lib/learn/data";
import type { Flashcard, Visibility } from "@/lib/learn/types";
import { errorMessage } from "@/lib/errors";
import { useCopy } from "@/lib/i18n";
import { hostHref } from "@/lib/hosts";

const copy = {
  en: {
    back: "Back to library", modes: { study: "Study", edit: "Cards" }, loading: "Loading set…",
    title: "Title", description: "Description", visibility: "Who can see it", teamOnly: (name: string) => `Team only · ${name}`, vis: { private: "Only me", unlisted: "Anyone with the link", public: "Public" } as Record<Visibility, string>,
    front: "Front", back2: "Back", add: "Add card", remove: "Remove card", up: "Move up", down: "Move down", fromLesson: "From lesson",
    flip: "Show answer", hint: "Space or Enter to flip · 1 Again · 2 Knew it", again: "Again", knew: "Knew it",
    progress: (done: number, total: number) => `${done} of ${total} known well`, finished: "Round done. Cards you missed come back first.", restart: "Start another round", reset: "Reset progress",
    noCards: "This set has no cards yet.", addFirst: "Add cards", fork: "Copy to my sets", forked: "Copied to your sets", deleteSet: "Archive set",
    deleteTitle: "Archive this set?", deleteBody: "The set moves to Archive. Your cards and study progress are preserved, and you can restore it there.", card: (i: number, n: number) => `Card ${i} of ${n}`,
    boxLabel: (b: number) => `Review level ${b} of 5`, save: "Save draft", publish: "Save and publish", history: "Version history",
  },
  ar: {
    back: "البطاقات", modes: { study: "ذاكر", edit: "عدّل" }, loading: "جارٍ تحميل المجموعة…",
    save: "احفظ المسودة", publish: "احفظ وانشر", history: "سجل النسخ",
    title: "العنوان", description: "الوصف", visibility: "من يستطيع رؤيتها", teamOnly: (name: string) => `للفريق فقط · ${name}`, vis: { private: "أنا فقط", unlisted: "كل من لديه الرابط", public: "عامة" } as Record<Visibility, string>,
    front: "الوجه", back2: "الظهر", add: "أضف بطاقة", remove: "أزل البطاقة", up: "لأعلى", down: "لأسفل", fromLesson: "من الدرس",
    flip: "اعرض الإجابة", hint: "المسافة أو Enter للقلب · 1 مرة أخرى · 2 عرفتها", again: "مرة أخرى", knew: "عرفتها",
    progress: (done: number, total: number) => `${done} من ${total} محفوظة جيدًا`, finished: "انتهت الجولة. تعود البطاقات التي أخطأتها أولًا.", restart: "ابدأ جولة أخرى", reset: "صفّر التقدم",
    noCards: "لا بطاقات في هذه المجموعة بعد.", addFirst: "أضف بطاقات", fork: "انسخ إلى مجموعاتي", forked: "نُسخت إلى مجموعاتك", deleteSet: "أرشف المجموعة",
    deleteTitle: "أرشفة هذه المجموعة؟", deleteBody: "تنتقل المجموعة إلى الأرشيف مع حفظ البطاقات وتقدّم المذاكرة. يمكنك استعادتها من هناك.", card: (i: number, n: number) => `البطاقة ${i} من ${n}`,
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
  const actions = useLearnActions();
  const [mode, setMode] = useState<"study" | "edit">(params.get("mode") === "edit" ? "edit" : "study");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [history, setHistory] = useState(false);
  // A restore replaces the draft: the card editor starts over from it.
  const [editKey, setEditKey] = useState(0);
  const owner = !!set && set.ownerId === viewer?.id;

  if (set === undefined) return <PageSkeleton label={t.loading} />;
  if (set === null) return <UnavailableLesson backHref="/dashboard/learn/flashcards" />;
  const run = async (fn: () => unknown | Promise<unknown>) => { setError(""); try { await fn(); } catch (err) { setError(errorMessage(err)); } };

  return (
    <div className="ws-flashcard-builder">
      <Link href="/dashboard?tab=flashcards" className="lx-link lx-back"><ArrowLeft size={14} className="lx-flip" aria-hidden />{t.back}</Link>
      <header className="ws-page-header">
        <div>
          <h1 className="ws-page-title">{set.title}</h1>
          {set.description && <p className="lx-help">{set.description}</p>}
          {set.forkedFrom && <ProvenanceLine provenance={set.forkedFrom} hrefFor={(sid) => `/dashboard/learn/flashcards/${sid}`} />}
          {set.lessonId && <Link className="lx-link" href={hostHref(`/learn/${set.lessonId}`)}><BookOpen size={13} aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} /> {t.fromLesson}</Link>}
        </div>
        <div className="lx-actions">
          {!owner && viewer?.signedIn && <button type="button" className="ws-btn" onClick={() => run(async () => { const id = await actions.forkFlashcardSet(set.id); router.push(`/dashboard/learn/flashcards/${id}`); })}><GitFork size={16} aria-hidden />{t.fork}</button>}
          {owner && <button type="button" className="ws-btn ws-btn--ghost" onClick={() => setHistory(true)}><History size={16} aria-hidden />{t.history}</button>}
          {owner && <button type="button" className="ws-btn ws-btn--ghost" onClick={() => setConfirm(true)}><Trash2 size={16} aria-hidden />{t.deleteSet}</button>}
        </div>
      </header>
      {error && <p className="lx-error" role="alert">{error}</p>}
      {owner && <WsTabs tabs={["edit", "study"] as const} value={mode} onChange={setMode} label={set.title} labels={t.modes} />}
      {mode === "edit" && owner ? <EditCards key={editKey} setId={set.id} title={set.title} description={set.description} cards={set.cards} visibility={set.visibility} teamId={set.teamId} onError={setError} onSaved={() => { setMode("study"); router.replace(`/dashboard/learn/flashcards/${set.id}`); }} />
        : <FlashcardStudy setId={set.id} onEdit={owner ? () => setMode("edit") : undefined} />}
      {history && owner && <FlashcardVersionHistory setId={set.id} title={set.title} cards={set.cards} onClose={() => setHistory(false)} onRestored={() => { setMode("study"); setEditKey((k) => k + 1); }} />}
      {confirm && <WsConfirm title={t.deleteTitle} body={t.deleteBody} confirmLabel={t.deleteSet} onClose={() => setConfirm(false)} onConfirm={() => run(async () => { await actions.deleteFlashcardSet(set.id); router.push("/dashboard?tab=flashcards"); })} />}
    </div>
  );
}

function EditCards({ setId, title, cards, visibility, teamId, onError, onSaved }: { setId: string; title: string; description: string; cards: Flashcard[]; visibility: Visibility; teamId?: string; onError: (m: string) => void; onSaved: () => void }) {
  const t = useCopy(copy);
  const actions = useLearnActions();
  const [draftTitle, setTitle] = useState(title);
  const [draftCards, setCards] = useState(() => cards.length ? cards : [{ id: newId("card"), front: "", back: "" }]);
  // "team:<id>" is team-only: published for members of that Business team.
  const [draftVisibility, setVisibility] = useState<string>(teamId ? `team:${teamId}` : visibility);
  const { isAuthenticated } = useConvexAuth();
  const teams = useQuery(api.businessTeams.list, isAuthenticated ? {} : "skip");
  const [pending, setPending] = useState(false);
  const move = (i: number, d: number) => { const next = [...draftCards]; [next[i], next[i+d]] = [next[i+d],next[i]]; setCards(next); };
  return <form className="ws-page ws-flashcard-form" onSubmit={async e => {
    e.preventDefault(); if (pending) return;
    setPending(true); onError("");
    try { await actions.updateFlashcardSet(setId, { title: draftTitle, cards: draftCards, ...(draftVisibility.startsWith("team:") ? { teamId: draftVisibility.slice(5) } : { visibility: draftVisibility as Visibility }) }); onSaved(); }
    catch (err) { onError(errorMessage(err)); }
    finally { setPending(false); }
  }}><fieldset disabled={pending} style={{ border: 0, padding: 0, display: "grid", gap: 16 }}>
    <label className="lx-field">{t.title}<input className="kb-input" value={draftTitle} maxLength={160} onChange={e => setTitle(e.target.value)} /></label>
    <label className="lx-field">{t.visibility}<Select label={t.visibility} value={draftVisibility} onChange={setVisibility} options={[{ value: "private", label: t.vis.private }, ...(teams ?? []).map(row => ({ value: `team:${row.team._id}`, label: t.teamOnly(row.team.name) })), { value: "public", label: t.vis.public }]} /></label>
    <div className="lx-cards-edit">{draftCards.map((c,i) => <div key={c.id} className="lx-cards-edit__row">
      <span className="lx-muted">{i+1}</span>
      <FocusTextarea className="kb-input ws-flashcard-text" value={c.front} aria-label={t.front} placeholder={t.front} focusOnMount={i === 0 && cards.length === 0} maxLength={1000} onChange={e => setCards(draftCards.map(x => x.id === c.id ? {...x,front:e.target.value} : x))} />
      <textarea className="kb-input ws-flashcard-text" value={c.back} aria-label={t.back2} placeholder={t.back2} maxLength={2000} onChange={e => setCards(draftCards.map(x => x.id === c.id ? {...x,back:e.target.value} : x))} />
      <span><button type="button" className="ws-icon-button" disabled={i===0} aria-label={t.up} onClick={() => move(i,-1)}><ArrowUp size={13} /></button><button type="button" className="ws-icon-button" disabled={i===draftCards.length-1} aria-label={t.down} onClick={() => move(i,1)}><ArrowDown size={13} /></button><button type="button" className="ws-icon-button" aria-label={t.remove} onClick={() => setCards(draftCards.filter(x=>x.id!==c.id))}><Trash2 size={13} /></button></span>
    </div>)}</div>
    <button type="button" className="ws-btn" onClick={() => setCards([...draftCards,{id:newId("card"),front:"",back:""}])}><Plus size={15} />{t.add}</button>
    <button type="submit" className="ws-btn ws-btn--primary" disabled={!draftTitle.trim() || draftCards.some(c => !c.front.trim() || !c.back.trim())}>{draftVisibility === "public" || draftVisibility.startsWith("team:") ? t.publish : t.save}</button>
  </fieldset></form>;
}

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <Suspense fallback={null}><FlashcardSetPage key={id} /></Suspense>;
}
