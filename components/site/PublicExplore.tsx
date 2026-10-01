"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { SiteNav, SiteFooter } from "./SiteChrome";
import PublicCourses from "@/components/courses/PublicCourses";
import { isListed, usePublicLessons } from "@/lib/learn/data";
import { useCopy } from "@/lib/i18n";
import "@/app/landing.css";

const copy = {
  en: { title: "Chaos Learn", lead: "Free public courses and lessons from the Chaos community. Explore without signing in. Check authors and sources for anything you rely on.", search: "Search lessons", placeholder: "Search by topic…", lessons: "Community lessons", loading: "Loading lessons…", empty: "No lessons found. Try another topic, or come back as authors publish more." },
  ar: { title: "Chaos Learn", lead: "دورات عامة مجانية ودروس من مجتمع Chaos. استكشف دون تسجيل الدخول. تحقّق من الكتّاب والمصادر فيما تعتمد عليه.", search: "ابحث في الدروس", placeholder: "ابحث بالموضوع…", lessons: "دروس المجتمع", loading: "جارٍ تحميل الدروس…", empty: "لا توجد دروس مطابقة. جرّب موضوعًا آخر أو عد عندما ينشر الكتّاب المزيد." },
};

export default function PublicExplore() {
  const t = useCopy(copy);
  const [query, setQuery] = useState("");
  const listed = usePublicLessons({ q: query.trim() || undefined })?.filter(isListed);
  return <div className="site-ui">
    <SiteNav />
    <main id="main-content" tabIndex={-1}>
      <section className="site-section" aria-labelledby="learn-title">
        <div className="site-section-heading"><h1 id="learn-title" className="site-h2">{t.title}</h1><p>{t.lead}</p></div>
        <div id="course-directory" className="mt-10"><PublicCourses /></div>
        <search id="lesson-search" className="mt-10" aria-label={t.search}>
          <label className="ws-search"><Search size={16} aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t.placeholder} aria-label={t.search} /></label>
        </search>
        <h2 className="mt-8 text-lg font-semibold">{t.lessons}</h2>
        {listed === undefined ? <p role="status">{t.loading}</p> : listed.length === 0 ? <p role="status">{t.empty}</p> :
          <div className="site-features">{listed.map(lesson => <article key={lesson.id} className="site-feature">
            <h3><Link href={"/learn/" + encodeURIComponent(lesson.id)}>{lesson.published!.meta.title}</Link></h3>
            {lesson.published!.meta.description && <p>{lesson.published!.meta.description}</p>}
            <p>{lesson.ownerName}</p>
          </article>)}</div>}
      </section>
    </main>
    <SiteFooter />
  </div>;
}
