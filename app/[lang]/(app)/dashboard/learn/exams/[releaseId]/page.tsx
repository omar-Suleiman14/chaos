"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { CalendarClock, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import "@/components/courses/courses.css";

const translations = {
  en: {
    title: "Exam preflight", back: "Back to Due Exams",
    intro: "Review the examination rules before the secure exam player becomes available.",
    upcoming: "Scheduled — not yet open", available: "Within the examination window",
    course: "Course", questions: "Questions", duration: "Duration", minutes: "minutes",
    attempts: "Maximum attempts", opens: "Opens", closes: "Closes",
    rules: "Examination rules", all: "Every question must be answered before submission.",
    optional: "Unanswered questions may be submitted.", early: "Early submission is allowed.",
    noEarly: "Early submission is not allowed.",
    auto: "At timeout, the exam is configured for automatic submission.",
    expire: "At timeout, the attempt is configured to expire.",
    immediate: "Results are configured for immediate release.",
    after: "Results are released after the exam window closes.",
    manual: "The doctor releases results manually.",
    answers: "Correct answers may be shown after the applicable release rules.",
    noAnswers: "Correct answers are not configured to be shown.",
    accommodations: "Your approved accommodation (applies only when secure exam entry is enabled)",
    explanations: "Explanations may be shown after the applicable release rules.",
    noExplanations: "Explanations are not configured to be shown.",
    consent: "I have read and accept the examination rules above.",
    accept: "Record my acceptance", accepted: "Exam rules accepted",
    acceptedAt: "Recorded", locked: "Starting the exam is disabled until secure question delivery, server timing, attempt limits, and submissions are implemented.",
    wait: "You can accept the rules now, but the scheduled opening time still applies.",
    failed: "Could not record acceptance. Reload the rules and try again.",
    notReady: "Exam entry remains disabled", preview: "Preview exam interface", previewHelp: "Explore the sample player without starting an attempt or sending answers.",
  },
  ar: {
    title: "التحقق قبل الامتحان", back: "العودة إلى امتحاناتي",
    intro: "راجع قواعد الامتحان قبل إتاحة واجهة أداء الامتحان الآمنة.",
    upcoming: "مجدول — لم يبدأ بعد", available: "ضمن موعد الإتاحة",
    course: "الدورة", questions: "عدد الأسئلة", duration: "المدة", minutes: "دقيقة",
    attempts: "الحد الأقصى للمحاولات", opens: "يفتح", closes: "يغلق",
    rules: "قواعد الامتحان", all: "يجب الإجابة عن كل الأسئلة قبل التسليم.",
    optional: "يمكن التسليم دون الإجابة عن كل الأسئلة.", early: "يُسمح بالتسليم المبكر.",
    noEarly: "لا يُسمح بالتسليم المبكر.",
    auto: "عند انتهاء الوقت، يُضبط الامتحان على التسليم التلقائي.",
    expire: "عند انتهاء الوقت، تنتهي المحاولة دون تسليم تلقائي.",
    immediate: "تُعرض النتائج فورًا وفق قواعد الإتاحة.",
    after: "تُعرض النتائج بعد إغلاق نافذة الامتحان.",
    manual: "يعتمد إعلان النتائج على الدكتور.",
    answers: "قد تُعرض الإجابات الصحيحة بعد السماح بإعلانها.",
    noAnswers: "لم يُضبط عرض الإجابات الصحيحة.",
    accommodations: "التيسيرات المعتمدة لك (تطبق فقط عند إتاحة الدخول الآمن)",
    explanations: "قد تُعرض التفسيرات بعد السماح بإعلانها.",
    noExplanations: "لم يُضبط عرض التفسيرات.",
    consent: "قرأت قواعد الامتحان الموضحة وأوافق عليها.",
    accept: "تسجيل الموافقة", accepted: "تم تسجيل الموافقة على القواعد",
    acceptedAt: "وقت التسجيل", locked: "بدء الامتحان معطل حتى اكتمال تقديم الأسئلة بصورة آمنة وتوقيت الخادم وحدود المحاولات والتسليم.",
    wait: "يمكنك الموافقة على القواعد الآن، لكن الامتحان لا يبدأ قبل موعده.",
    failed: "تعذر تسجيل الموافقة. أعد تحميل القواعد وحاول مرة أخرى.",
    notReady: "دخول الامتحان غير متاح بعد", preview: "معاينة واجهة الامتحان", previewHelp: "جرّب الواجهة بأسئلة افتراضية من دون بدء محاولة أو إرسال إجابات.",
  },
} as const;

