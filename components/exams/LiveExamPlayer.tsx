"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Bookmark, Check, ChevronLeft, ChevronRight, Clock, CloudOff, Flag, Grid3x3, Loader2, Send, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/lib/auth/client";
import { useExamAnswerAutosave, type AutosaveState, type ExamDraft } from "./useExamAnswerAutosave";
import { useExamIntegrityTelemetry } from "./useExamIntegrityTelemetry";
import { togglePreviewChoice } from "./exam-player-model";
import "./exam-player.css";

const copy = {
  en: { question: "Question", of: "of", previous: "Previous", next: "Next", time: "Time remaining",
    save: "Save for later", unsave: "Saved for later", flag: "Flag for review", unflag: "Flagged", retry: "Retry save",
    discard: "Discard local changes", pending: "Saving your answers…",
    submit: "Review submission", confirm: "Confirm submission", cancel: "Back to exam",
    unanswered: "Unanswered questions", answeredLabel: "Answered", flaggedLabel: "Flagged", savedLabel: "Saved for later", notAnswered: "Not answered",
    failed: "Could not complete that action. Try again.",
    completed: "Your attempt has closed.", completedHelp: "Your saved answers were submitted. Results appear once your teacher releases them.", results: "View results", loading: "Loading exam…",
    choose: "Choose one answer", chooseMany: "Choose all that apply", write: "Write your answer", true: "True", false: "False",
    saved: "Saved", pendingSave: "Waiting to save", saving: "Saving…", offline: "Offline — answer kept on this device", conflict: "Changed in another tab", error: "Save failed", loadingSave: "Loading…",
    allSaved: "All answers saved", navigator: "Questions", openNavigator: "Show all questions", closeNavigator: "Hide questions",
    filterAll: "All", filterOpen: "Unanswered", filterFlagged: "Flagged", none: "Nothing here.",
    progress: (a: number, n: number) => `${a} of ${n} answered`, current: "Current",
    reviewTitle: "Ready to submit?", reviewHelp: "You can't change answers after submitting. Select a question to go back to it.",
    tooEarly: "Submission opens later in the exam.", needAll: "Answer every question before submitting.", noEarly: "This exam submits when time runs out.",
    lastQuestion: "That's the last question. Review your answers, then submit.",
    keyboard: "Tip: use ← and → to move between questions.",
    lowTime: (m: number) => m <= 1 ? "Less than a minute left" : `${m} minutes left`,
    integrityWarning: "A browser interruption was recorded. It does not determine misconduct or change your grade.",
    integrityReview: "A browser interruption was flagged for human review. It does not determine misconduct or change your grade." },
  ar: { question: "السؤال", of: "من", previous: "السابق", next: "التالي", time: "الوقت المتبقي",
    save: "حفظ للمراجعة", unsave: "محفوظ للمراجعة", flag: "تحديد للمراجعة", unflag: "محدد", retry: "إعادة الحفظ",
    discard: "حذف التغييرات المحلية", pending: "جارٍ حفظ إجاباتك…",
    submit: "مراجعة التسليم", confirm: "تأكيد التسليم", cancel: "العودة للامتحان",
    unanswered: "الأسئلة غير المجابة", answeredLabel: "مُجاب", flaggedLabel: "محدد", savedLabel: "محفوظ للمراجعة", notAnswered: "غير مُجاب",
    failed: "تعذر إكمال العملية. حاول مرة أخرى.",
    completed: "انتهت محاولتك.", completedHelp: "تم تسليم إجاباتك المحفوظة. تظهر النتائج عندما يعلنها المعلم.", results: "عرض النتائج", loading: "جارٍ تحميل الامتحان…",
    choose: "اختر إجابة واحدة", chooseMany: "اختر كل ما ينطبق", write: "اكتب إجابتك", true: "صحيح", false: "خطأ",
    saved: "تم الحفظ", pendingSave: "بانتظار الحفظ", saving: "جارٍ الحفظ…", offline: "غير متصل — الإجابة محفوظة على جهازك", conflict: "تغيّر في نافذة أخرى", error: "تعذر الحفظ", loadingSave: "جارٍ التحميل…",
    allSaved: "كل الإجابات محفوظة", navigator: "الأسئلة", openNavigator: "عرض كل الأسئلة", closeNavigator: "إخفاء الأسئلة",
    filterAll: "الكل", filterOpen: "غير مجاب", filterFlagged: "محدد", none: "لا شيء هنا.",
    progress: (a: number, n: number) => `${a} من ${n} مُجاب`, current: "الحالي",
    reviewTitle: "جاهز للتسليم؟", reviewHelp: "لا يمكن تغيير الإجابات بعد التسليم. اختر سؤالًا للعودة إليه.",
    tooEarly: "يُتاح التسليم لاحقًا خلال الامتحان.", needAll: "أجب عن كل الأسئلة قبل التسليم.", noEarly: "يُسلَّم هذا الامتحان عند انتهاء الوقت.",
    lastQuestion: "هذا آخر سؤال. راجع إجاباتك ثم سلّم.",
    keyboard: "تلميح: استخدم الأسهم للتنقل بين الأسئلة.",
    lowTime: (m: number) => m <= 1 ? "أقل من دقيقة متبقية" : `${m} دقائق متبقية`,
    integrityWarning: "سُجل انقطاع في المتصفح. لا يحدد ذلك حدوث مخالفة ولا يغير درجتك.",
    integrityReview: "أُحيل انقطاع في المتصفح للمراجعة البشرية. لا يحدد ذلك حدوث مخالفة ولا يغير درجتك." },
};
type Locale = keyof typeof copy;
type Copy = (typeof copy)[Locale];
type Question = { index: number; kind: "single_choice" | "multiple_choice" | "true_false" | "written";
  prompt: string; choices: { id: string; text: string }[];
  caseStudy: { stem: string; media: { mediaId: Id<"questionBankMedia">; alt: string }[] } | null };
