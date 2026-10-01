"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { GraduationCap } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useCopy } from "@/lib/i18n";
import { courseCopy, coverStyle } from "./shared";
import "./courses.css";

const copy = {
  en: { empty: "No courses yet", emptyBody: "Write lessons, put them in order and publish them as a course." },
  ar: { empty: "لا دورات بعد", emptyBody: "اكتب الدروس ورتّبها وانشرها كدورة." },
};

/** The Courses tab of the library: every course that isn't archived. */
export default function LibraryCourses({ onNew, busy }: { onNew: () => void; busy?: boolean }) {
  const t = useCopy(courseCopy), c = useCopy(copy);
  const courses = useQuery(api.courses.listMine)?.filter((x) => !x.archived);
  if (courses === undefined) return <p className="text-muted-foreground" role="status">{t.loading}</p>;
  if (!courses.length) return (
    <div className="ws-empty ws-page">
      <span className="ws-empty__art"><GraduationCap size={24} /></span>
      <h2 className="text-xl font-semibold">{c.empty}</h2>
      <p className="text-muted-foreground max-w-sm">{c.emptyBody}</p>
      <button type="button" className="ws-btn ws-btn--primary mt-3" onClick={onNew} disabled={busy}>{busy ? t.creating : t.new}</button>
    </div>
  );
  return (
    <div className="cx-grid">
      {courses.map((course) => (
        <Link key={course.id} href={`/dashboard/courses/${course.id}`} className="cx-card">
          <div className="cx-cover" style={coverStyle(course.id, course.coverUrl)}><span className="cx-cover__badge">{!course.published ? t.draft : course.visibility === "public" ? t.live : t.privateLive}</span></div>
          <div className="cx-body"><span className="cx-title">{course.title}</span><span className="cx-meta">{t.lessons(course.lessons)}</span></div>
        </Link>
      ))}
    </div>
  );
}
