"use client";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Link from "@/components/site/SiteLink";
import InlineQuiz from "@/components/learn/reader/InlineQuiz";
import { useCourseProgress } from "@/lib/learn/courseProgress";
import { useLocale } from "@/lib/i18n";
import { useCourseEnrollment } from "@/lib/learn/courseEnrollment";
import { Lock } from "lucide-react";
export default function CourseOutline({ course }: { course: NonNullable<FunctionReturnType<typeof api.courses.getPublic>> }) {
  const progress = useCourseProgress(course.id), { locale } = useLocale(), ar = locale === "ar";
  // Lessons open once the learner starts the course (see CourseStart).
  const locked = !useCourseEnrollment(course.id).state?.enrolled;
  const assigned = new Set(course.modules.flatMap(m => m.lessonIds));
  const groups = [...course.modules, { id: "ungrouped", title: "", lessonIds: course.lessons.filter(l => !assigned.has(l.id)).map(l => l.id), assessments: [] }];
  return <div className="cp-modules">{groups.filter(m => m.lessonIds.length || m.assessments.length).map(module => {
    // Numbering restarts in each module: Anatomy 1–3, then Physiology 1–2.
    const lessonIds = module.lessonIds.filter(id => course.lessons.some(l => l.id === id));
    const count = lessonIds.filter(id => progress[id]?.completed).length;
    return <section key={module.id} className="cp-module">{module.title && <header><h3 dir="auto">{module.title}</h3><p>{ar ? `${count}/${lessonIds.length} دروس مكتملة` : `${count}/${lessonIds.length} lessons completed`}</p></header>}
      <ol className="cp-lessons">{lessonIds.map((id, index) => { const lesson = course.lessons.find(l => l.id === id)!; return <li key={id}>{(() => {
        const body = <><span className="cp-lesson__no" aria-label={progress[id]?.completed ? (ar ? "مكتمل" : "Completed") : undefined}>{progress[id]?.completed ? "✓" : index + 1}</span><span><span className="cp-lesson__title" dir="auto">{lesson.title}</span>{lesson.description && <span className="cp-lesson__desc block" dir="auto">{lesson.description}</span>}</span></>;
        return locked
          ? <div className="cp-lesson" data-locked="true" aria-disabled="true">{body}<Lock size={16} className="cp-lesson__lock" aria-label={ar ? "مقفل حتى تبدأ الدورة" : "Locked until you start the course"} /></div>
          : <Link className="cp-lesson" href={`/learn/${id}?course=${course.id}`}>{body}</Link>;
      })()}</li>; })}</ol>
      {module.assessments.map(asset => <InlineQuiz key={`${asset.kind}:${asset.id}`} asset={asset} />)}
    </section>;
  })}</div>;
}
