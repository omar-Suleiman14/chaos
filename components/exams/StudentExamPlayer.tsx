"use client";

import { useState } from "react";
import Image from "next/image";
import { Bookmark, ChevronLeft, ChevronRight, Flag, LockKeyhole, ZoomIn } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from "@/components/ui/dialog";
import {
  isPreviewAnswered, navigatorStatus, togglePreviewChoice,
  type ExamPlayerQuestion, type PreviewAnswer, type NavigatorStatus,
} from "./exam-player-model";

const copy = {
  en: {
    preview: "Interface preview · not an exam attempt",
    warning: "These are sample questions only. Responses and bookmarks stay in this screen, are not saved to your account and are never submitted.",
    progress: "Answered in this preview", question: "Question", of: "of",
    navigation: "Question navigator", status: "Question status", unanswered: "Unanswered",
    answered: "Answered", saved: "Saved for later", flagged: "Flagged for review",
    save: "Save for later", unsave: "Remove saved marker",
    flag: "Flag for review", unflag: "Remove review flag",
    previous: "Previous question", next: "Next question",
    selectOne: "Choose one answer", selectMany: "Choose all that apply",
    written: "Write your answer", placeholder: "Enter a practice response…",
    images: "Case images", zoom: "Enlarge image", zoomHelp: "Sample diagram only; no private exam images are loaded.",
    submit: "Submit exam", locked: "Real exam submission is disabled.",
    empty: "No preview questions are available.",
  },
  ar: {
    preview: "معاينة الواجهة · ليست محاولة امتحان",
    warning: "الأسئلة تجريبية فقط. الإجابات وعلامات الحفظ داخل هذه الشاشة مؤقتة، ولا تُحفظ في حسابك ولا يتم تسليمها.",
    progress: "المجاب عنها في المعاينة", question: "السؤال", of: "من",
    navigation: "التنقل بين الأسئلة", status: "حالة السؤال", unanswered: "لم يُجب",
    answered: "تمت الإجابة", saved: "محفوظ للمراجعة", flagged: "محدد للمراجعة",
    save: "حفظ للمراجعة", unsave: "إلغاء علامة الحفظ",
    flag: "تحديد للمراجعة", unflag: "إلغاء التحديد للمراجعة",
    previous: "السؤال السابق", next: "السؤال التالي",
    selectOne: "اختر إجابة واحدة", selectMany: "اختر كل الإجابات المناسبة",
    written: "اكتب إجابتك", placeholder: "اكتب إجابة تجريبية…",
    images: "صور الحالة", zoom: "تكبير الصورة", zoomHelp: "رسم تجريبي فقط، ولا يتم تحميل صور امتحانات خاصة.",
    submit: "تسليم الامتحان", locked: "تسليم الامتحان الحقيقي غير متاح.",
    empty: "لا توجد أسئلة للمعاينة.",
  },
} as const;

const statusStyle: Record<NavigatorStatus, string> = {
  unanswered: "border-border bg-background text-foreground",
  answered: "border-emerald-600/40 bg-emerald-600/10 text-foreground",
  saved: "border-sky-600/40 bg-sky-600/10 text-foreground",
  flagged: "border-amber-600/40 bg-amber-600/10 text-foreground",
};

type PreviewMedia = { id: string; src: string; alt: string };
type Props = {
  title: string;
  questions: readonly ExamPlayerQuestion[];
  locale: "en" | "ar";
};

/**
 * A local, throwaway UI preview. Do not add examRuntime.startAttempt, snapshot
 * reads, storage, autosave or submit mutations here; future secure delivery must
 * replace the entire preview boundary, not quietly turn it into a live attempt.
 */
