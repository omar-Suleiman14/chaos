"use client";
import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Link from "@/components/site/SiteLink";
import { prefetchLesson } from "@/lib/learn/prefetch";
import InlineQuiz from "@/components/learn/reader/InlineQuiz";
import { useCourseProgress } from "@/lib/learn/courseProgress";
import { useLocale } from "@/lib/i18n";
import { useCourseEnrollment } from "@/lib/learn/courseEnrollment";
import { ChevronDown, Lock } from "lucide-react";
import { useUsableMark } from "@/lib/journeys";

type Course = NonNullable<FunctionReturnType<typeof api.courses.getPublic>>;
type Module = Course["modules"][number];
type Lesson = Course["lessons"][number];
type Progress = ReturnType<typeof useCourseProgress>;

function LessonRows({ ids, lessons, courseId, locked, progress, ar }: {
  ids: Module["lessonIds"]; lessons: Lesson[]; courseId: string; locked: boolean; progress: Progress; ar: boolean;
}) {
  return <ol className="cp-lessons">{ids.map((id, index) => {
    const lesson = lessons.find(l => l.id === id);
    if (!lesson) return null;
    const body = <><span className="cp-lesson__no" aria-label={progress[id]?.completed ? (ar ? "مكتمل" : "Completed") : undefined}>{progress[id]?.completed ? "✓" : index + 1}</span><span><span className="cp-lesson__title" dir="auto">{lesson.title}</span>{lesson.description && <span className="cp-lesson__desc block" dir="auto">{lesson.description}</span>}</span></>;
    return <li key={id}>{locked
      ? <div className="cp-lesson" data-locked="true" aria-disabled="true">{body}<Lock size={16} className="cp-lesson__lock" aria-label={ar ? "مقفل حتى تبدأ الدورة" : "Locked until you start the course"} /></div>
      : <Link className="cp-lesson" href={`/learn/${id}?course=${courseId}`} onPointerEnter={() => prefetchLesson(id, courseId)} onFocus={() => prefetchLesson(id, courseId)} onTouchStart={() => prefetchLesson(id, courseId)}>{body}</Link>}</li>;
  })}</ol>;
}

function Subsection({ section, lessons, courseId, locked, progress, ar }: {
  section: NonNullable<Module["sections"]>[number]; lessons: Lesson[]; courseId: string; locked: boolean; progress: Progress; ar: boolean;
}) {
  const [expanded, setExpanded] = useState(!section.collapsedByDefault);
  const ids = section.lessonIds.filter(id => lessons.some(l => l.id === id));
  if (!ids.length) return null;
  return <section className="cp-subsection">
    <button type="button" className="cp-disclosure" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
      <ChevronDown size={18} className="cp-disclosure__chevron" aria-hidden="true" />
      <span className="cp-disclosure__title" dir="auto">{section.title}</span>
      <span className="cp-disclosure__count">{ids.filter(id => progress[id]?.completed).length}/{ids.length}</span>
    </button>
    {expanded && <div className="cp-subsection__body"><LessonRows ids={ids} lessons={lessons} courseId={courseId} locked={locked} progress={progress} ar={ar} /></div>}
  </section>;
}

function ModuleView({ module, course, progress, locked, ar }: { module: Module; course: Course; progress: Progress; locked: boolean; ar: boolean }) {
  const [expanded, setExpanded] = useState(!module.collapsedByDefault);
  const ids = module.lessonIds.filter(id => course.lessons.some(l => l.id === id));
  const assigned = new Set((module.sections ?? []).flatMap(s => s.lessonIds));
  const other = ids.filter(id => !assigned.has(id));
  const count = ids.filter(id => progress[id]?.completed).length;
  return <section className="cp-module">
    {module.title && <button type="button" className="cp-disclosure cp-disclosure--module" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
      <ChevronDown size={20} className="cp-disclosure__chevron" aria-hidden="true" />
      <span className="cp-disclosure__title" dir="auto">{module.title}</span>
      <span className="cp-disclosure__count">{ar ? `${count}/${ids.length} دروس مكتملة` : `${count}/${ids.length} lessons completed`}</span>
    </button>}
    {(!module.title || expanded) && <div className="cp-module__body">
      {(module.sections ?? []).map(section => <Subsection key={section.id} section={section} lessons={course.lessons} courseId={course.id} locked={locked} progress={progress} ar={ar} />)}
      {other.length > 0 && <LessonRows ids={other} lessons={course.lessons} courseId={course.id} locked={locked} progress={progress} ar={ar} />}
      {module.assessments.map((asset, index) => <details className="cp-assessment" key={`${asset.kind}:${asset.id}`}>
        <summary><ChevronDown size={17} aria-hidden="true" /><span>{ar ? `اختبار الوحدة ${index + 1}` : `Module quiz ${index + 1}`}</span></summary>
        <div className="cp-assessment__body"><InlineQuiz asset={asset} /></div>
      </details>)}
    </div>}
  </section>;
}

export default function CourseOutline({ course }: { course: Course }) {
  const progress = useCourseProgress(course.id), { locale } = useLocale(), ar = locale === "ar";
  const locked = !useCourseEnrollment(course.id).state?.enrolled;
  useUsableMark("course.modules", true);
  const assigned = new Set(course.modules.flatMap(m => m.lessonIds));
  const groups = [...course.modules, { id: "ungrouped", title: "", lessonIds: course.lessons.filter(l => !assigned.has(l.id)).map(l => l.id), assessments: [] }];
  return <div className="cp-modules">{groups.filter(m => m.lessonIds.length || m.assessments.length).map(module =>
    <ModuleView key={module.id} module={module} course={course} progress={progress} locked={locked} ar={ar} />
  )}</div>;
}
