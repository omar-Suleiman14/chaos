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
    version: "Exam version", currentVersion: "Current version", previous: "Previous page", next: "Next page",
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
    assist: "Request assisted grading", assistConfirm: "Allow a platform administrator to review this student essay and draft a proposal? No grade will be published automatically.", assistStatus: "Assistance request",
    proposal: "Administrator proposal — doctor review required",
    evidence: "Verbatim answer evidence", confidence: "Confidence", apply: "Approve proposal",
    adjust: "Approve with adjusted marks", reject: "Reject proposal",
    doctorReason: "Doctor's reason (required when adjusting, rejecting or regrading)",
    regrade: "Regrade finalized answer", releaseRevision: "Release reviewed revision",
    releaseConfirm: "Release the reviewed revised grade to the student? An unresolved appeal blocks release.",
    noRubric: "No rubric was authored: enter a holistic score in points.",
    disclosure: "Only the course owner can access these essays. Final scores follow the exam's frozen result-release policy.",
  },
  ar: {
    version: "نسخة الامتحان", currentVersion: "النسخة الحالية", previous: "الصفحة السابقة", next: "الصفحة التالية",
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
    assist: "طلب مساعدة في التصحيح", assistConfirm: "هل تسمح لمسؤول المنصة بمراجعة الإجابة لتجهيز اقتراح فقط؟ لن تنشر أي درجات تلقائياً.", assistStatus: "حالة طلب المساعدة",
    proposal: "اقتراح المسؤول — يجب أن يراجعه الدكتور",
    evidence: "الدليل النصي من إجابة الطالب", confidence: "مستوى الثقة", apply: "اعتماد الاقتراح",
    adjust: "اعتماد مع تعديل الدرجات", reject: "رفض الاقتراح",
    doctorReason: "سبب قرار الدكتور (مطلوب للتعديل أو الرفض أو إعادة التصحيح)",
    regrade: "إعادة تصحيح الإجابة النهائية", releaseRevision: "نشر الدرجة المعدلة بعد المراجعة",
    releaseConfirm: "هل تريد نشر الدرجة المعدلة للطالب؟ لا يُسمح بالنشر إذا كان التظلم معلقاً.",
    noRubric: "لا يوجد سلم تصحيح: أدخل الدرجة مباشرة.",
    disclosure: "لا يمكن إلا لمالك الدورة قراءة هذه الإجابات. نشر النتائج يخضع للسياسة المعتمدة للامتحان.",
  },
} as const;