type Local = { answer: ExamDraft; dirty: boolean; status: AutosaveState };
type Status = "answered" | "unanswered" | "flagged" | "saved";
type Filter = "all" | "open" | "flagged";
const LETTERS = "ABCDEFGHIJKL";

function isAnswered(question: Question, answer?: Pick<ExamDraft, "choiceIds" | "text">) {
  return question.kind === "written" ? !!answer?.text.trim() : !!answer?.choiceIds.length;
}
function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

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
    className="xp-image" /> : <span className="xp-image-alt">{alt}</span>;
}

/**
 * One question's editor and autosave. Visited questions stay mounted (hidden)
 * so an answer keeps saving in the background while the student moves on.
 */
function QuestionEditor({ attemptId, question, total, locale, active, onState }: {
  attemptId: Id<"examAttempts">; question: Question; total: number; locale: Locale; active: boolean;
  onState: (index: number, state: Local) => void;
}) {
  const t = copy[locale];
  const autosave = useExamAnswerAutosave(attemptId, question.index);
  const answer = autosave.answer;
  const dirty = autosave.hasUnsavedChanges || autosave.status === "loading";
  const signature = JSON.stringify(answer);
  useEffect(() => { onState(question.index, { answer, dirty, status: autosave.status }); },
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the answer is compared by value
    [signature, dirty, autosave.status, question.index, onState]);
  const multiple = question.kind === "multiple_choice";
  const headingId = `xp-q-${question.index}`;
  const statusLabel = autosave.status === "pending" ? t.pendingSave : autosave.status === "loading" ? t.loadingSave : t[autosave.status];

  return <section className="xp-card" hidden={!active} aria-labelledby={headingId}>
    <div className="xp-card__top">
      <span className="xp-qnum">{t.question} {question.index + 1} <span>{t.of} {total}</span></span>
      <div className="xp-markers">
        <button type="button" className="xp-marker" data-on={answer.savedForLater} aria-pressed={answer.savedForLater}
          onClick={() => autosave.change({ ...answer, savedForLater: !answer.savedForLater })}>
          <Bookmark size={15} aria-hidden="true" fill={answer.savedForLater ? "currentColor" : "none"} />{answer.savedForLater ? t.unsave : t.save}
        </button>
        <button type="button" className="xp-marker" data-tone="flag" data-on={answer.flagged} aria-pressed={answer.flagged}
          onClick={() => autosave.change({ ...answer, flagged: !answer.flagged })}>
          <Flag size={15} aria-hidden="true" fill={answer.flagged ? "currentColor" : "none"} />{answer.flagged ? t.unflag : t.flag}
        </button>
      </div>
    </div>
    {question.caseStudy && <div className="xp-case">
      {question.caseStudy.stem && <p dir="auto">{question.caseStudy.stem}</p>}
      {question.caseStudy.media.map(m => <ExamImage key={m.mediaId} attemptId={attemptId} mediaId={m.mediaId} alt={m.alt} />)}
    </div>}
    <h2 id={headingId} className="xp-prompt" dir="auto">{question.prompt}</h2>
    {question.kind === "written" ? <label className="xp-written"><span>{t.write}</span>
      <textarea maxLength={4000} value={answer.text} dir="auto"
        onChange={e => autosave.change({ ...answer, text: e.target.value })} />
      <small>{answer.text.length} / 4000</small>
    </label> : <fieldset className="xp-choices"><legend>{multiple ? t.chooseMany : t.choose}</legend>
      {question.choices.map((choice, i) => {
        const checked = answer.choiceIds.includes(choice.id);
        return <label key={choice.id} className="xp-choice" data-checked={checked}>
          <input type={multiple ? "checkbox" : "radio"} name={"question-" + question.index}
            aria-labelledby={`xp-c-${question.index}-${i}`} checked={checked} onChange={() => autosave.change({ ...answer,
              choiceIds: togglePreviewChoice(answer.choiceIds, choice.id, multiple) })} />
          <span className="xp-choice__key" aria-hidden="true">{multiple ? (checked ? <Check size={14} /> : LETTERS[i]) : LETTERS[i]}</span>
          <span className="xp-choice__text" id={`xp-c-${question.index}-${i}`} dir="auto">{question.kind === "true_false" ? t[choice.id === "true" ? "true" : "false"] : choice.text}</span>
        </label>;
      })}
    </fieldset>}
    <div className="xp-save" data-status={autosave.status}>
      <span aria-live="polite">{autosave.status === "saving" ? <Loader2 size={14} className="xp-spin" aria-hidden="true" /> :
        autosave.status === "saved" ? <Check size={14} aria-hidden="true" /> : autosave.status === "offline" ? <CloudOff size={14} aria-hidden="true" /> : null}{statusLabel}</span>
      {(autosave.status === "error" || autosave.status === "offline" || autosave.status === "conflict") && <span className="xp-save__actions">
        <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={autosave.retry}>{t.retry}</button>
        <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={autosave.discardLocalDraft}>{t.discard}</button>
      </span>}
    </div>
  </section>;
}

