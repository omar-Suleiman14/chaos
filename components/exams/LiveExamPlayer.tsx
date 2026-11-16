"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/lib/auth/client";
import { useExamAnswerAutosave } from "./useExamAnswerAutosave";
import { useExamIntegrityTelemetry } from "./useExamIntegrityTelemetry";
import { togglePreviewChoice } from "./exam-player-model";

const copy = {
  en: { question: "Question", previous: "Previous", next: "Next", time: "Time remaining",
    save: "Save for later", flag: "Flag for review", status: "Answer status", retry: "Retry save",
    discard: "Discard local changes", pending: "Wait for your answer to save before continuing.",
    submit: "Review submission", confirm: "Confirm submission", cancel: "Continue exam",
    unanswered: "Unanswered questions", failed: "Could not complete that action. Try again.",
    completed: "Your attempt has closed.", results: "View results", loading: "Loading exam…",
    choose: "Choose your answer", write: "Write your answer", image: "Case image", true: "True", false: "False",
    saved: "Saved", pendingSave: "Waiting to save", saving: "Saving", offline: "Offline", conflict: "Conflict", error: "Save failed",
    integrityWarning: "A browser interruption was recorded. It does not determine misconduct or change your grade.",
    integrityReview: "A browser interruption was flagged for human review. It does not determine misconduct or change your grade." },
  ar: { question: "السؤال", previous: "السابق", next: "التالي", time: "الوقت المتبقي",
    save: "حفظ للمراجعة", flag: "تحديد للمراجعة", status: "حالة الإجابة", retry: "إعادة الحفظ",
    discard: "حذف التغييرات المحلية", pending: "انتظر حتى تُحفظ إجابتك قبل المتابعة.",
    submit: "مراجعة التسليم", confirm: "تأكيد التسليم", cancel: "متابعة الامتحان",
    unanswered: "الأسئلة غير المجابة", failed: "تعذر إكمال العملية. حاول مرة أخرى.",
    completed: "انتهت محاولتك.", results: "عرض النتائج", loading: "جارٍ تحميل الامتحان…",
    choose: "اختر إجابتك", write: "اكتب إجابتك", image: "صورة الحالة", true: "صحيح", false: "خطأ",
    saved: "تم الحفظ", pendingSave: "بانتظار الحفظ", saving: "جارٍ الحفظ", offline: "غير متصل", conflict: "تعارض", error: "تعذر الحفظ",
    integrityWarning: "سُجل انقطاع في المتصفح. لا يحدد ذلك حدوث مخالفة ولا يغير درجتك.",
    integrityReview: "أُحيل انقطاع في المتصفح للمراجعة البشرية. لا يحدد ذلك حدوث مخالفة ولا يغير درجتك." },
} as const;
type Locale = keyof typeof copy;
type Question = { index: number; kind: "single_choice" | "multiple_choice" | "true_false" | "written";
  prompt: string; choices: { id: string; text: string }[];
  caseStudy: { stem: string; media: { mediaId: Id<"questionBankMedia">; alt: string }[] } | null };

