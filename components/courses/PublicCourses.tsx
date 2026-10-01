"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCopy } from "@/lib/i18n";
import { courseCopy, coverStyle } from "./shared";
import "./courses.css";

const copy = {
  en: { title: "Free courses", lead: "Published courses from the Chaos community. Open a course to see its lessons.", empty: "No public courses yet. Courses appear here when authors publish them." },
  ar: { title: "دورات مجانية", lead: "دورات منشورة من مجتمع Chaos. افتح الدورة للاطلاع على دروسها.", empty: "لا توجد دورات عامة بعد. تظهر الدورات هنا عندما ينشرها كتّابها." },
};

/** Native published course directory with explicit loading and empty states. */
export default function PublicCourses() {
  const t = useCopy(courseCopy), c = useCopy(copy);
  const courses = useQuery(api.courses.listPublic, { limit: 12 });
  return (
    <section className="cx-directory" aria-labelledby="public-courses" aria-busy={courses === undefined}>
      <h2 id="public-courses" className="cx-directory__title">{c.title}</h2>
      <p className="cx-directory__lead">{c.lead}</p>
      {courses === undefined ? <p className="cx-state" role="status">{t.loading}</p> : courses.length === 0 ? <p className="cx-state" role="status">{c.empty}</p> : <div className="cx-grid">
        {courses.map((course) => (
          <Link key={course.id} href={`/learn/courses/${course.id}`} className="cx-card">
            <div className="cx-cover" style={coverStyle(course.id, course.coverUrl)} aria-hidden="true" />
            <div className="cx-body"><span className="cx-title">{course.title}</span>{course.description && <span className="cx-meta line-clamp-2">{course.description}</span>}<span className="cx-meta">{t.lessons(course.lessons)}</span></div>
          </Link>
        ))}
      </div>}
    </section>
  );
}
