"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "@/components/site/SiteLink";
import { useProgress } from "@/lib/learn/data";
import { useLocale } from "@/lib/i18n";
export default function CourseNavigation({ courseId, lessonId, completed }: { courseId?: string | null; lessonId: string; completed: boolean }) {
  const course = useQuery(api.courses.getPublic, courseId ? { courseId } : "skip");
  const progress = useProgress();
  const { locale } = useLocale(), ar = locale === "ar";
  if (!course) return null;
  const index = course.lessons.findIndex(l => l.id === lessonId);
  if (index < 0) return null;
  const previous = course.lessons[index - 1], next = course.lessons[index + 1];
  const count = course.lessons.filter(l => l.id === lessonId ? completed : progress?.[l.id]?.state === "completed").length;
  const href = (id: string) => `/learn/${id}?course=${encodeURIComponent(course.id)}`;
  return <nav className="lx-course-navigation" aria-label={ar ? "التنقل في الدورة" : "Course navigation"}>
    <Link href={`/learn/courses/${course.id}`} dir="auto">{course.title}</Link>
    <p className="lx-muted" aria-live="polite">{ar ? `${count} / ${course.lessons.length} دروس مكتملة` : `${count} / ${course.lessons.length} lessons completed`}</p>
    <progress value={count} max={course.lessons.length} aria-label={ar ? "تقدم الدورة" : "Course progress"} />
    <div className="lx-actions">{previous && <Link className="ws-btn ws-btn--ghost" href={href(previous.id)}>{ar ? "الدرس السابق" : "Previous lesson"}<bdi>{previous.title}</bdi></Link>}{next && <Link className="ws-btn ws-btn--primary" href={href(next.id)}>{ar ? "تابع إلى الدرس التالي" : "Continue to next lesson"}<bdi>{next.title}</bdi></Link>}</div>
  </nav>;
}
