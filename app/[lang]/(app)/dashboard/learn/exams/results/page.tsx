"use client";
import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import "@/components/courses/courses.css";

const labels = {
  en: { title: "My Results", lead: "Your completed exam history and released transcripts.",
    back: "Due Exams", signIn: "Sign in to see your results.", empty: "No completed attempts yet.",
    grading: "Grading in progress", withheld: "Awaiting doctor release",
    released: "Results released", expired: "Expired", void: "Voided", submitted: "Submitted",
    in_progress: "In progress", score: "Score", pass: "Passed", fail: "Not passed",
    private: "Unreleased grades and answer keys remain private.", more: "Showing up to 100 latest attempts." },
  ar: { title: "نتائجي", lead: "سجل الامتحانات المكتملة وكشوف الدرجات المنشورة.",
    back: "الامتحانات المستحقة", signIn: "سجّل الدخول لعرض نتائجك.", empty: "لا توجد محاولات مكتملة بعد.",
    grading: "جارٍ التصحيح", withheld: "بانتظار نشر الدكتور",
    released: "النتائج منشورة", expired: "انتهى", void: "أُلغيت", submitted: "تم التسليم",
    in_progress: "جارٍ الحل", score: "الدرجة", pass: "ناجح", fail: "لم يجتز",
    private: "تظل الدرجات غير المنشورة ونماذج الإجابة خاصة.", more: "تُعرض آخر ١٠٠ محاولة." },
} as const;

export default function MyResultsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const t = labels[ar ? "ar" : "en"];
  const { isAuthenticated, isLoading } = useConvexAuth();
  const data = useQuery(api.examResults.myResults, isAuthenticated ? {} : "skip");
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
          {r.completedAt !== null && <p className="cb-note">{date(r.completedAt)}</p>}
        </article>)}
      </div>}
    {data?.hasMore && <p className="cb-note">{t.more}</p>}
  </main>;
}
