"use client";

import { ChaosSelect } from "@/components/workspace/ChaosSelect";
import { useId, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCopy, useLocale } from "@/lib/i18n";
import { errorMessage } from "@/lib/errors";
import Link from "@/components/site/SiteLink";

const copy = {
  en: { attach: "Attach existing", create: "Create new", title: "Deck title", front: "Question", back: "Answer", add: "Add card", remove: "Remove card", save: "Create deck", cancel: "Cancel", choose: "Choose a flashcard set", more: "Load more", loading: "Loading decks…", draft: "Draft", publish: "Publish deck for learners", public: "Published for learners", edit: "Edit deck", count: (n: number) => `${n} cards`, empty: "No flashcard sets yet.", note: "Create a deck, then publish it when it is ready. Lesson publication stays separate." },
  ar: { attach: "أرفق مجموعة موجودة", create: "أنشئ مجموعة", title: "عنوان المجموعة", front: "السؤال", back: "الإجابة", add: "أضف بطاقة", remove: "احذف البطاقة", save: "أنشئ المجموعة", cancel: "إلغاء", choose: "اختر مجموعة بطاقات", more: "حمّل المزيد", loading: "جارٍ تحميل المجموعات…", draft: "مسودة", publish: "انشر المجموعة للمتعلمين", public: "منشورة للمتعلمين", edit: "عدّل المجموعة", count: (n: number) => `${n} بطاقة`, empty: "لا مجموعات بطاقات بعد.", note: "أنشئ مجموعة ثم انشرها عندما تكون جاهزة. يبقى نشر الدرس مستقلًا." },
};

export default function FlashcardBlockEditor({ setId, onSelect }: { setId: string; onSelect: (id: string) => void }) {
  const { locale } = useLocale();
  const t = useCopy(copy);
  const uid = useId();
  const page = usePaginatedQuery(api.learnLibrary.flashcards, {}, { initialNumItems: 20 });
  const deck = useQuery(api.learnLibrary.flashcard, setId ? { id: setId } : "skip");
  const create = useMutation(api.flashcards.create);
  const publish = useMutation(api.flashcards.publish);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [cards, setCards] = useState([{ id: "card_1", front: "", back: "", conceptIds: [] as string[] }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choices = page.results.filter(d => !d.archived);
  const valid = !!title.trim() && cards.length > 0 && cards.every(c => c.front.trim() && c.back.trim());
  return <div className="lx-form lx-flashcard-editor" onKeyDown={e => e.stopPropagation()}>
    <p className="lx-help">{locale === "ar" ? "إرفاق المادة يحتفظ بالأصل وسجل التعلّم؛ لا ينشئ نسخة." : "Attach the original asset to keep one source and learning history. No copy is created."}</p>
    {error && <p className="lx-error" role="alert">{error}</p>}
    <label htmlFor={`${uid}-deck`}>{t.attach}</label>
    <ChaosSelect id={`${uid}-deck`} value={setId} disabled={busy} onChange={e => { onSelect(e.target.value); setError(""); }}>
      <option value="">{t.choose}</option>
      {setId && !choices.some(d => d._id === setId) && <option value={setId}>{deck?.title || t.loading}</option>}
      {choices.map(d => <option key={d._id} value={d._id}>{d.title}{!d.publishedVersionId || d.visibility !== "public" ? ` · ${t.draft}` : ""}</option>)}
    </ChaosSelect>
    {page.status === "LoadingFirstPage" && <p role="status">{t.loading}</p>}
    {page.status === "Exhausted" && !choices.length && <p className="lx-muted">{t.empty}</p>}
    {(page.status === "CanLoadMore" || page.status === "LoadingMore") && <button type="button" className="ws-btn ws-btn--sm" disabled={page.status === "LoadingMore"} onClick={() => page.loadMore(20)}>{t.more}</button>}
    {deck && <div className="lx-actions"><span className="lx-muted">{t.count(deck.cards.length)}</span><Link className="lx-link" href={`/dashboard/learn/flashcards/${deck._id}`}>{t.edit}</Link>
      {deck.publishedVersionId && deck.visibility === "public" ? <span className="lx-badge" data-tone="green">{t.public}</span> : <button type="button" className="ws-btn ws-btn--sm" disabled={busy || !deck.cards.length} onClick={async () => {
        setBusy(true); setError("");
        try { await publish({ setId: deck._id, expectedRevision: deck.revision, visibility: "public" }); }
        catch (err) { setError(errorMessage(err)); }
        finally { setBusy(false); }
      }}>{t.publish}</button>}
    </div>}
    {!creating ? <button type="button" className="ws-btn ws-btn--sm" disabled={busy} onClick={() => setCreating(true)}>{t.create}</button> : <>
      <p className="lx-help">{t.note}</p>
      <label htmlFor={`${uid}-title`}>{t.title}</label><input id={`${uid}-title`} maxLength={200} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} />
      {cards.map((card, i) => <fieldset key={card.id} className="lx-panel">
        <legend>{i + 1}</legend>
        <label htmlFor={`${uid}-${card.id}-front`}>{t.front}</label><input id={`${uid}-${card.id}-front`} maxLength={2000} value={card.front} disabled={busy} onChange={e => setCards(rows => rows.map(c => c.id === card.id ? { ...c, front: e.target.value } : c))} />
        <label htmlFor={`${uid}-${card.id}-back`}>{t.back}</label><textarea id={`${uid}-${card.id}-back`} maxLength={4000} value={card.back} disabled={busy} onChange={e => setCards(rows => rows.map(c => c.id === card.id ? { ...c, back: e.target.value } : c))} />
        <button type="button" className="lx-link" disabled={busy || cards.length === 1} onClick={() => setCards(rows => rows.filter(c => c.id !== card.id))}>{t.remove}</button>
      </fieldset>)}
      <div className="lx-actions"><button type="button" className="ws-btn ws-btn--sm" disabled={busy || cards.length >= 500} onClick={() => setCards(rows => [...rows, { id: crypto.randomUUID().replaceAll("-", "_"), front: "", back: "", conceptIds: [] }])}>{t.add}</button>
        <button type="button" className="ws-btn ws-btn--primary" disabled={busy || !valid} onClick={async () => {
          setBusy(true); setError("");
          try { const id = await create({ title: title.trim(), cards: cards.map(c => ({ ...c, front: c.front.trim(), back: c.back.trim() })) }); onSelect(id); setCreating(false); setTitle(""); setCards([{ id: "card_1", front: "", back: "", conceptIds: [] }]); }
          catch (err) { setError(errorMessage(err)); }
          finally { setBusy(false); }
        }}>{t.save}</button><button type="button" className="lx-link" disabled={busy} onClick={() => setCreating(false)}>{t.cancel}</button></div>
    </>}
  </div>;
}
