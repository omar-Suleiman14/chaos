"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StudentExamPlayer } from "@/components/exams/StudentExamPlayer";
import { previewQuestions } from "@/components/exams/exam-player-preview";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { useLocale } from "@/lib/i18n";
import "@/components/courses/courses.css";

const copy = {
  en: {
    back: "Back to exam rules", loading: "Loading exam preview",
    unavailable: "Exam preview unavailable. Check your assignment and course approval.",
    consent: "Accept the current exam rules before opening the preview.",
    locked: "This preview is not an exam attempt and does not contain the examination's real questions.",
  },
  ar: {
    back: "العودة إلى قواعد الامتحان", loading: "جارٍ تحميل المعاينة",
    unavailable: "المعاينة غير متاحة. تحقق من التكليف والموافقة على الانضمام للدورة.",
    consent: "وافق على قواعد الامتحان الحالية قبل فتح المعاينة.",
    locked: "هذه معاينة للواجهة وليست محاولة امتحان ولا تحتوي على أسئلة الامتحان الفعلية.",
  },
} as const;

export default function StudentExamPreviewPage() {
  const { releaseId } = useParams<{ releaseId: string }>();
  const { locale } = useLocale();
  const t = copy[locale === "ar" ? "ar" : "en"];
  const { isAuthenticated, isLoading } = useConvexAuth();
  // Every load rechecks actual student eligibility. No snapshot/content query is made.
  const preflight = useQuery(api.examPreflight.get,
    isAuthenticated && releaseId ? { releaseId: releaseId as Id<"examReleases"> } : "skip");

  if (isLoading || isAuthenticated && preflight === undefined)
    return <PageSkeleton label={t.loading} />;
  if (!isAuthenticated || !preflight)
    return <main className="lx-page"><p role="alert">{t.unavailable}</p></main>;
  return <main className="lx-page" dir={locale === "ar" ? "rtl" : "ltr"}>
    <Link className="ws-btn ws-btn--ghost ws-btn--sm w-fit"
      href={"/dashboard/learn/exams/" + preflight.releaseId}>{t.back}</Link>
    {!preflight.consentAccepted ? <output className="cb-section block">
      <p>{t.consent}</p>
    </output> : <>
      <p className="text-sm text-muted-foreground">{t.locked}</p>
      <StudentExamPlayer key={preflight.policyVersion} title={preflight.title}
        locale={locale === "ar" ? "ar" : "en"} questions={previewQuestions} />
    </>}
  </main>;
}
