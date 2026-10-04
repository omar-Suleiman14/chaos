"use client";
import { useEffect, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { useCourseProgress } from "@/lib/learn/courseProgress";
import { savedGuestName, useCourseEnrollment } from "@/lib/learn/courseEnrollment";
import { useLocale } from "@/lib/i18n";
import Link from "@/components/site/SiteLink";
import { ArrowRight } from "lucide-react";

const copy = {
  en: {
    review: "Review course", continue: "Continue course", start: "Start course", starting: "Starting…",
    done: (n: number, total: number) => `${n} / ${total} lessons completed`, progress: "Course progress",
    locked: "Start the course to unlock its lessons. The teacher will see you in their students.",
    name: "Your name", namePh: "Shown to the teacher (optional)", signIn: "Sign in instead", guest: "Start as a guest",
  },
  ar: {
    review: "راجع الدورة", continue: "تابع الدورة", start: "ابدأ الدورة", starting: "جارٍ البدء…",
    done: (n: number, total: number) => `${n} / ${total} دروس مكتملة`, progress: "تقدم الدورة",
    locked: "ابدأ الدورة لفتح دروسها. سيراك المعلّم ضمن طلابه.",
    name: "اسمك", namePh: "يظهر للمعلّم (اختياري)", signIn: "سجّل الدخول بدلًا من ذلك", guest: "ابدأ كضيف",
  },
};

export default function CourseStart({ course }: { course: NonNullable<FunctionReturnType<typeof api.courses.getPublic>> }) {
  const progress = useCourseProgress(course.id), { locale } = useLocale(), t = copy[locale === "ar" ? "ar" : "en"];
  const router = useRouter();
  const { state, signedIn, enroll } = useCourseEnrollment(course.id);
  const [name, setName] = useState("");
  useEffect(() => setName(savedGuestName()), []);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const count = course.lessons.filter(l => progress[l.id]?.completed).length;
  const active = course.lessons.find(l => !progress[l.id]?.completed && (progress[l.id]?.percent ?? 0) > 0);
  const target = active ?? course.lessons.find(l => !progress[l.id]?.completed) ?? course.lessons[0];
  if (!target) return null;
  const href = `/learn/${target.id}?course=${course.id}`;
  const meter = <><p aria-live="polite">{t.done(count, course.lessons.length)}</p><div className="lx-course-meter" role="progressbar" aria-label={t.progress} aria-valuemin={0} aria-valuemax={course.lessons.length} aria-valuenow={count}><span style={{ width: `${count / course.lessons.length * 100}%` }} /></div></>;

  if (state?.enrolled) {
    const started = count > 0 || !!active, finished = count === course.lessons.length;
    return <div className="cp-continue"><Link className="cp-start site-btn site-btn--primary" href={href}>{finished ? t.review : started ? t.continue : t.start}<ArrowRight size={18} className="cp-arrow" aria-hidden /></Link>{meter}</div>;
  }
  const start = async () => {
    setBusy(true); setError("");
    try { await enroll(signedIn ? undefined : name); router.push(href); }
    catch (err) { setError(err instanceof Error ? err.message.replace(/^.*?(VALIDATION_FAILED|NOT_FOUND|RATE_LIMITED): /, "") : String(err)); setBusy(false); }
  };
  return <form className="cp-continue cp-enroll" onSubmit={e => { e.preventDefault(); void start(); }}>
    <p>{t.locked}</p>
    {!signedIn && <label className="cp-enroll__name"><span>{t.name}</span><input className="kb-input" value={name} maxLength={80} autoComplete="name" placeholder={t.namePh} onChange={e => setName(e.target.value)} /></label>}
    <div className="cp-enroll__actions">
      <button type="submit" className="cp-start site-btn site-btn--primary" disabled={busy || state === undefined}>{busy ? t.starting : signedIn ? t.start : t.guest}<ArrowRight size={18} className="cp-arrow" aria-hidden /></button>
      {!signedIn && <Link className="cp-enroll__signin" href={`/sign-in?callbackUrl=${encodeURIComponent(`/learn/courses/${course.id}`)}`}>{t.signIn}</Link>}
    </div>
    {error && <p role="alert" className="lx-error">{error}</p>}
  </form>;
}
