"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "@/components/site/SiteLink";
import { useLocale } from "@/lib/i18n";
export default function CourseBreadcrumb({ courseId, lessonId }: { courseId?: string | null; lessonId: string }) {
  const course = useQuery(api.courses.getPublic, courseId ? { courseId } : "skip");
  const { locale } = useLocale();
  if (!course) return null;
  const index = course.lessons.findIndex(l => l.id === lessonId);
  if (index < 0) return null;
  const courseModuleItem = course.modules.find(m => m.lessonIds.includes(lessonId as never));
  // Inside a module the position restarts, matching the course outline.
  const siblings = courseModuleItem ? courseModuleItem.lessonIds.filter(id => course.lessons.some(l => l.id === id)) : course.lessons.map(l => l.id);
  const position = siblings.indexOf(lessonId as never) + 1, total = siblings.length;
  return <nav className="lx-course-breadcrumb" aria-label={locale === "ar" ? "مسار الدورة" : "Course breadcrumb"}><Link href={`/learn/courses/${course.id}`} dir="auto">{course.title}</Link><span aria-hidden>›</span>{courseModuleItem && <><bdi>{courseModuleItem.title}</bdi><span aria-hidden>›</span></>}<span>{locale === "ar" ? `الدرس ${position} / ${total}` : `Lesson ${position} / ${total}`}</span></nav>;
}
