"use client";
import Link from "next/link";
import { useState } from "react";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import { useLocale } from "@/lib/i18n";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import "@/components/courses/courses.css";

const labels = {
  en: { title: "My Results", lead: "Your completed exam history and released transcripts.",
    back: "Due Exams", signIn: "Sign in to see your results.", empty: "No completed attempts yet.",
    grading: "Grading in progress", withheld: "Awaiting doctor release",
    released: "Results released", expired: "Expired", void: "Voided", submitted: "Submitted",
    in_progress: "In progress", score: "Score", pass: "Passed", fail: "Not passed",
    private: "Unreleased grades and answer keys remain private.", more: "Showing up to 100 latest attempts.",
    appeal: "Request a grading appeal", appealTitle: "Appeal this result",
    reason: "Explain why you believe the grade should be reconsidered (20–2000 characters).",
    send: "Send appeal", appealDone: "Appeal saved for doctor review.",
    appealFail: "Could not submit appeal. Refresh and try again.",
    appealStatus: "Appeal status", appealClose: "Close" },
  ar: { title: "نتائجي", lead: "سجل الامتحانات المكتملة وكشوف الدرجات المنشورة.",
    back: "الامتحانات المستحقة", signIn: "سجّل الدخول لعرض نتائجك.", empty: "لا توجد محاولات مكتملة بعد.",
    grading: "جارٍ التصحيح", withheld: "بانتظار نشر الدكتور",
    released: "النتائج منشورة", expired: "انتهى", void: "أُلغيت", submitted: "تم التسليم",
    in_progress: "جارٍ الحل", score: "الدرجة", pass: "ناجح", fail: "لم يجتز",
    private: "تظل الدرجات غير المنشورة ونماذج الإجابة خاصة.", more: "تُعرض آخر ١٠٠ محاولة.",
    appeal: "طلب مراجعة الدرجة", appealTitle: "التظلم من النتيجة",
    reason: "اكتب سبب طلب مراجعة الدرجة (من ٢٠ إلى ٢٠٠٠ حرف).",
    send: "إرسال التظلم", appealDone: "تم إرسال التظلم لمراجعة الدكتور.",
    appealFail: "تعذر إرسال التظلم. حدّث الصفحة وحاول مجددًا.",
    appealStatus: "حالة التظلم", appealClose: "إغلاق" },
} as const;

export default function MyResultsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const t = labels[ar ? "ar" : "en"];
  const { isAuthenticated, isLoading } = useConvexAuth();
  const data = useQuery(api.examResults.myResults, isAuthenticated ? {} : "skip");
  const [selectedAttemptId, setSelectedAttemptId] = useState<Id<"examAttempts"> | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const appeal = useQuery(api.examDoctorReview.myAppeal,
    isAuthenticated && selectedAttemptId ? { attemptId: selectedAttemptId } : "skip");
  const fileAppeal = useMutation(api.examDoctorReview.fileAppeal);
  const selected = data?.entries.find(r => r.attemptId === selectedAttemptId);
  const submitAppeal = async () => {
    if (!selectedAttemptId || busy || reason.trim().length < 20 || appeal !== null) return;
    setBusy(true);
    try {
      await fileAppeal({ attemptId: selectedAttemptId, reason });
      setReason("");
      toast.success(t.appealDone);
    } catch (error) { toast.error(error, { fallback: t.appealFail }); }
    finally { setBusy(false); }
  };
  if (isLoading || (isAuthenticated && data === undefined)) return <PageSkeleton label={t.title} />;
  if (!isAuthenticated) return <main className="lx-page"><p>{t.signIn}</p></main>;
  const date = (n: number) => new Date(n).toLocaleString(ar ? "ar-EG" : "en-US", {
    dateStyle: "medium", timeStyle: "short",
  });
  return <main className="lx-page" dir={ar ? "rtl" : "ltr"}>
    <Link href="/dashboard/learn/exams" className="ws-btn ws-btn--ghost ws-btn--sm w-fit">{t.back}</Link>
    <header className="lx-hero"><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.lead}</p></header>
    {!data?.entries.length ? <section className="cb-section"><p>{t.empty}</p></section> :
      <div className="grid gap-4 sm:grid-cols-2">
        {data.entries.map(r => <article key={r.attemptId} className="cb-section grid gap-3">
          <p className="text-sm text-muted-foreground" dir="auto">{r.courseTitle}</p>
          <h2 className="text-lg font-semibold" dir="auto">{r.examTitle}</h2>
          <span className="cb-status">{t[r.status]}</span>
          {r.transcript ? <div className="rounded-xl border border-border p-3">
            <strong>{t.score}: {(r.transcript.earnedCents / 100).toFixed(2)} / {(r.transcript.maximumCents / 100).toFixed(2)}</strong>
            <p className="cb-note">{(r.transcript.percentBasisPoints / 100).toFixed(2)}% · {r.transcript.passed ? t.pass : t.fail}</p>
          </div> : <p className="cb-note">{t.private}</p>}
          {(r.status === "released" || r.status === "withheld") && <button type="button"
            className="ws-btn ws-btn--ghost ws-btn--sm w-fit"
            onClick={() => { setSelectedAttemptId(r.attemptId); setReason(""); }}>
            {r.status === "released" ? t.appeal : t.appealStatus}
          </button>}
          {r.completedAt !== null && <p className="cb-note">{date(r.completedAt)}</p>}
        </article>)}
      </div>}
    {selectedAttemptId && <section className="cb-section grid gap-3" aria-label={t.appealTitle}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t.appealTitle}</h2>
        <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm"
          onClick={() => { setSelectedAttemptId(null); setReason(""); }}>{t.appealClose}</button>
      </div>
      {appeal === undefined ? <p className="cb-note">…</p> : appeal ? <>
        <p className="cb-note">{t.appealStatus}: {appeal.status}</p>
        {appeal.decisionNote && <p dir="auto" className="whitespace-pre-wrap">{appeal.decisionNote}</p>}
      </> : selected?.status === "released" ? <>
        <label className="grid gap-2">{t.reason}
          <textarea className="ws-input min-h-28" maxLength={2000} value={reason}
            onChange={e => setReason(e.target.value)} dir="auto" />
        </label>
        <button type="button" disabled={busy || reason.trim().length < 20}
          className="ws-btn ws-btn--primary w-fit" onClick={() => void submitAppeal()}>{t.send}</button>
      </> : <p className="cb-note">{t.private}</p>}
    </section>}
    {data?.hasMore && <p className="cb-note">{t.more}</p>}
  </main>;
}