function Navigator({ t, questions, statuses, position, filter, setFilter, go }: {
  t: Copy; questions: Question[]; statuses: Status[]; position: number;
  filter: Filter; setFilter: (f: Filter) => void; go: (i: number) => void;
}) {
  const shown = questions.filter(q => filter === "all" ||
    (filter === "open" ? statuses[q.index] === "unanswered" : statuses[q.index] === "flagged"));
  const counts = { answered: 0, unanswered: 0, flagged: 0, saved: 0 } as Record<Status, number>;
  statuses.forEach(s => { counts[s]++; });
  const label = (s: Status) => s === "answered" ? t.answeredLabel : s === "flagged" ? t.flaggedLabel : s === "saved" ? t.savedLabel : t.notAnswered;
  return <div className="xp-nav">
    <fieldset className="xp-filters" aria-label={t.navigator}>
      {(["all", "open", "flagged"] as const).map(f => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
        {f === "all" ? t.filterAll : f === "open" ? `${t.filterOpen} · ${counts.unanswered}` : `${t.filterFlagged} · ${counts.flagged}`}
      </button>)}
    </fieldset>
    {shown.length ? <div className="xp-grid">
      {shown.map(q => <button key={q.index} type="button" data-status={statuses[q.index]} aria-current={q.index === position ? "step" : undefined}
        aria-label={`${t.question} ${q.index + 1}: ${label(statuses[q.index])}`} onClick={() => go(q.index)}>
        {q.index + 1}{statuses[q.index] === "flagged" && <Flag size={9} aria-hidden="true" fill="currentColor" />}
      </button>)}
    </div> : <p className="xp-muted">{t.none}</p>}
    <ul className="xp-legend">
      {(["answered", "unanswered", "flagged", "saved"] as const).map(s => <li key={s}><span data-status={s} aria-hidden="true" />{label(s)}<strong>{counts[s]}</strong></li>)}
    </ul>
  </div>;
}

