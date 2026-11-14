"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import "@/components/courses/courses.css";

const translations = {
  en: {
    title: "Written-answer grading", desc: "Score rubric criteria, send for moderation and finalize only fully approved attempts.",
    back: "Student results", noDraft: "Open a sealed exam from the exam builder.",
    signIn: "Sign in as the course owner.", empty: "No submitted exam attempts.",
    student: "Student", progress: "Approved / pending", complete: "Finalized",
    pending: "Pending marking", answer: "Student response", rubric: "Frozen rubric",
    model: "Teacher reference", holistic: "Points awarded (out of",
    criterion: "Criterion score (%)", feedback: "Private grading notes",
    moderation: "Moderation note", save: "Save draft", submit: "Submit for review",
    approve: "Approve mark", changes: "Request changes",
    finalize: "Finalize approved grades", noAnswer: "Choose a pending essay question.",
    more: "First 100 attempts shown; additional pages are not yet available.",
    status: "Mark status", score: "Award", conflict: "Could not update. Reload and verify the current revision.",
    saved: "Marking record updated.", finalizeConfirm: "Finalize this attempt? Approved grades become eligible for result release.",
    draft: "Draft", submitted: "Awaiting moderation", approved: "Approved", changes_requested: "Changes requested",
    noRubric: "No rubric was authored: enter a holistic score in points.",
    disclosure: "Only the course owner can access these essays. Final scores follow the exam's frozen result-release policy.",
  },
  ar: {
    title: "تصحيح الأسئلة المقالية", desc: "قيّم بنود سلم التصحيح ثم أرسل للمراجعة واعتمد المحاولات المكتملة فقط.",
    back: "نتائج الطلاب", noDraft: "اختر امتحاناً معتمداً من منشئ الامتحانات.",
    signIn: "سجّل الدخول بحساب مالك الدورة.", empty: "لا توجد محاولات مسلّمة.",
    student: "الطالب", progress: "المعتمد / المطلوب", complete: "تم اعتماد الدرجة",
    pending: "بانتظار التصحيح", answer: "إجابة الطالب", rubric: "سلم التصحيح الثابت",
    model: "مرجع الدكتور", holistic: "الدرجة الممنوحة (من",
    criterion: "درجة المعيار (%)", feedback: "ملاحظات التصحيح الخاصة",
    moderation: "ملاحظة المراجعة", save: "حفظ المسودة", submit: "إرسال للمراجعة",
    approve: "اعتماد الدرجة", changes: "طلب تعديل",
    finalize: "اعتماد النتيجة النهائية", noAnswer: "اختر سؤالاً مقالياً يحتاج التصحيح.",
    more: "تعرض أول ١٠٠ محاولة فقط؛ صفحات إضافية غير متاحة بعد.",
    status: "حالة التصحيح", score: "الدرجة", conflict: "تعذر الحفظ. حدّث الصفحة وتحقق من نسخة البيانات.",
    saved: "تم تحديث سجل التصحيح.", finalizeConfirm: "اعتماد الدرجة النهائية؟ قد تصبح النتيجة قابلة للنشر حسب سياسة الامتحان.",
    draft: "مسودة", submitted: "بانتظار المراجعة", approved: "معتمد", changes_requested: "مطلوب تعديل",
    noRubric: "لا يوجد سلم تصحيح: أدخل الدرجة مباشرة.",
    disclosure: "لا يمكن إلا لمالك الدورة قراءة هذه الإجابات. نشر النتائج يخضع للسياسة المعتمدة للامتحان.",
  },
} as const;

