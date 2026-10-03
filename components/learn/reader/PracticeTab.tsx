"use client";

import InlineQuiz from "./InlineQuiz";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GitFork, Layers, PenLine, Radio, Target } from "lucide-react";
import { useHostLive } from "@/components/live/HostLiveButton";
import { useLessonFlashcards } from "@/lib/learn/data";
import { useStudyActions, useStudyCapabilities } from "@/lib/learn/studyClient";
import type { AttachedQuiz, Lesson, QuizKind } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";
import { useState } from "react";
import FlashcardStudy from "../study/FlashcardStudy";

const copy = {
  en: {
    title: "Practice", lead: "Quizzes and flashcards for this lesson.", empty: "No practice attached yet.", emptyOwner: "Attach existing Chaos quizzes from the lesson editor’s Practice panel.",
    kinds: { quick_review: "Quick review", hard: "Hard questions", past_exam: "Past exam style", custom: "Practice" } as Record<QuizKind, string>,
    take: "Start", host: "Host live", edit: "Edit quiz", copyQuiz: "Copy to my library", questions: (n: number) => `${n} questions`,
    cards: "Flashcards", cardsCount: (n: number) => `${n} cards`, study: "Study",
    liveHelp: "Host live runs this quiz as a Chaos Live game: players join at /play with a PIN.",
    forkHelp: "Copies go to your library as drafts and keep a link back to this quiz.",
  },
  ar: {
    title: "التدريب", lead: "اختبارات وبطاقات لهذا الدرس.", empty: "لا تدريب مرفق بعد.", emptyOwner: "أرفق اختبارات Chaos الموجودة من لوحة التدريب في محرر الدرس.",
    kinds: { quick_review: "مراجعة سريعة", hard: "أسئلة صعبة", past_exam: "بنمط الامتحانات السابقة", custom: "تدريب" } as Record<QuizKind, string>,
    take: "ابدأ", host: "استضف مباشرة", edit: "عدّل الاختبار", copyQuiz: "انسخ إلى مكتبتي", questions: (n: number) => `${n} سؤال`,
    cards: "البطاقات", cardsCount: (n: number) => `${n} بطاقة`, study: "ادرس",
    liveHelp: "«استضف مباشرة» يشغّل هذا الاختبار كلعبة Chaos Live: ينضم اللاعبون عبر /play برمز.",
    forkHelp: "تذهب النسخ إلى مكتبتك كمسودات وتحتفظ برابط إلى هذا الاختبار.",
  },
};

export const quizKindLabel = (t: (typeof copy)["en"], quiz: AttachedQuiz) => quiz.label.trim() || t.kinds[quiz.kind];
export const usePracticeCopy = () => useCopy(copy);

