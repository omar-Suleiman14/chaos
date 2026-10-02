"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers, Plus } from "lucide-react";
import { EmptyState } from "@/components/learn/ui";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { useFlashcardSets, useLearnActions } from "@/lib/learn/data";
import { useCopy, useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";

const copy = {
  en: {
    title: "Flashcards", lead: "Sets you study with spaced review. Make them from scratch or from a lesson’s headings.", create: "New set", untitled: "Untitled set",
    empty: "No flashcard sets", emptyBody: "Create a set, or open a lesson you wrote and choose Make flashcards from headings.",
    cards: (n: number) => `${n} ${n === 1 ? "card" : "cards"}`, loading: "Loading flashcards…", copied: "Copy",
  },
  ar: {
    title: "البطاقات", lead: "مجموعات تذاكرها بالمراجعة المتباعدة. أنشئها من الصفر أو من عناوين درس.", create: "مجموعة جديدة", untitled: "مجموعة بلا عنوان",
    empty: "لا مجموعات بطاقات", emptyBody: "أنشئ مجموعة، أو افتح درسًا كتبته واختر «أنشئ بطاقات من العناوين».",
    cards: (n: number) => `${n} بطاقة`, loading: "جارٍ تحميل البطاقات…", copied: "نسخة",
  },
};

export default function FlashcardsPage() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const router = useRouter();
  const sets = useFlashcardSets();
  const actions = useLearnActions();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (!sets) return <PageSkeleton label={t.loading} />;
  const create = async () => { setPending(true); setError(""); try { const id = await actions.createFlashcardSet({ title: t.untitled }); router.push(`/dashboard/learn/flashcards/${id}?mode=edit`); } catch (err) { setError(errorMessage(err)); } finally { setPending(false); } };
  return (
    <div className="lx-page">
      <header className="lx-hero">
        <div><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.lead}</p></div>
        <div className="lx-actions"><button type="button" className="ws-btn ws-btn--primary" disabled={pending} onClick={create}><Plus size={16} aria-hidden />{t.create}</button></div>
      </header>
      {error && <p className="lx-error" role="alert">{error}</p>}
      {!sets.length ? <EmptyState level={2} icon={Layers} title={t.empty} body={t.emptyBody}><button type="button" className="ws-btn" onClick={create}><Plus size={16} aria-hidden />{t.create}</button></EmptyState> : (
        <div className="lx-grid">
          {sets.map((s) => (
            <article key={s.id} className="lx-card">
              <span className="lx-card__meta"><Layers size={13} aria-hidden />{t.cards(s.cards.length)} · {timeAgo(locale, s.updatedAt)}{s.forkedFrom ? ` · ${t.copied}` : ""}</span>
              <h2><Link className="lx-card__link" href={`/dashboard/learn/flashcards/${s.id}`}>{s.title || t.untitled}</Link></h2>
              {s.description && <p>{s.description}</p>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
