"use client";

import { use } from "react";
import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import "@/components/courses/courses.css";

const copy = {
  en: { title: "Course assignments", lead: "Your doctor-assigned lectures and exams, with deadlines and released outcomes.",
    back: "My learning", empty: "No active assignments for this course.", signIn: "Sign in to see your assignments.",
    lesson: "Lecture", exam: "Exam", due: "Due", opens: "Opens",
    grade: "Released score", pending: "Final grade not released", upcoming: "Upcoming",
    dueState: "Due", missed: "Missed", completed: "Completed", completed_late: "Completed late",
    openLesson: "Open lecture", results: "My exam results" },
  ar: { title: "تكليفات الدورة", lead: "محاضراتك وامتحاناتك التي كلفك بها الدكتور مع المواعيد والنتائج المعلنة.",
    back: "تعلمي", empty: "لا توجد تكليفات متاحة في هذه الدورة.", signIn: "سجّل الدخول لعرض التكليفات.",
    lesson: "محاضرة", exam: "امتحان", due: "آخر موعد", opens: "يُفتح",
    grade: "الدرجة المعلنة", pending: "الدرجة النهائية لم تُعلن بعد", upcoming: "قادم",
    dueState: "مطلوب", missed: "فات الموعد", completed: "مكتمل", completed_late: "مكتمل بعد الموعد",
    openLesson: "فتح المحاضرة", results: "نتائجي في الامتحانات" },
} as const;

export default function StudentAssignments({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { locale } = useLocale(), ar = locale === "ar", t = copy[ar ? "ar" : "en"];
  const { isAuthenticated, isLoading } = useConvexAuth();
  const items = useQuery(api.courseAssignments.myAssignments, isAuthenticated ?
    { courseId: id as Id<"learnCollections"> } : "skip");
  if (isLoading || (isAuthenticated && items === undefined)) return <PageSkeleton label={t.title} />;
  if (!isAuthenticated) return <main className="lx-page"><p>{t.signIn}</p></main>;
  return <main className="lx-page" dir={ar ? "rtl" : "ltr"}>
    <Link className="ws-btn ws-btn--ghost ws-btn--sm w-fit" href="/dashboard/learn">{t.back}</Link>
    <header className="lx-hero"><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.lead}</p></header>
    {!items?.length && <section className="cb-section"><p>{t.empty}</p></section>}
    <div className="grid gap-3">{items?.map(a => <article className="cb-section grid gap-2" key={a.id}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold" dir="auto">{a.title}</h2>
        <span className="cb-note">{a.kind === "lesson" ? t.lesson : t.exam}</span>
      </div>
      {a.instructions && <p dir="auto">{a.instructions}</p>}
      {a.outcome && <p dir="auto" className="cb-note">{a.outcome}</p>}
      <p className="cb-note">{t.opens}: {new Date(a.opensAt).toLocaleString(ar ? "ar-EG" : "en")}</p>
      <p className="cb-note">{t.due}: {new Date(a.dueAt).toLocaleString(ar ? "ar-EG" : "en")}</p>
      <p className="font-medium">{a.state === "due" ? t.dueState : t[a.state]}</p>
      {a.kind === "exam" && <p className="cb-note">{a.percentBasisPoints !== null
        ? t.grade + ": " + (a.percentBasisPoints / 100).toFixed(2) + "%"
        : a.grading === "grading" || a.grading === "withheld" ? t.pending : ""}</p>}
      {a.kind === "lesson" && a.lessonId && <Link className="ws-btn ws-btn--ghost w-fit"
        href={"/learn/" + a.lessonId + "?course=" + encodeURIComponent(id)}>{t.openLesson}</Link>}
      {a.kind === "exam" && <Link className="ws-btn ws-btn--ghost w-fit"
        href="/dashboard/learn/exams/results">{t.results}</Link>}
    </article>)}</div>
  </main>;
}
