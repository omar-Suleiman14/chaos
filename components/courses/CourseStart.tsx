"use client";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { useCourseProgress } from "@/lib/learn/courseProgress";
import { useLocale } from "@/lib/i18n";
import Link from "@/components/site/SiteLink";
import { ArrowRight } from "lucide-react";
export default function CourseStart({ course }: { course: NonNullable<FunctionReturnType<typeof api.courses.getPublic>> }) {
  const progress = useCourseProgress(course.id), { locale } = useLocale(), ar = locale === "ar";
  const count = course.lessons.filter(l => progress[l.id]?.completed).length;
  const active = course.lessons.find(l => !progress[l.id]?.completed && (progress[l.id]?.percent ?? 0) > 0);
  const target = active ?? course.lessons.find(l => !progress[l.id]?.completed) ?? course.lessons[0];
  if (!target) return null;
  const started = count > 0 || !!active, finished = count === course.lessons.length;
  const label = finished ? (ar ? "راجع الدورة" : "Review course") : started ? (ar ? "تابع الدورة" : "Continue course") : (ar ? "ابدأ الدورة" : "Start course");
  return <div className="cp-continue"><Link className="cp-start site-btn site-btn--primary" href={`/learn/${target.id}?course=${course.id}`}>{label}<ArrowRight size={18} className="cp-arrow" aria-hidden /></Link><p aria-live="polite">{ar ? `${count} / ${course.lessons.length} دروس مكتملة` : `${count} / ${course.lessons.length} lessons completed`}</p><div className="lx-course-meter" role="progressbar" aria-label={ar ? "تقدم الدورة" : "Course progress"} aria-valuemin={0} aria-valuemax={course.lessons.length} aria-valuenow={count}><span style={{ width: `${count / course.lessons.length * 100}%` }} /></div></div>;
}
