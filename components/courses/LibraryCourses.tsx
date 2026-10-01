"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCopy } from "@/lib/i18n";
import { courseCopy, coverStyle } from "./shared";
import "./courses.css";

const copy = { en: { all: "All courses" }, ar: { all: "كل الدورات" } };

/** Recent courses on the library page, beside forms and quizzes. Hidden until there is one. */
export default function LibraryCourses() {
  const t = useCopy(courseCopy), c = useCopy(copy);
  const courses = useQuery(api.courses.listMine)?.filter((x) => !x.archived);
  if (!courses?.length) return null;
  return (
    <section className="mb-8" aria-labelledby="library-courses">
      <div className="flex items-baseline justify-between mb-3">
        <h2 id="library-courses" className="text-base font-semibold">{t.title}</h2>
        <Link href="/dashboard/courses" className="text-sm underline-offset-2 hover:underline">{c.all}</Link>
      </div>
      <div className="cx-grid">
        {courses.slice(0, 4).map((course) => (
          <Link key={course.id} href={`/dashboard/courses/${course.id}`} className="cx-card">
            <div className="cx-cover" style={coverStyle(course.id, course.coverUrl)}><span className="cx-cover__badge">{!course.published ? t.draft : course.visibility === "public" ? t.live : t.privateLive}</span></div>
            <div className="cx-body"><span className="cx-title">{course.title}</span><span className="cx-meta">{t.lessons(course.lessons)}</span></div>
          </Link>
        ))}
      </div>
    </section>
  );
}