export function LiveExamPlayer({ attemptId, locale }: { attemptId: Id<"examAttempts">; locale: Locale }) {
  const t = copy[locale];
  const status = useQuery(api.examSubmissions.getStatus, { attemptId });
  const attempt = useQuery(api.examRuntime.getMyAttempt, { attemptId });
  const rows = useQuery(api.examAnswers.getMine, { attemptId });
  const [position, setPosition] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  const [local, setLocal] = useState<Record<number, Local>>({});
  const [now, setNow] = useState(() => Date.now());
  const [clockOffset, setClockOffset] = useState(0);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{ id: string; revision: number; unanswered: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const topRef = useRef<HTMLDivElement>(null);
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
  const questions = useMemo(() => (content?.questions ?? []) as Question[], [content]);

  const onState = useCallback((index: number, state: Local) => setLocal(previous => {
    const old = previous[index];
    if (old && old.dirty === state.dirty && old.status === state.status && JSON.stringify(old.answer) === JSON.stringify(state.answer)) return previous;
    return { ...previous, [index]: state };
  }), []);

  const statuses: Status[] = questions.map(q => {
    const answer = local[q.index]?.answer ?? rows?.find(r => r.questionIndex === q.index);
    if (answer?.flagged) return "flagged";
    if (isAnswered(q, answer)) return "answered";
    return answer?.savedForLater ? "saved" : "unanswered";
  });
  const answeredCount = questions.filter(q => isAnswered(q, local[q.index]?.answer ?? rows?.find(r => r.questionIndex === q.index))).length;
  const dirty = Object.values(local).some(s => s.dirty) || local[position] === undefined;
  const saveTrouble = Object.values(local).some(s => s.status === "error" || s.status === "offline" || s.status === "conflict");

  const go = useCallback((index: number) => {
    if (index < 0 || index >= questions.length) return;
    setConfirmation(null);
    setPosition(index);
    setVisited(previous => previous.has(index) ? previous : new Set(previous).add(index));
    setNavOpen(false);
    topRef.current?.scrollIntoView?.({ block: "start", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [questions.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.altKey || event.ctrlKey || event.metaKey || target?.closest("textarea, input[type=text], [contenteditable=true]")) return;
      const rtl = locale === "ar";
      if (event.key === "ArrowRight") { event.preventDefault(); go(position + (rtl ? -1 : 1)); }
      if (event.key === "ArrowLeft") { event.preventDefault(); go(position + (rtl ? 1 : -1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, position, locale]);

  if (!status || !attempt) return <p className="xp-loading">{t.loading}</p>;
  if (closed) return <section className="xp-closed">
    <Check size={28} aria-hidden="true" /><h1>{t.completed}</h1><p>{t.completedHelp}</p>
    <Link className="ws-btn ws-btn--primary" href="/dashboard/learn/exams/results">{t.results}</Link>
  </section>;
  if (!content) return <p className="xp-loading">{t.loading}</p>;
  const question = questions[position];
  if (!question) return <p role="alert">{t.failed}</p>;

  const total = status.deadlineAt - status.startedAt;
  const fraction = total > 0 ? remaining / total : 0;
  const minutesLeft = Math.ceil(remaining / 60000);
  const urgency = remaining <= 60_000 ? "critical" : remaining <= 5 * 60_000 ? "low" : "ok";
  const tooEarly = now + clockOffset < status.minimumSubmitAt;
  const needAll = status.requireAllAnswers && answeredCount < questions.length;
  const submitBlocked = dirty || busy || !status.allowEarlySubmission || tooEarly || needAll;
  const blockedReason = !status.allowEarlySubmission ? t.noEarly : tooEarly ? t.tooEarly : needAll ? t.needAll : dirty ? t.pending : "";
  const last = position === questions.length - 1;

  const startReview = () => {
    setBusy(true); setError("");
    void prepare({ attemptId, expectedRevision: attempt.revision })
      .then(value => setConfirmation({ id: value.confirmationId, revision: value.expectedRevision, unanswered: value.unansweredCount }))
      .catch(() => setError(t.failed)).finally(() => setBusy(false));
  };

  return <div className="xp" dir={locale === "ar" ? "rtl" : "ltr"} ref={topRef}>
    <header className="xp-bar">
      <div className="xp-bar__title">
        <h1 dir="auto">{content.title}</h1>
        <p>{t.progress(answeredCount, questions.length)} · <span aria-live="polite">{dirty ? t.pending : saveTrouble ? t.error : t.allSaved}</span></p>
      </div>
      <div className="xp-timer" data-urgency={urgency} role="timer" aria-label={t.time}>
        <Clock size={16} aria-hidden="true" /><span>{formatClock(remaining)}</span>
        <span className="xp-timer__track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} /></span>
      </div>
      <button type="button" className="ws-btn ws-btn--primary xp-bar__submit" disabled={submitBlocked} onClick={startReview}
        title={blockedReason || undefined}><Send size={15} aria-hidden="true" />{t.submit}</button>
    </header>
    <div className="xp-progress" aria-hidden="true"><span style={{ width: `${questions.length ? answeredCount / questions.length * 100 : 0}%` }} /></div>
    {urgency !== "ok" && <output className="xp-alert"><AlertTriangle size={16} aria-hidden="true" />{t.lowTime(minutesLeft)}</output>}
    {integrity.notice && <p className="xp-alert" role="alert"><AlertTriangle size={16} aria-hidden="true" />{integrity.notice === "warning" ? t.integrityWarning : t.integrityReview}</p>}
    {error && <p className="xp-alert" role="alert">{error}</p>}

    <div className="xp-layout">
      <main className="xp-main">
        {confirmation ? <section className="xp-card xp-review" aria-labelledby="xp-review-title">
          <h2 id="xp-review-title">{t.reviewTitle}</h2>
          <p className="xp-muted">{t.reviewHelp}</p>
          <dl className="xp-stats">
            <div><dt>{t.answeredLabel}</dt><dd>{answeredCount}</dd></div>
            <div><dt>{t.flaggedLabel}</dt><dd>{statuses.filter(s => s === "flagged").length}</dd></div>
          </dl>
          <p className="xp-unanswered">{t.unanswered}: {confirmation.unanswered}</p>
          <div className="xp-grid">
            {questions.map(q => <button key={q.index} type="button" data-status={statuses[q.index]} onClick={() => go(q.index)}
              aria-label={`${t.question} ${q.index + 1}`}>{q.index + 1}</button>)}
          </div>
          <div className="xp-actions">
            <button type="button" className="ws-btn ws-btn--ghost" onClick={() => setConfirmation(null)}>{t.cancel}</button>
            <button type="button" className="ws-btn ws-btn--primary" disabled={busy || dirty} onClick={() => {
              setBusy(true); void submit({ attemptId, confirmationId: confirmation.id, expectedRevision: confirmation.revision, confirmed: true })
                .catch(() => { setError(t.failed); setConfirmation(null); }).finally(() => setBusy(false));
            }}><Send size={15} aria-hidden="true" />{t.confirm}</button>
          </div>
        </section> : null}
        <div hidden={!!confirmation}>
          {questions.filter(q => visited.has(q.index)).map(q => <QuestionEditor key={q.index} attemptId={attemptId} question={q}
            total={questions.length} locale={locale} active={q.index === position} onState={onState} />)}
          <nav className="xp-steps" aria-label={t.navigator}>
            <button type="button" className="ws-btn ws-btn--ghost" disabled={position === 0} onClick={() => go(position - 1)}>
              <ChevronLeft size={16} aria-hidden="true" className="rtl:rotate-180" />{t.previous}</button>
            <button type="button" className="xp-steps__count" aria-expanded={navOpen} aria-controls="xp-sheet" onClick={() => setNavOpen(v => !v)}
              aria-label={navOpen ? t.closeNavigator : t.openNavigator}>
              <Grid3x3 size={15} aria-hidden="true" />{position + 1} / {questions.length}
            </button>
            <button type="button" className="ws-btn ws-btn--primary" disabled={last} onClick={() => go(position + 1)}>
              {t.next}<ChevronRight size={16} aria-hidden="true" className="rtl:rotate-180" /></button>
          </nav>
          {last && <p className="xp-muted xp-center">{t.lastQuestion}</p>}
          {blockedReason && !dirty && <p className="xp-muted xp-center">{blockedReason}</p>}
        </div>
      </main>
      <aside className="xp-side" id="xp-sheet" data-open={navOpen} aria-label={t.navigator}>
        <div className="xp-side__head"><h2>{t.navigator}</h2>
          <button type="button" className="xp-side__close" onClick={() => setNavOpen(false)} aria-label={t.closeNavigator}><X size={18} aria-hidden="true" /></button>
        </div>
        <Navigator t={t} questions={questions} statuses={statuses} position={position} filter={filter} setFilter={setFilter} go={go} />
        <p className="xp-muted xp-hint">{t.keyboard}</p>
      </aside>
      {navOpen && <button type="button" className="xp-scrim" aria-label={t.closeNavigator} onClick={() => setNavOpen(false)} />}
    </div>
  </div>;
}
