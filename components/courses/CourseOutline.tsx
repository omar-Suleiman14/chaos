"use client";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Link from "@/components/site/SiteLink";
import InlineQuiz from "@/components/learn/reader/InlineQuiz";
import { useCourseProgress } from "@/lib/learn/courseProgress";
import { useLocale } from "@/lib/i18n";
export default function CourseOutline({ course }: { course: NonNullable<FunctionReturnType<typeof api.courses.getPublic>> }) {
  const progress = useCourseProgress(course.id), { locale } = useLocale(), ar = locale === "ar";
  const assigned = new Set(course.modules.flatMap(m => m.lessonIds));
  const groups = [...course.modules, { id: "ungrouped", title: "", lessonIds: course.lessons.filter(l => !assigned.has(l.id)).map(l => l.id), assessments: [] }];
  return <div className="cp-modules">{groups.filter(m => m.lessonIds.length || m.assessments.length).map(module => {
    const count = module.lessonIds.filter(id => progress[id]?.completed).length;
    return <section key={module.id} className="cp-module">{module.title && <header><h3 dir="auto">{module.title}</h3><p>{ar ? `${count}/${module.lessonIds.length} دروس مكتملة` : `${count}/${module.lessonIds.length} lessons completed`}</p></header>}
      <ol className="cp-lessons">{module.lessonIds.map(id => { const lesson = course.lessons.find(l => l.id === id); if (!lesson) return null; return <li key={id}><Link className="cp-lesson" href={`/learn/${id}?course=${course.id}`}><span className="cp-lesson__no" aria-label={progress[id]?.completed ? (ar ? "مكتمل" : "Completed") : undefined}>{progress[id]?.completed ? "✓" : course.lessons.indexOf(lesson) + 1}</span><span><span className="cp-lesson__title" dir="auto">{lesson.title}</span>{lesson.description && <span className="cp-lesson__desc block" dir="auto">{lesson.description}</span>}</span></Link></li>; })}</ol>
      {module.assessments.map(asset => <InlineQuiz key={`${asset.kind}:${asset.id}`} asset={asset} />)}
    </section>;
  })}</div>;
}