function ExamImage({ attemptId, mediaId, alt }: { attemptId: Id<"examAttempts">; mediaId: Id<"questionBankMedia">; alt: string }) {
  const url = useQuery(api.examMedia.contentUrl, { attemptId, mediaId });
  const { getToken } = useAuth();
  const [src, setSrc] = useState<{ url: string; tokenProvider: typeof getToken; blobUrl: string } | null>(null);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController(); let objectUrl: string | null = null;
    void (async () => {
      try {
        const token = await getToken({ template: "convex", skipCache: true });
        if (!token) return;
        const response = await fetch(url, { headers: { Authorization: "Bearer " + token }, cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob); setSrc({ url, tokenProvider: getToken, blobUrl: objectUrl });
      } catch { /* An unavailable image retains its alternative text. */ }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, getToken]);
  return src && src.url === url && src.tokenProvider === getToken ? <Image src={src.blobUrl} alt={alt} width={960} height={640} unoptimized
    className="max-h-96 max-w-full object-contain" /> : <span>{alt}</span>;
}

function QuestionEditor({ attemptId, question, locale, onDirty }: {
  attemptId: Id<"examAttempts">; question: Question; locale: Locale; onDirty: (dirty: boolean) => void;
}) {
  const t = copy[locale];
  const autosave = useExamAnswerAutosave(attemptId, question.index);
  useEffect(() => { onDirty(autosave.hasUnsavedChanges || autosave.status === "loading"); }, [autosave.hasUnsavedChanges, autosave.status, onDirty]);
  const answer = autosave.answer;
  return <section className="cb-section grid gap-4">
    <p>{t.question} {question.index + 1}</p>
    {question.caseStudy && <div className="grid gap-3"><p className="whitespace-pre-wrap">{question.caseStudy.stem}</p>
      {question.caseStudy.media.map(m => <ExamImage key={m.mediaId} attemptId={attemptId} mediaId={m.mediaId} alt={m.alt} />)}</div>}
    <h2 className="text-lg font-semibold whitespace-pre-wrap" dir="auto">{question.prompt}</h2>
    {question.kind === "written" ? <label className="grid gap-2">{t.write}
      <textarea className="min-h-40 rounded border bg-background p-3" maxLength={4000} value={answer.text}
        onChange={e => autosave.change({ ...answer, text: e.target.value })} />
    </label> : <fieldset className="grid gap-3"><legend>{t.choose}</legend>
      {question.choices.map(choice => <label key={choice.id} className="flex items-start gap-3 rounded border p-3">
        <input type={question.kind === "multiple_choice" ? "checkbox" : "radio"} name={"question-" + question.index}
          checked={answer.choiceIds.includes(choice.id)} onChange={() => autosave.change({ ...answer,
            choiceIds: togglePreviewChoice(answer.choiceIds, choice.id, question.kind === "multiple_choice") })} />
        <span dir="auto">{question.kind === "true_false" ? t[choice.id === "true" ? "true" : "false"] : choice.text}</span>
      </label>)}
    </fieldset>}
    <div className="flex gap-4"><label><input type="checkbox" checked={answer.savedForLater}
      onChange={e => autosave.change({ ...answer, savedForLater: e.target.checked })} /> {t.save}</label>
      <label><input type="checkbox" checked={answer.flagged}
        onChange={e => autosave.change({ ...answer, flagged: e.target.checked })} /> {t.flag}</label></div>
    <p aria-live="polite">{t.status}: {t[autosave.status === "pending" ? "pendingSave" : autosave.status]}</p>
    {(autosave.status === "error" || autosave.status === "offline" || autosave.status === "conflict") && <div className="flex gap-2">
      <button type="button" className="ws-btn ws-btn--ghost" onClick={autosave.retry}>{t.retry}</button>
      <button type="button" className="ws-btn ws-btn--ghost" onClick={autosave.discardLocalDraft}>{t.discard}</button>
    </div>}
  </section>;
}

export function LiveExamPlayer({ attemptId, locale }: { attemptId: Id<"examAttempts">; locale: Locale }) {
  const t = copy[locale];
  const status = useQuery(api.examSubmissions.getStatus, { attemptId });
  const attempt = useQuery(api.examRuntime.getMyAttempt, { attemptId });
  const [position, setPosition] = useState(0);
  const [dirty, setDirty] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [clockOffset, setClockOffset] = useState(0);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{ id: string; revision: number; unanswered: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const prepare = useMutation(api.examSubmissions.prepareSubmission);
  const submit = useMutation(api.examSubmissions.submit);
  const expire = useMutation(api.examSubmissions.expireDue);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const serverNow = status?.serverNow;
  useEffect(() => { if (serverNow !== undefined) setClockOffset(serverNow - Date.now()); }, [serverNow]);
  const remaining = status ? Math.max(0, status.deadlineAt - (now + clockOffset)) : 0;
  const closed = !!status && (status.state !== "in_progress" || status.timedOut || remaining === 0);
  const integrity = useExamIntegrityTelemetry(attemptId, !!attempt && !closed &&
    attempt.state === "in_progress" && attempt.integrityMode !== "off", attempt?.telemetryConsented === true);
  useEffect(() => {
    if (status?.state === "in_progress" && remaining === 0) void expire({ attemptId }).catch(() => {});
  }, [attemptId, expire, remaining, status?.state]);
  const content = useQuery(api.examRuntime.getQuestions, status && !closed ? { attemptId } : "skip");
  if (!status || !attempt) return <p>{t.loading}</p>;
  if (closed) return <section className="cb-section grid gap-3"><p>{t.completed}</p><Link className="ws-btn ws-btn--ghost w-fit" href="/dashboard/learn/exams/results">{t.results}</Link></section>;
  if (!content) return <p>{t.loading}</p>;
  const question = content.questions[position];
  if (!question) return <p>{t.failed}</p>;
  const seconds = Math.ceil(remaining / 1000), clock = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  return <div className="grid gap-4" dir={locale === "ar" ? "rtl" : "ltr"}>
    <header className="cb-section"><h1 className="text-xl font-semibold">{content.title}</h1><p aria-live="polite">{t.time}: {clock}</p></header>
    {integrity.notice && <p role="alert">{integrity.notice === "warning" ? t.integrityWarning : t.integrityReview}</p>}
    <QuestionEditor key={question.index} attemptId={attemptId} question={question} locale={locale} onDirty={setDirty} />
    {dirty && <output>{t.pending}</output>}
    <nav className="flex flex-wrap gap-2" aria-label={t.question}>
      {content.questions.map(q => <button type="button" key={q.index} className="ws-btn ws-btn--ghost ws-btn--sm"
        aria-current={q.index === position ? "step" : undefined} disabled={dirty || busy} onClick={() => { setDirty(true); setPosition(q.index); }}>{q.index + 1}</button>)}
    </nav>
    <div className="flex gap-2"><button type="button" className="ws-btn ws-btn--ghost" disabled={dirty || position === 0}
      onClick={() => { setDirty(true); setPosition(position - 1); }}>{t.previous}</button>
      <button type="button" className="ws-btn ws-btn--ghost" disabled={dirty || position === content.questions.length - 1}
        onClick={() => { setDirty(true); setPosition(position + 1); }}>{t.next}</button></div>
    {error && <p role="alert">{error}</p>}
    {confirmation ? <section className="cb-section grid gap-2"><p>{t.unanswered}: {confirmation.unanswered}</p>
      <div className="flex gap-2"><button type="button" className="ws-btn ws-btn--primary" disabled={busy || dirty} onClick={() => {
        setBusy(true); void submit({ attemptId, confirmationId: confirmation.id, expectedRevision: confirmation.revision, confirmed: true })
          .catch(() => { setError(t.failed); setConfirmation(null); }).finally(() => setBusy(false));
      }}>{t.confirm}</button><button type="button" className="ws-btn ws-btn--ghost" onClick={() => setConfirmation(null)}>{t.cancel}</button></div>
    </section> : <button type="button" className="ws-btn ws-btn--primary w-fit" disabled={dirty || busy || !status.allowEarlySubmission || now + clockOffset < status.minimumSubmitAt ||
      (status.requireAllAnswers && status.answeredCount < status.questionCount)} onClick={() => {
      setBusy(true); setError(""); void prepare({ attemptId, expectedRevision: attempt.revision })
        .then(value => setConfirmation({ id: value.confirmationId, revision: value.expectedRevision, unanswered: value.unansweredCount }))
        .catch(() => setError(t.failed)).finally(() => setBusy(false));
    }}>{t.submit}</button>}
  </div>;
}
