"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { CalendarClock, ShieldAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import "@/components/courses/courses.css";

const translations = {
  en: {
    title: "Due Exams", lead: "Examinations assigned by the doctors of your approved courses.",
    empty: "Nothing due yet", emptyHelp: "When your doctor assigns an exam to your course or group, it will appear here.",
    signIn: "Sign in to see the exams assigned to your course account.",
    upcoming: "Upcoming", due: "Available window", questions: "questions", duration: "minute limit",
    open: "Opens", close: "Closes", course: "Course",
    disabled: "Exam entry is not available yet. The secure exam player is being implemented.",
    courseLink: "View course", preflight: "Review exam rules",
  },
  ar: {
    title: "امتحاناتي المستحقة", lead: "الامتحانات التي كلفك بها دكاترة الدورات الموافق على انضمامك إليها.",
    empty: "لا توجد امتحانات مستحقة", emptyHelp: "ستظهر هنا الامتحانات التي يكلف بها الدكتور دورتك أو مجموعتك.",
    signIn: "سجّل دخولك لعرض امتحانات الدورات الخاصة بحسابك.",
    upcoming: "قادم", due: "ضمن موعد الإتاحة", questions: "سؤال", duration: "دقيقة", open: "يبدأ", close: "ينتهي",
    course: "الدورة", disabled: "دخول الامتحان غير متاح بعد. يجري تطوير واجهة الامتحان الآمنة.",
    courseLink: "عرض الدورة", preflight: "مراجعة قواعد الامتحان",
  },
} as const;

export default function DueExamsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const t = translations[ar ? "ar" : "en"];
  const { isAuthenticated, isLoading } = useConvexAuth();
  const due = useQuery(api.examAudience.myDue, isAuthenticated ? {} : "skip");
  const date = (timestamp: number) => new Date(timestamp).toLocaleString(ar ? "ar-EG" : "en-US", {
    dateStyle: "medium", timeStyle: "short",
  });
  if (isLoading || isAuthenticated && due === undefined)
    return <PageSkeleton label={t.title} />;
  if (!isAuthenticated) return <main className="lx-page"><p>{t.signIn}</p></main>;
  return <main className="lx-page" dir={ar ? "rtl" : "ltr"}>
    <header className="lx-hero">
      <div><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.lead}</p></div>
    </header>
    {!due?.length ? <section className="cb-section grid gap-2">
      <h2>{t.empty}</h2><p className="cb-note">{t.emptyHelp}</p>
    </section> : <div className="grid gap-4 sm:grid-cols-2">
      {due.map(exam => <article key={exam.releaseId} className="cb-section grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm text-muted-foreground" dir="auto">{exam.courseTitle}</strong>
          <span className="cb-status">{exam.status === "upcoming" ? t.upcoming : t.due}</span>
        </div>
        <h2 className="text-lg font-semibold" dir="auto">{exam.title}</h2>
        <p className="cb-note">{exam.questionCount} {t.questions} · {exam.durationMinutes} {t.duration}</p>
        {exam.opensAt !== null && exam.closesAt !== null && <p className="cb-note">
          <CalendarClock size={14} className="inline" aria-hidden />{" "}
          {t.open}: {date(exam.opensAt)} · {t.close}: {date(exam.closesAt)}
        </p>}
        <p className="cb-note flex gap-2 items-start"><ShieldAlert size={16} aria-hidden />{t.disabled}</p>
        <div className="flex flex-wrap gap-2">
          <Link className="ws-btn ws-btn--primary ws-btn--sm w-fit"
            href={`/dashboard/learn/exams/${exam.releaseId}`}>{t.preflight}</Link>
          <Link className="ws-btn ws-btn--ghost ws-btn--sm w-fit"
            href={`/learn/courses/${exam.courseId}`}>{t.courseLink}</Link>
        </div>
      </article>)}
    </div>}
  </main>;
}
