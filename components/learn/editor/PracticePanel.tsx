"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { ArrowDown, ArrowUp, Layers, Plus, Target, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Select } from "@/components/workspace/Select";
import { useLessonFlashcards } from "@/lib/learn/data";
import { studyReads } from "@/lib/learn/studyClient";
import type { AttachedQuiz, QuizKind } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    lead: "Attach existing Chaos quizzes. Readers find them under Practice; published quizzes can also be hosted as Live games.",
    attach: "Attach a quiz", none: "You have no quizzes yet.", create: "Create a quiz", unpublished: "not published yet (readers can’t open it)",
    kind: "Kind", label: "Label (optional)", labelPh: "e.g. Portal hypertension MCQs",
    kinds: { quick_review: "Quick review", hard: "Hard questions", past_exam: "Past exam style", custom: "Other" } as Record<QuizKind, string>,
    up: "Move up", down: "Move down", remove: "Detach", cards: "Flashcards", newCards: "Make flashcards", cardsCount: (n: number) => `${n} cards`,
    save: "Save label", loading: "Loading practice…",
  },
  ar: {
    lead: "أرفق اختبارات Chaos الموجودة. يجدها القرّاء في «التدريب»، ويمكن استضافة الاختبارات المنشورة كألعاب مباشرة.",
    attach: "أرفق اختبارًا", none: "لا اختبارات لديك بعد.", create: "أنشئ اختبارًا", unpublished: "غير منشور بعد (لا يستطيع القرّاء فتحه)",
    kind: "النوع", label: "التسمية (اختياري)", labelPh: "مثل: أسئلة ارتفاع ضغط الوريد البابي",
    kinds: { quick_review: "مراجعة سريعة", hard: "أسئلة صعبة", past_exam: "بنمط الامتحانات السابقة", custom: "أخرى" } as Record<QuizKind, string>,
    up: "لأعلى", down: "لأسفل", remove: "افصل", cards: "البطاقات", newCards: "أنشئ بطاقات", cardsCount: (n: number) => `${n} بطاقة`,
    save: "احفظ التسمية", loading: "جارٍ تحميل التدريب…",
  },
};

export default function PracticePanel({ lessonId, onCreateCards }: { lessonId: string; quizzes: AttachedQuiz[]; onChange: (quizzes: AttachedQuiz[]) => void; onCreateCards: () => void }) {
  const t = useCopy(copy);
  const forms = useQuery(api.forms.listMyForms);
  const relationships = useQuery(api.learnCollections.listAssessments, { lessonId: lessonId as Id<"lessons"> });
  const save = useMutation(studyReads.saveFormAttachments);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [labels, setLabels] = useState<Record<string, string>>({});
  const decks = useLessonFlashcards(lessonId) ?? [];
  const mine = (forms?.owned ?? []).filter((f) => f.quizMode && f.status !== "archived");
  const quizzes: AttachedQuiz[] = (relationships ?? []).filter(row => row.asset.kind === "form").map(row => {
    const form = mine.find(f => f._id === row.asset.id);
    return { formId: row.asset.id, title: form?.title ?? row.label, shareId: form?.shareId ?? "", label: row.label, order: row.order, kind: "custom", questionCount: form?.fieldCount ?? 0 };
  });
  const attached = new Set(quizzes.map((q) => q.formId));
  const byId = new Map(mine.map((f) => [f._id as string, f]));
  const change = async (next: AttachedQuiz[]) => {
    if (busy || relationships === undefined) return;
    setBusy(true); setError("");
    const classicCount = relationships.filter(row => row.asset.kind === "quiz").length;
    try {
      await save({ lessonId: lessonId as Id<"lessons">, expected: quizzes.map(q => ({ id: q.formId as Id<"forms">, label: q.label, order: q.order })), attachments: next.map((q, i) => ({ id: q.formId as Id<"forms">, label: q.label.trim() || q.title.trim() || "Practice", order: classicCount + i })) });
      setLabels(values => Object.fromEntries(Object.entries(values).filter(([id, label]) => next.find(q => q.formId === id)?.label !== label)));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save practice."); }
    finally { setBusy(false); }
  };
  const move = (i: number, d: number) => { const next = [...quizzes]; [next[i], next[i + d]] = [next[i + d], next[i]]; change(next); };

  return (
    <div className="lx-form">
      <p className="lx-help" style={{ fontSize: 13 }}>{t.lead}</p>
      {error && <p className="lx-error" role="alert">{error}</p>}
      {relationships === undefined && <p className="lx-muted" role="status">{t.loading}</p>}
      {quizzes.map((q, i) => {
        const form = byId.get(q.formId);
        return (
          <div key={q.formId} className="lx-panel" style={{ gap: 8, padding: 10 }}>
            <div className="lx-panel__row">
              <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}><Target size={14} aria-hidden /><strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form?.title ?? q.title}</strong></span>
              <span style={{ display: "flex" }}>
                <button type="button" className="ws-icon-button" disabled={busy || i === 0} aria-label={t.up} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
                <button type="button" className="ws-icon-button" disabled={busy || i === quizzes.length - 1} aria-label={t.down} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
                <button type="button" className="ws-icon-button" disabled={busy} aria-label={t.remove} onClick={() => change(quizzes.filter((x) => x.formId !== q.formId))}><X size={13} /></button>
              </span>
            </div>
            {form && form.publishedVersion === undefined && <small className="lx-muted" style={{ color: "var(--ws-warning)" }}>{t.unpublished}</small>}
            <input className="lx-input" value={labels[q.formId] ?? q.label} placeholder={t.labelPh} aria-label={t.label} disabled={busy} maxLength={80} onChange={(e) => setLabels(values => ({ ...values, [q.formId]: e.target.value }))} />
            <button type="button" className="ws-btn ws-btn--sm" disabled={busy || labels[q.formId] === undefined || labels[q.formId] === q.label} onClick={() => change(quizzes.map(x => x.formId === q.formId ? { ...x, label: labels[q.formId] ?? q.label } : x))}>{t.save}</button>
          </div>
        );
      })}
      {forms && (mine.length ? (
        <Select label={t.attach} placeholder={t.attach} disabled={busy || relationships === undefined} value={"" as string} onChange={(id) => {
          const f = byId.get(id);
          if (f) void change([...quizzes, { formId: f._id, shareId: f.shareId, title: f.title, label: f.title || "Practice", kind: "custom", order: quizzes.length, questionCount: f.fieldCount }]);
        }} options={mine.filter((f) => !attached.has(f._id)).map((f) => ({ value: f._id, label: f.title || "Untitled quiz", description: f.publishedVersion === undefined ? t.unpublished : undefined }))} />
      ) : <p className="lx-muted">{t.none} <Link className="lx-link" href="/dashboard?tab=games">{t.create}</Link></p>)}
      <hr className="lx-divider" />
      <div className="lx-panel__row"><strong style={{ display: "flex", gap: 6, alignItems: "center" }}><Layers size={14} aria-hidden />{t.cards}</strong><button type="button" className="ws-btn ws-btn--sm" onClick={onCreateCards}><Plus size={14} aria-hidden />{t.newCards}</button></div>
      {decks.map((d) => <Link key={d.id} className="lx-row" href={`/dashboard/learn/flashcards/${d.id}`}><span className="lx-row__main"><span className="lx-row__title">{d.title}</span><span className="lx-row__sub">{t.cardsCount(d.cards.length)}</span></span></Link>)}
    </div>
  );
}
