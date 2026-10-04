"use client";
import { useEffect } from "react";
import { useLearnViewer } from "@/lib/learn/data";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "@/components/site/SiteLink";
import { useCourseProgress } from "@/lib/learn/courseProgress";
import { useLocale } from "@/lib/i18n";
export default function CourseNavigation({ courseId, lessonId, completed }: { courseId?: string | null; lessonId: string; completed: boolean }) {
  const viewer = useLearnViewer(), remember = useMutation(api.courses.remember);
  useEffect(() => { if (courseId && viewer?.signedIn) void remember({ courseId }).catch(() => {}); }, [courseId, viewer?.signedIn, remember]);
  const course = useQuery(api.courses.getPublic, courseId ? { courseId } : "skip");
  const progress = useCourseProgress(courseId ?? "");
  const { locale } = useLocale(), ar = locale === "ar";
  if (!course) return null;
  const index = course.lessons.findIndex(l => l.id === lessonId);
  if (index < 0) return null;
  const previous = course.lessons[index - 1], next = course.lessons[index + 1];
  const count = course.lessons.filter(l => l.id === lessonId ? completed : progress[l.id]?.completed).length;
  const href = (id: string) => `/learn/${id}?course=${encodeURIComponent(course.id)}`;
  return <nav className="lx-course-navigation" aria-label={ar ? "التنقل في الدورة" : "Course navigation"}>
    <Link href={`/learn/courses/${course.id}`} dir="auto">{course.title}</Link>
    <p className="lx-muted" aria-live="polite">{ar ? `${count} / ${course.lessons.length} دروس مكتملة` : `${count} / ${course.lessons.length} lessons completed`}</p>
    <div className="lx-course-meter" role="progressbar" aria-valuenow={count} aria-valuemin={0} aria-valuemax={course.lessons.length} aria-label={ar ? "تقدم الدورة" : "Course progress"}><span style={{ width: `${count / Math.max(1, course.lessons.length) * 100}%` }} /></div>
    <div className="lx-actions">{previous && <Link className="ws-btn ws-btn--ghost" href={href(previous.id)}>{ar ? "الدرس السابق" : "Previous lesson"}<bdi>{previous.title}</bdi></Link>}{next && <Link className="ws-btn ws-btn--primary" href={href(next.id)}>{ar ? "تابع إلى الدرس التالي" : "Continue to next lesson"}<bdi>{next.title}</bdi></Link>}</div>
  </nav>;
}