export default function PracticeTab({ lesson, isOwner }: { lesson: Lesson; isOwner: boolean; onForkQuiz?: (quiz: AttachedQuiz) => void }) {
  const t = useCopy(copy);
  const host = useHostLive();
  const router = useRouter();
  const study = useStudyActions();
  const capabilities = useStudyCapabilities();
  const [copying, setCopying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [studyingSet, setStudyingSet] = useState<string | null>(null);
  const decks = useLessonFlashcards(lesson.id) ?? [];
  // Owners can host live and edit only quizzes they still own or edit.
  const mine = useQuery(api.forms.listMyForms, isOwner ? {} : "skip");
  const editable = new Set([...(mine?.owned ?? []), ...(mine?.shared ?? []).filter((f) => f.role === "editor")].map((f) => f._id as string));
  const attachments = useQuery(api.learnFrontend.attachedQuizzes, { lessonId: lesson.id as Id<"lessons"> });
  const quizzes = (attachments === undefined ? lesson.quizzes : (attachments ?? []).filter(q => q.kind === "form").map((q, order) => {
    const prior = lesson.quizzes.find(x => x.formId === q.id);
    return { formId: q.id, shareId: q.shareId ?? "", title: q.title, label: prior?.label ?? "", kind: prior?.kind ?? "custom" as QuizKind, order, questionCount: q.questionCount };
  })).sort((a, b) => a.order - b.order);

  const classic = (attachments ?? []).filter(q => q.kind === "quiz");
  if (attachments === undefined && !quizzes.length && !decks.length) return <p className="lx-muted" role="status">{t.lead}</p>;
  if (!quizzes.length && !classic.length && !decks.length) {
    return <div className="lx-empty"><Target size={26} aria-hidden /><h3>{t.empty}</h3>{isOwner && <p>{t.emptyOwner}</p>}</div>;
  }
  return (
    <div className="lx-practice">
      <p className="lx-help">{t.lead}</p>
      {error && <p className="lx-error" role="alert">{error}</p>}
      {quizzes.map((quiz) => (
        <article key={quiz.formId} className="lx-quiz-card">
          <span className="lx-row__icon" data-kind="quiz" aria-hidden><Target size={16} /></span>
          <div className="lx-quiz-card__main">
            <span className="lx-badge" data-tone="purple" style={{ justifySelf: "start" }}>{t.kinds[quiz.kind]}</span>
            <strong>{quizKindLabel(t, quiz)}</strong>
            <span className="lx-muted">{quiz.title}{quiz.questionCount ? ` · ${t.questions(quiz.questionCount)}` : ""}</span>
          </div>
          <div className="lx-actions">
            {isOwner && editable.has(quiz.formId) && (
              <>
                <Link className="ws-btn ws-btn--sm ws-btn--ghost" href={`/dashboard/forms/${quiz.formId}`}><PenLine size={14} aria-hidden />{t.edit}</Link>
                <button type="button" className="ws-btn ws-btn--sm" disabled={host.busy} title={t.liveHelp}
                  onClick={async () => { setError(""); const message = await host.start({ formId: quiz.formId as Id<"forms"> }); if (message) setError(message); }}>
                  <Radio size={14} aria-hidden />{host.label}
                </button>
              </>
            )}
            <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" title={t.forkHelp} disabled={!capabilities.quizForks || copying !== null} onClick={async () => {
              setError(""); setCopying(quiz.formId);
              try { const id = await study.forkQuiz(quiz.formId); router.push(`/dashboard/forms/${encodeURIComponent(id)}`); }
              catch (err) { setError(err instanceof Error ? err.message : "Could not copy quiz."); }
              finally { setCopying(null); }
            }}><GitFork size={14} aria-hidden />{t.copyQuiz}</button>
          </div>
          <InlineQuiz asset={{kind:"form",id:quiz.formId}} shareId={quiz.shareId} title={quiz.title}/>
        </article>
      ))}
      {classic.map(quiz => <article key={quiz.id} className="lx-quiz-card">
        <span className="lx-row__icon" data-kind="quiz" aria-hidden><Target size={16} /></span>
        <div className="lx-quiz-card__main"><strong>{quiz.title}</strong><span className="lx-muted">{t.questions(quiz.questionCount)}</span></div>
        <div className="lx-actions">
          <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" title={t.forkHelp} disabled={!capabilities.quizForks || copying !== null} onClick={async () => {
            setError(""); setCopying(quiz.id);
            try { const result = await study.forkAssessment({ kind: "quiz", id: quiz.id as Id<"quizzes"> }); router.push(result.href); }
            catch (err) { setError(err instanceof Error ? err.message : "Could not copy quiz."); }
            finally { setCopying(null); }
          }}><GitFork size={14} aria-hidden />{t.copyQuiz}</button>
        </div>
        <InlineQuiz asset={{kind:"quiz",id:quiz.id}} title={quiz.title}/>
      </article>)}
      {decks.map((deck) => (
        <section key={deck.id}>
        <article className="lx-quiz-card">
          <span className="lx-row__icon" data-kind="flashcards" aria-hidden><Layers size={16} /></span>
          <div className="lx-quiz-card__main"><span className="lx-badge" data-tone="green" style={{ justifySelf: "start" }}>{t.cards}</span><strong>{deck.title}</strong><span className="lx-muted">{t.cardsCount(deck.cards.length)}</span></div>
          <button type="button" className="ws-btn ws-btn--sm ws-btn--primary" aria-expanded={studyingSet === deck.id} onClick={() => setStudyingSet(studyingSet === deck.id ? null : deck.id)}>{t.study}</button>
        </article>
        {studyingSet === deck.id && <FlashcardStudy setId={deck.id} />}
        </section>
      ))}
    </div>
  );
}
