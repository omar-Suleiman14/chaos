"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowDown, ArrowUp, Layers, Plus, Target, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Select } from "@/components/workspace/Select";
import { useLessonFlashcards } from "@/lib/learn/data";
import type { AttachedQuiz, QuizKind } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    lead: "Attach existing Chaos quizzes. Readers find them under Practice; published quizzes can also be hosted as Live games.",
    attach: "Attach a quiz", none: "You have no quizzes yet.", create: "Create a quiz", unpublished: "not published yet (readers can’t open it)",
    kind: "Kind", label: "Label (optional)", labelPh: "e.g. Portal hypertension MCQs",
    kinds: { quick_review: "Quick review", hard: "Hard questions", past_exam: "Past exam style", custom: "Other" } as Record<QuizKind, string>,
    up: "Move up", down: "Move down", remove: "Detach", cards: "Flashcards", newCards: "Make flashcards", cardsCount: (n: number) => `${n} cards`,
  },
  ar: {
    lead: "أرفق اختبارات Chaos الموجودة. يجدها القرّاء في «التدريب»، ويمكن استضافة الاختبارات المنشورة كألعاب مباشرة.",
    attach: "أرفق اختبارًا", none: "لا اختبارات لديك بعد.", create: "أنشئ اختبارًا", unpublished: "غير منشور بعد (لا يستطيع القرّاء فتحه)",
    kind: "النوع", label: "التسمية (اختياري)", labelPh: "مثل: أسئلة ارتفاع ضغط الوريد البابي",
    kinds: { quick_review: "مراجعة سريعة", hard: "أسئلة صعبة", past_exam: "بنمط الامتحانات السابقة", custom: "أخرى" } as Record<QuizKind, string>,
    up: "لأعلى", down: "لأسفل", remove: "افصل", cards: "البطاقات", newCards: "أنشئ بطاقات", cardsCount: (n: number) => `${n} بطاقة`,
  },
};

export default function PracticePanel({ lessonId, quizzes, onChange, onCreateCards }: { lessonId: string; quizzes: AttachedQuiz[]; onChange: (quizzes: AttachedQuiz[]) => void; onCreateCards: () => void }) {
  const t = useCopy(copy);
  const forms = useQuery(api.forms.listMyForms);
  const decks = useLessonFlashcards(lessonId) ?? [];
  const mine = [...(forms?.owned ?? []), ...(forms?.shared ?? [])].filter((f) => f.quizMode && f.status !== "archived");
  const attached = new Set(quizzes.map((q) => q.formId));
  const byId = new Map(mine.map((f) => [f._id as string, f]));
  const move = (i: number, d: number) => { const next = [...quizzes]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next); };

  return (
    <div className="lx-form">
      <p className="lx-help" style={{ fontSize: 13 }}>{t.lead}</p>
      {quizzes.map((q, i) => {
        const form = byId.get(q.formId);
        return (
          <div key={q.formId} className="lx-panel" style={{ gap: 8, padding: 10 }}>
            <div className="lx-panel__row">
              <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}><Target size={14} aria-hidden /><strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form?.title ?? q.title}</strong></span>
              <span style={{ display: "flex" }}>
                <button type="button" className="ws-icon-button" disabled={i === 0} aria-label={t.up} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
                <button type="button" className="ws-icon-button" disabled={i === quizzes.length - 1} aria-label={t.down} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
                <button type="button" className="ws-icon-button" aria-label={t.remove} onClick={() => onChange(quizzes.filter((x) => x.formId !== q.formId))}><X size={13} /></button>
              </span>
            </div>
            {form && form.publishedVersion === undefined && <small className="lx-muted" style={{ color: "var(--ws-warning)" }}>{t.unpublished}</small>}
            <Select label={t.kind} value={q.kind} onChange={(v) => onChange(quizzes.map((x) => x.formId === q.formId ? { ...x, kind: v as QuizKind } : x))} options={(Object.keys(t.kinds) as QuizKind[]).map((k) => ({ value: k, label: t.kinds[k] }))} />
            <input className="lx-input" value={q.label} placeholder={t.labelPh} aria-label={t.label} maxLength={80} onChange={(e) => onChange(quizzes.map((x) => x.formId === q.formId ? { ...x, label: e.target.value } : x))} />
          </div>
        );
      })}
      {forms && (mine.length ? (
        <Select label={t.attach} placeholder={t.attach} value={"" as string} onChange={(id) => {
          const f = byId.get(id);
          if (f) onChange([...quizzes, { formId: f._id, shareId: f.shareId, title: f.title, label: "", kind: quizzes.length ? "hard" : "quick_review", order: quizzes.length, questionCount: f.fieldCount }]);
        }} options={mine.filter((f) => !attached.has(f._id)).map((f) => ({ value: f._id, label: f.title || "Untitled quiz", description: f.publishedVersion === undefined ? t.unpublished : undefined }))} />
      ) : <p className="lx-muted">{t.none} <Link className="lx-link" href="/dashboard/games">{t.create}</Link></p>)}
      <hr className="lx-divider" />
      <div className="lx-panel__row"><strong style={{ display: "flex", gap: 6, alignItems: "center" }}><Layers size={14} aria-hidden />{t.cards}</strong><button type="button" className="ws-btn ws-btn--sm" onClick={onCreateCards}><Plus size={14} aria-hidden />{t.newCards}</button></div>
      {decks.map((d) => <Link key={d.id} className="lx-row" href={`/dashboard/learn/flashcards/${d.id}`}><span className="lx-row__main"><span className="lx-row__title">{d.title}</span><span className="lx-row__sub">{t.cardsCount(d.cards.length)}</span></span></Link>)}
    </div>
  );
}