export default function ExamPreflightPage() {
  const { releaseId } = useParams<{ releaseId: string }>();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const t = translations[ar ? "ar" : "en"];
  const { isAuthenticated, isLoading } = useConvexAuth();
  const preflight = useQuery(api.examPreflight.get,
    isAuthenticated && releaseId ? { releaseId: releaseId as Id<"examReleases"> } : "skip");
  const accommodation = useQuery(api.examInvigilation.myAccommodation,
    isAuthenticated && preflight ? { releaseId: preflight.releaseId } : "skip");
  const acknowledge = useMutation(api.examPreflight.acknowledge);
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const formatDate = (value: number) => new Date(value).toLocaleString(ar ? "ar-EG" : "en-US", {
    dateStyle: "medium", timeStyle: "short",
  });
  const acceptRules = async () => {
    if (!preflight || !checked || pending || preflight.consentAccepted) return;
    setPending(true);
    setError("");
    try {
      await acknowledge({
        releaseId: preflight.releaseId,
        expectedPolicyVersion: preflight.policyVersion,
        expectedConsentRevision: preflight.consentRevision,
        accepted: true,
      });
      setChecked(false);
    } catch {
      setError(t.failed);
    } finally {
      setPending(false);
    }
  };

  if (isLoading || isAuthenticated && preflight === undefined)
    return <PageSkeleton label={t.title} />;
  if (!isAuthenticated || !preflight)
    return <main className="lx-page"><p>{t.failed}</p></main>;

  return <main className="lx-page" dir={ar ? "rtl" : "ltr"}>
    <Link href="/dashboard/learn/exams" className="ws-btn ws-btn--ghost ws-btn--sm w-fit">{t.back}</Link>
    <header className="lx-hero">
      <div><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.intro}</p></div>
    </header>
    <section className="cb-section grid gap-3" aria-labelledby="exam-preflight-name">
      <p className="cb-note">{t.course}: <span dir="auto">{preflight.courseTitle}</span></p>
      <h2 id="exam-preflight-name" className="text-xl font-semibold" dir="auto">{preflight.title}</h2>
      <p className="cb-status">{preflight.status === "upcoming" ? t.upcoming : t.available}</p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div><dt className="cb-note">{t.questions}</dt><dd className="font-semibold">{preflight.questionCount}</dd></div>
        <div><dt className="cb-note">{t.duration}</dt><dd className="font-semibold">{preflight.durationMinutes} {t.minutes}</dd></div>
        <div><dt className="cb-note">{t.attempts}</dt><dd className="font-semibold">{preflight.maxAttempts}</dd></div>
      </dl>
      {preflight.opensAt !== null && preflight.closesAt !== null && <p className="cb-note">
        <CalendarClock className="inline" size={16} aria-hidden />{" "}
        {t.opens}: {formatDate(preflight.opensAt)} · {t.closes}: {formatDate(preflight.closesAt)}
      </p>}
      {preflight.status === "upcoming" && <p className="cb-note">{t.wait}</p>}
    </section>
    {accommodation && <section className="cb-section grid gap-2" aria-label={t.accommodations}>
      <h2 className="font-semibold">{t.accommodations}</h2>
      <p className="cb-note">{accommodation.kind} {accommodation.additionalMinutes > 0 ? " · " + accommodation.additionalMinutes + " min" : ""}</p>
    </section>}
    <section className="cb-section grid gap-4" aria-labelledby="exam-rules-title">
      <h2 id="exam-rules-title" className="font-semibold">{t.rules}</h2>
      <ul className="list-disc space-y-2 ps-5 text-sm">
        <li>{preflight.requireAllAnswers ? t.all : t.optional}</li>
        <li>{preflight.allowEarlySubmission ? t.early : t.noEarly}</li>
        <li>{preflight.timeoutAction === "auto_submit" ? t.auto : t.expire}</li>
        <li>{preflight.resultVisibility === "immediate" ? t.immediate :
          preflight.resultVisibility === "after_close" ? t.after : t.manual}</li>
        <li>{preflight.showCorrectAnswers ? t.answers : t.noAnswers}</li>
        <li>{preflight.showExplanations ? t.explanations : t.noExplanations}</li>
      </ul>
      {preflight.consentAccepted ? <output className="flex items-start gap-2">
        <CheckCircle2 size={20} aria-hidden />
        <div><strong>{t.accepted}</strong>{preflight.acceptedAt !== null &&
          <p className="cb-note">{t.acceptedAt}: {formatDate(preflight.acceptedAt)}</p>}</div>
      </output> : <div className="grid gap-3">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={checked}
            onChange={event => setChecked(event.target.checked)} />
          <span>{t.consent}</span>
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="button" className="ws-btn ws-btn--primary w-fit" onClick={acceptRules}
          disabled={!checked || pending}>{pending ? "…" : t.accept}</button>
      </div>}
    </section>
    <section className="cb-section grid gap-2" aria-label={t.notReady}>
      <div className="flex items-center gap-2 font-semibold"><LockKeyhole size={18} aria-hidden />{t.notReady}</div>
      <p className="cb-note flex gap-2 items-start"><ShieldCheck size={16} aria-hidden />{t.locked}</p>
      {preflight.consentAccepted && <div className="grid justify-items-start gap-2">
        <Link className="ws-btn ws-btn--ghost ws-btn--sm" href={"/dashboard/learn/exams/" + preflight.releaseId + "/player"}>
          {t.preview}
        </Link>
        <p className="cb-note">{t.previewHelp}</p>
      </div>}
    </section>
  </main>;
}