export function StudentExamPlayer({ title, questions, locale }: Props) {
  const t = copy[locale];
  const [position, setPosition] = useState(0);
  const [answers, setAnswers] = useState<Record<string, PreviewAnswer>>({});
  const [saved, setSaved] = useState<string[]>([]);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [zoomed, setZoomed] = useState<PreviewMedia | null>(null);
  const current = questions[Math.min(position, questions.length - 1)];
  const states = questions.map(q => navigatorStatus(
    q, answers[q.id], saved.includes(q.id), flagged.includes(q.id),
  ));
  const answeredCount = questions.filter(q => isPreviewAnswered(q, answers[q.id])).length;
  const toggleMarker = (
    id: string, setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => setter(previous => previous.includes(id)
    ? previous.filter(value => value !== id) : [...previous, id]);
  const setChoice = (id: string) => {
    if (!current) return;
    setAnswers(previous => {
      const answer = previous[current.id] ?? { choiceIds: [], text: "" };
      return { ...previous, [current.id]: {
        ...answer, choiceIds: togglePreviewChoice(answer.choiceIds, id,
          current.kind === "multiple_choice"),
      } };
    });
  };

  if (!current) return <section className="cb-section" role="status">{t.empty}</section>;
  const answer = answers[current.id] ?? { choiceIds: [], text: "" };
  const isSaved = saved.includes(current.id);
  const isFlagged = flagged.includes(current.id);
  const kindHelp = current.kind === "multiple_choice" ? t.selectMany : t.selectOne;

  return <div className="grid gap-4" dir={locale === "ar" ? "rtl" : "ltr"}>
    <header className="cb-section grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold">{t.preview}</span>
        <LockKeyhole size={16} aria-hidden="true" className="text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold sm:text-2xl" dir="auto">{title}</h1>
      <p className="text-sm text-muted-foreground" role="note">{t.warning}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{t.progress}: <strong>{answeredCount} / {questions.length}</strong></span>
        <span aria-live="polite">{t.question} {position + 1} {t.of} {questions.length}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{
          width: String(questions.length ? answeredCount / questions.length * 100 : 0) + "%",
        }} />
      </div>
    </header>

    <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="cb-section min-w-0 space-y-5" aria-labelledby="exam-preview-prompt">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">{t.question} {position + 1}</span>
          <span className="rounded-md border border-border px-2 py-1 text-xs" role="status">
            {t[states[position]]}
          </span>
        </div>
        {current.caseStudy && <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed" dir="auto">{current.caseStudy.stem}</p>
          {current.caseStudy.media.length > 0 && <div className="grid gap-3">
            <h2 className="text-sm font-semibold">{t.images}</h2>
            {current.caseStudy.media.map(media => <figure key={media.id} className="min-w-0 space-y-2">
              <Image src={media.src} width={720} height={400} alt={media.alt}
                unoptimized className="h-auto max-h-64 w-full rounded-lg border border-border object-contain" />
              <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm"
                onClick={() => setZoomed(media)}>
                <ZoomIn size={16} aria-hidden="true" />{t.zoom}
              </button>
            </figure>)}
          </div>}
        </div>}
        <h2 id="exam-preview-prompt" className="whitespace-pre-wrap break-words text-lg font-semibold leading-relaxed" dir="auto">
          {current.prompt}
        </h2>
        {current.kind === "written" ? <label className="grid gap-2 text-sm">
          <span className="font-semibold">{t.written}</span>
          <textarea className="min-h-40 w-full resize-y rounded-xl border border-border bg-background p-3 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            value={answer.text} placeholder={t.placeholder} maxLength={4000}
            onChange={event => setAnswers(previous => ({
              ...previous, [current.id]: {
                ...previous[current.id], choiceIds: previous[current.id]?.choiceIds ?? [],
                text: event.target.value,
              },
            }))} />
        </label> : <fieldset className="grid gap-3">
          <legend className="mb-3 text-sm font-semibold">{kindHelp}</legend>
          {current.choices.map(choice => <label key={choice.id}
            className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-3 transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring">
            <input className="mt-1 size-4 shrink-0 accent-primary"
              name={"exam-preview-" + current.id}
              type={current.kind === "multiple_choice" ? "checkbox" : "radio"}
              checked={answer.choiceIds.includes(choice.id)}
              onChange={() => setChoice(choice.id)} />
            <span className="min-w-0 break-words text-sm leading-relaxed" dir="auto">{choice.text}</span>
          </label>)}
        </fieldset>}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <button type="button" aria-pressed={isSaved}
            className="ws-btn ws-btn--ghost ws-btn--sm"
            onClick={() => toggleMarker(current.id, setSaved)}>
            <Bookmark size={16} aria-hidden="true" fill={isSaved ? "currentColor" : "none"} />
            {isSaved ? t.unsave : t.save}
          </button>
          <button type="button" aria-pressed={isFlagged}
            className="ws-btn ws-btn--ghost ws-btn--sm"
            onClick={() => toggleMarker(current.id, setFlagged)}>
            <Flag size={16} aria-hidden="true" fill={isFlagged ? "currentColor" : "none"} />
            {isFlagged ? t.unflag : t.flag}
          </button>
        </div>
        <nav aria-label={t.navigation} className="flex items-center justify-between gap-2">
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm"
            disabled={position === 0} onClick={() => setPosition(old => Math.max(0, old - 1))}>
            {locale === "ar" ? <ChevronRight size={16} aria-hidden="true" /> :
              <ChevronLeft size={16} aria-hidden="true" />}
            {t.previous}
          </button>
          <button type="button" className="ws-btn ws-btn--primary ws-btn--sm"
            disabled={position >= questions.length - 1}
            onClick={() => setPosition(old => Math.min(questions.length - 1, old + 1))}>
            {t.next}
            {locale === "ar" ? <ChevronLeft size={16} aria-hidden="true" /> :
              <ChevronRight size={16} aria-hidden="true" />}
          </button>
        </nav>
      </section>

      <aside className="cb-section min-w-0 space-y-4" aria-labelledby="exam-navigator-heading">
        <h2 id="exam-navigator-heading" className="font-semibold">{t.navigation}</h2>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-5" role="group" aria-label={t.navigation}>
          {questions.map((q, i) => <button key={q.id} type="button"
            aria-label={t.question + " " + (i + 1) + ": " + t[states[i]]}
            aria-current={position === i ? "step" : undefined}
            onClick={() => setPosition(i)}
            className={"flex aspect-square min-h-10 items-center justify-center rounded-lg border text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
              statusStyle[states[i]] + (position === i ? " ring-2 ring-ring ring-offset-2 ring-offset-background" : "")}>
            {i + 1}
          </button>)}
        </div>
        <section className="space-y-2 border-t border-border pt-3" aria-label={t.status}>
          {(["unanswered", "answered", "saved", "flagged"] as const).map(status => <div
            key={status} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2">
              <span className={"size-3 rounded-sm border " + statusStyle[status]} aria-hidden="true" />{t[status]}
            </span>
            <strong>{states.filter(state => state === status).length}</strong>
          </div>)}
        </section>
        <button type="button" className="ws-btn ws-btn--primary w-full" disabled aria-describedby="exam-preview-submit-help">
          <LockKeyhole size={16} aria-hidden="true" />{t.submit}
        </button>
        <p id="exam-preview-submit-help" className="text-xs text-muted-foreground">{t.locked}</p>
      </aside>
    </div>

    <Dialog open={!!zoomed} onOpenChange={open => { if (!open) setZoomed(null); }}>
      <DialogContent className="sm:max-w-4xl">
        <DialogTitle>{t.zoom}</DialogTitle>
        <DialogDescription>{t.zoomHelp}</DialogDescription>
        {zoomed && <Image src={zoomed.src} alt={zoomed.alt} width={960} height={540}
          unoptimized className="max-h-[70vh] w-full rounded-lg object-contain" />}
      </DialogContent>
    </Dialog>
  </div>;
}