export default function EssayGradingPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ draft?: string }>;
}) {
  const { id } = use(params);
  const { draft } = use(searchParams);
  const draftId = draft ? draft as Id<"examBuilderDrafts"> : null;
  const { locale } = useLocale();
  const ar = locale === "ar";
  const t = translations[ar ? "ar" : "en"];
  const { isAuthenticated, isLoading } = useConvexAuth();
  const queue = useQuery(api.examEssayGrading.queue, isAuthenticated && draftId ? { draftId } : "skip");
  const [attemptId, setAttemptId] = useState<Id<"examAttempts"> | null>(null);
  const [questionIndex, setQuestionIndex] = useState<number | null>(null);
  const work = useQuery(api.examEssayGrading.work,
    isAuthenticated && attemptId && questionIndex !== null
      ? { attemptId, questionIndex } : "skip");
  const save = useMutation(api.examEssayGrading.save);
  const submit = useMutation(api.examEssayGrading.submitForReview);
  const moderate = useMutation(api.examEssayGrading.moderate);
  const finalize = useMutation(api.examEssayGrading.finalize);
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [holistic, setHolistic] = useState("0");
  const [feedback, setFeedback] = useState("");
  const [note, setNote] = useState("");
  const [loadedVersion, setLoadedVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!work) return;
    const key = work.attemptId + ":" + work.questionIndex + ":" + (work.mark?.revision ?? 0);
    if (loadedVersion === key) return;
    setMarks(Object.fromEntries(work.rubricCriteria.map(c =>
      [c.id, work.mark?.criterionScores.find(m => m.criterionId === c.id)?.scorePercent ?? 0])));
    setHolistic(((work.mark?.holisticAwardCents ?? 0) / 100).toFixed(2));
    setFeedback(work.mark?.feedback ?? "");
    setNote(work.mark?.moderationNote ?? "");
    setLoadedVersion(key);
  }, [work, loadedVersion]);

  const choose = (id: Id<"examAttempts">, index: number) => {
    setAttemptId(id); setQuestionIndex(index); setLoadedVersion(null);
  };
  const act = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await operation(); toast.success(t.saved); }
    catch (err) { toast.error(err, { fallback: t.conflict }); }
    finally { setBusy(false); }
  };
  const gradeRevision = work?.mark?.revision ?? 0;
  const status = work?.mark?.status;
  const editable = !status || status === "draft" || status === "changes_requested";
  if (isLoading || (draftId && isAuthenticated && queue === undefined))
    return <PageSkeleton label={t.title} />;
  if (!isAuthenticated) return <main className="lx-page"><p>{t.signIn}</p></main>;
  return <main className="lx-page" dir={ar ? "rtl" : "ltr"}>
    <Link href={"/dashboard/courses/" + id + "/exams/results" + (draft ? "?draft=" + draft : "")}
      className="ws-btn ws-btn--ghost ws-btn--sm w-fit">{t.back}</Link>
    <header className="lx-hero"><h1 className="ws-page-title">{t.title}</h1>
      <p className="lx-help">{t.desc}</p></header>
    <p className="cb-note">{t.disclosure}</p>
    {!draftId || !queue ? <section className="cb-section">{t.noDraft}</section> : <>
      <section className="cb-section">
        <h2 className="text-lg font-semibold" dir="auto">{queue.title}</h2>
        {!queue.entries.length ? <p className="cb-note">{t.empty}</p> : <div className="grid gap-3 mt-3">
          {queue.entries.map(entry => <div key={entry.attemptId} className="rounded-lg border border-border p-3 grid gap-2">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="break-all text-sm">{t.student}: {entry.studentId}</span>
              <span className="text-sm">{entry.gradingState === "auto_final" ? t.complete :
                t.progress + ": " + entry.approvedCount + " / " + entry.pendingWrittenCount}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {entry.pendingQuestions.map(index => <button key={index} type="button"
                className="ws-btn ws-btn--ghost ws-btn--sm"
                aria-pressed={attemptId === entry.attemptId && questionIndex === index}
                onClick={() => choose(entry.attemptId, index)}>
                {ar ? "السؤال " : "Question "}{index + 1}
              </button>)}
              {entry.gradingState === "needs_manual" && entry.pendingWrittenCount > 0 &&
                entry.approvedCount === entry.pendingWrittenCount &&
                <button type="button" className="ws-btn ws-btn--primary ws-btn--sm"
                  disabled={busy} onClick={() => {
                    if (!window.confirm(t.finalizeConfirm)) return;
                    void act(() => finalize({ attemptId: entry.attemptId,
                      expectedGradeRevision: entry.gradeRevision }));
                  }}>{t.finalize}</button>}
            </div>
          </div>)}
        </div>}
        {queue.hasMore && <p className="cb-note">{t.more}</p>}
      </section>
      {attemptId && questionIndex !== null && work ? <section className="cb-section grid gap-4">
        <h2 className="text-lg font-semibold">{t.pending} #{questionIndex + 1}</h2>
        <p className="font-medium whitespace-pre-wrap" dir="auto">{work.prompt}</p>
        <div><h3 className="font-semibold">{t.answer}</h3>
          <p className="whitespace-pre-wrap rounded-lg border border-border p-3" dir="auto">{work.response}</p></div>
        {work.sampleAnswer && <details><summary className="cursor-pointer">{t.model}</summary>
          <p className="whitespace-pre-wrap" dir="auto">{work.sampleAnswer}</p></details>}
        <p className="cb-note">{t.status}: {status ? t[status] : t.draft} · {t.score}: {((work.mark?.awardedCents ?? 0) / 100).toFixed(2)} / {(work.pointsAvailableCents / 100).toFixed(2)}</p>
        {work.rubricCriteria.length ? <fieldset className="grid gap-3">
          <legend className="font-semibold">{t.rubric}</legend>
          {work.rubricCriteria.map(c => <label key={c.id} className="grid gap-1">
            <span dir="auto">{c.description} ({c.weightPercent}%)</span>
            <span className="text-sm">{t.criterion}</span>
            <input className="ws-input w-full max-w-32" type="number" min={0} max={100} step={1}
              value={marks[c.id] ?? 0} disabled={!editable || busy}
              onChange={e => setMarks(old => ({ ...old, [c.id]: Number(e.target.value) }))} />
          </label>)}
        </fieldset> : <label className="grid gap-1">{t.noRubric}
          <span>{t.holistic} {(work.pointsAvailableCents / 100).toFixed(2)})</span>
          <input className="ws-input max-w-32" type="number" min={0}
            max={work.pointsAvailableCents / 100} step={0.01} value={holistic}
            disabled={!editable || busy} onChange={e => setHolistic(e.target.value)} />
        </label>}
        <label className="grid gap-1">{t.feedback}
          <textarea className="ws-input min-h-24" maxLength={2000} value={feedback}
            disabled={!editable || busy} onChange={e => setFeedback(e.target.value)} /></label>
        <label className="grid gap-1">{t.moderation}
          <textarea className="ws-input min-h-20" maxLength={2000} value={note}
            disabled={status !== "submitted" || busy} onChange={e => setNote(e.target.value)} /></label>
        <div className="flex flex-wrap gap-2">
          {editable && <button type="button" className="ws-btn ws-btn--primary" disabled={busy}
            onClick={() => void act(() => save({ attemptId, questionIndex, expectedRevision: gradeRevision,
              criterionScores: work.rubricCriteria.map(c => ({ criterionId: c.id, scorePercent: marks[c.id] ?? 0 })),
              ...(work.rubricCriteria.length ? {} : { holisticAwardCents: Math.round(Number(holistic) * 100) }),
              feedback }))}>{t.save}</button>}
          {status === "draft" && <button type="button" className="ws-btn ws-btn--ghost" disabled={busy}
            onClick={() => void act(() => submit({ attemptId, questionIndex, expectedRevision: gradeRevision }))}>{t.submit}</button>}
          {status === "submitted" && <>
            <button type="button" className="ws-btn ws-btn--primary" disabled={busy}
              onClick={() => void act(() => moderate({ attemptId, questionIndex, expectedRevision: gradeRevision,
                decision: "approve", note }))}>{t.approve}</button>
            <button type="button" className="ws-btn ws-btn--ghost" disabled={busy || !note.trim()}
              onClick={() => void act(() => moderate({ attemptId, questionIndex, expectedRevision: gradeRevision,
                decision: "changes_requested", note }))}>{t.changes}</button>
          </>}
        </div>
      </section> : <section className="cb-section"><p className="cb-note">{t.noAnswer}</p></section>}
    </>}
  </main>;
}
