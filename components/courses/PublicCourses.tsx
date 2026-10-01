"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCopy } from "@/lib/i18n";
import { courseCopy, coverStyle } from "./shared";
import "./courses.css";

const copy = { en: { title: "Free courses", lead: "Complete courses anyone can take." }, ar: { title: "دورات مجانية", lead: "دورات كاملة يمكن لأي أحد أخذها." } };

/** Published public courses for Explore. Hidden when there are none yet. */
export default function PublicCourses() {
  const t = useCopy(courseCopy), c = useCopy(copy);
  const courses = useQuery(api.courses.listPublic, { limit: 12 });
  if (!courses?.length) return null;
  return (
    <section className="mb-10" aria-labelledby="public-courses">
      <h2 id="public-courses" className="text-lg font-semibold">{c.title}</h2>
      <p className="lx-help mb-3">{c.lead}</p>
      <div className="cx-grid">
        {courses.map((course) => (
          <Link key={course.id} href={`/learn/courses/${course.id}`} className="cx-card">
            <div className="cx-cover" style={coverStyle(course.id, course.coverUrl)} />
            <div className="cx-body"><span className="cx-title">{course.title}</span>{course.description && <span className="cx-meta line-clamp-2">{course.description}</span>}<span className="cx-meta">{t.lessons(course.lessons)}</span></div>
          </Link>
        ))}
      </div>
    </section>
  );
}