export default function EssayGradingPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ draft?: string; snapshot?: string }>;
}) {
  const { id } = use(params);
  const { draft, snapshot } = use(searchParams);
  const [selectedSnapshot, setSelectedSnapshot] = useState(snapshot ?? "");
  const [pages, setPages] = useState<Array<string | null>>([null]);
  const draftId = draft ? draft as Id<"examBuilderDrafts"> : null;
  const { locale } = useLocale();
  const ar = locale === "ar";
  const t = translations[ar ? "ar" : "en"];
  const { isAuthenticated, isLoading } = useConvexAuth();
  const snapshotId = selectedSnapshot ? selectedSnapshot as Id<"examSnapshots"> : undefined;
  const snapshots = useQuery(api.examRuntime.listDraftSnapshots, isAuthenticated && draftId ? { draftId } : "skip");
  const queue = useQuery(api.examEssayGrading.queue, isAuthenticated && draftId ?
    { draftId, snapshotId, cursor: pages[pages.length - 1] } : "skip");
  const [attemptId, setAttemptId] = useState<Id<"examAttempts"> | null>(null);
  const [questionIndex, setQuestionIndex] = useState<number | null>(null);
  const work = useQuery(api.examEssayGrading.work,
    isAuthenticated && attemptId && questionIndex !== null
      ? { attemptId, questionIndex } : "skip");
  const save = useMutation(api.examEssayGrading.save);
  const submit = useMutation(api.examEssayGrading.submitForReview);
  const moderate = useMutation(api.examEssayGrading.moderate);
  const finalize = useMutation(api.examEssayGrading.finalize);
  const requestAssist = useMutation(api.examGradingJobs.request);
  const decideProposal = useMutation(api.examDoctorReview.decide);
  const regrade = useMutation(api.examDoctorReview.regrade);
  const releaseRegrade = useMutation(api.examDoctorReview.releaseRegrade);
  const assisted = useQuery(api.examGradingJobs.myJobs, isAuthenticated && draftId && queue ?
    { draftId, snapshotId: queue.snapshotId, attemptIds: queue.entries.map(e => e.attemptId) } : "skip");
  const entry = queue?.entries.find(e => e.attemptId === attemptId);
  const reviewJob = assisted?.jobs.find(j => j.attemptId === attemptId && j.status === "doctor_review");
  const review = useQuery(api.examDoctorReview.review,
    isAuthenticated && reviewJob && entry?.gradingState === "needs_manual"
      ? { jobId: reviewJob.jobId } : "skip");
  const proposal = review?.proposals.find(p => p.questionIndex === questionIndex);
  const canRegrade = entry?.gradingState === "auto_final" && !entry.reviewHold;
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
    <Link href={"/dashboard/courses/" + id + "/exams/results" + (draft ? "?draft=" + draft + (selectedSnapshot ? "&snapshot=" + selectedSnapshot : "") : "")}
      className="ws-btn ws-btn--ghost ws-btn--sm w-fit">{t.back}</Link>
    <header className="lx-hero"><h1 className="ws-page-title">{t.title}</h1>
      <p className="lx-help">{t.desc}</p></header>
    <p className="cb-note">{t.disclosure}</p>
    {draftId && snapshots && <label className="grid gap-2 w-fit">{t.version}
      <select className="ws-input" value={selectedSnapshot} onChange={e => {
        setSelectedSnapshot(e.target.value); setPages([null]); setAttemptId(null); setQuestionIndex(null); setLoadedVersion(null);
      }}>
        <option value="">{t.currentVersion}</option>
        {snapshots.map(item => <option key={item.snapshotId} value={item.snapshotId}>{item.title} · {item.version}</option>)}
      </select>
    </label>}
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
              {[...entry.pendingQuestions, ...entry.finalWrittenQuestions].map(index => <button key={index} type="button"
                className="ws-btn ws-btn--ghost ws-btn--sm"
                aria-pressed={attemptId === entry.attemptId && questionIndex === index}
                onClick={() => choose(entry.attemptId, index)}>
                {ar ? "السؤال " : "Question "}{index + 1}
              </button>)}
              {entry.gradingState === "needs_manual" && !assisted?.jobs.some(j => j.attemptId === entry.attemptId) &&
                <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={busy}
                  onClick={() => { if (!window.confirm(t.assistConfirm)) return;
                    void act(() => requestAssist({ attemptId: entry.attemptId,
                      requestKey: "assisted-" + entry.attemptId, confirmAdminAccess: true }));
                  }}>{t.assist}</button>}
              {assisted?.jobs.filter(j => j.attemptId === entry.attemptId).map(j =>
                <span key={j.jobId} className="text-sm">{t.assistStatus}: {j.status}</span>)}
              {entry.reviewHold && <button type="button" className="ws-btn ws-btn--primary ws-btn--sm"
                disabled={busy} onClick={() => {
                  if (!window.confirm(t.releaseConfirm)) return;
                  void act(() => releaseRegrade({ attemptId: entry.attemptId,
                    expectedGradeRevision: entry.gradeRevision, confirmRelease: true }));
                }}>{t.releaseRevision}</button>}
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
        <nav className="flex gap-2" aria-label={t.title}>
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={pages.length <= 1}
            onClick={() => { setPages(old => old.slice(0, -1)); setAttemptId(null); setQuestionIndex(null); }}>{t.previous}</button>
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={!queue.nextCursor}
            onClick={() => { if (queue.nextCursor) setPages(old => [...old, queue.nextCursor]); setAttemptId(null); setQuestionIndex(null); }}>{t.next}</button>
        </nav>
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
              value={marks[c.id] ?? 0} disabled={(!editable && !canRegrade) || busy}
              onChange={e => setMarks(old => ({ ...old, [c.id]: Number(e.target.value) }))} />
          </label>)}
        </fieldset> : <label className="grid gap-1">{t.noRubric}
          <span>{t.holistic} {(work.pointsAvailableCents / 100).toFixed(2)})</span>
          <input className="ws-input max-w-32" type="number" min={0}
            max={work.pointsAvailableCents / 100} step={0.01} value={holistic}
            disabled={(!editable && !canRegrade) || busy} onChange={e => setHolistic(e.target.value)} />
        </label>}
        <label className="grid gap-1">{t.feedback}
          <textarea className="ws-input min-h-24" maxLength={2000} value={feedback}
            disabled={(!editable && !canRegrade) || busy} onChange={e => setFeedback(e.target.value)} /></label>
        {proposal && <section className="rounded-xl border border-border p-3 grid gap-3">
          <h3 className="font-semibold">{t.proposal}</h3>
          <p className="cb-note">{t.status}: {proposal.state} · {t.confidence}: {proposal.confidence} ·
            {t.score}: {(proposal.awardedCents / 100).toFixed(2)}</p>
          <p className="whitespace-pre-wrap text-sm" dir="auto">{proposal.feedback}</p>
          <div className="grid gap-2">
            <strong className="text-sm">{t.evidence}</strong>
            {proposal.evidence.map(e => <div key={e.criterionId} className="rounded-lg border border-border p-2 text-sm">
              <p className="font-medium" dir="auto">{e.quote}</p>
              <p dir="auto">{e.rationale}</p>
            </div>)}
          </div>
          {proposal.state === "sent" && review && reviewJob && <div className="flex flex-wrap gap-2">
            <button type="button" className="ws-btn ws-btn--primary ws-btn--sm" disabled={busy}
              onClick={() => void act(() => decideProposal({
                jobId: reviewJob.jobId, questionIndex, expectedJobRevision: review.revision,
                expectedMarkRevision: gradeRevision, decision: "accept", note,
              }))}>{t.apply}</button>
            <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm"
              disabled={busy || !note.trim()} onClick={() => void act(() => decideProposal({
                jobId: reviewJob.jobId, questionIndex, expectedJobRevision: review.revision,
                expectedMarkRevision: gradeRevision, decision: "override", note,
                criterionScores: work.rubricCriteria.map(c => ({
                  criterionId: c.id, scorePercent: marks[c.id] ?? 0,
                })),
                ...(work.rubricCriteria.length ? {} : {
                  holisticAwardCents: Math.round(Number(holistic) * 100),
                }), feedback,
              }))}>{t.adjust}</button>
            <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm"
              disabled={busy || !note.trim()} onClick={() => void act(() => decideProposal({
                jobId: reviewJob.jobId, questionIndex, expectedJobRevision: review.revision,
                expectedMarkRevision: gradeRevision, decision: "reject", note,
              }))}>{t.reject}</button>
          </div>}
        </section>}
        <label className="grid gap-1">{proposal?.state === "sent" || canRegrade ? t.doctorReason : t.moderation}
          <textarea className="ws-input min-h-20" maxLength={2000} value={note}
            disabled={(status !== "submitted" && proposal?.state !== "sent" && !canRegrade) || busy}
            onChange={e => setNote(e.target.value)} /></label>
        <div className="flex flex-wrap gap-2">
          {canRegrade && entry && <button type="button" className="ws-btn ws-btn--primary"
            disabled={busy || note.trim().length < 10}
            onClick={() => void act(() => regrade({
              attemptId, questionIndex, expectedGradeRevision: entry.gradeRevision,
              expectedMarkRevision: gradeRevision,
              criterionScores: work.rubricCriteria.map(c => ({
                criterionId: c.id, scorePercent: marks[c.id] ?? 0,
              })),
              ...(work.rubricCriteria.length ? {} : {
                holisticAwardCents: Math.round(Number(holistic) * 100),
              }), feedback, reason: note,
            }))}>{t.regrade}</button>}
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
