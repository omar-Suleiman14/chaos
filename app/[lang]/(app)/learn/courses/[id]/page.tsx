import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { fetchPublicCourse } from "@/lib/learn/server";
import { pageMetadata } from "@/lib/seo";
import { siteUrl } from "@/lib/site";
import { coverStyle } from "@/components/courses/shared";
import { CourseOrLessonIcon } from "@/components/learn/icons";
import { SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import "@/app/landing.css";
import "@/components/courses/courses.css";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await fetchPublicCourse(id);
  if (!course) return { title: "Course", robots: { index: false, follow: false } };
  const description = course.description || `A free course in Chaos Learn with ${course.lessons.length} lessons.`;
  const meta = pageMetadata(course.title, description, `/learn/courses/${course.id}`);
  // Social previews can't show SVG, so those courses keep the default card.
  const cover = course.coverUrl && !course.coverUrl.endsWith(".svg") ? [{ url: course.coverUrl, alt: course.title }] : null;
  return { ...meta, openGraph: { ...meta.openGraph, type: "article", ...(cover ? { images: cover } : {}) }, ...(cover ? { twitter: { ...meta.twitter, images: cover } } : {}) };
}

export default async function PublicCoursePage({ params }: Props) {
  const { id } = await params;
  const course = await fetchPublicCourse(id);
  if (!course) notFound();
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Course", name: course.title, description: course.description || undefined,
    url: `${siteUrl}/learn/courses/${course.id}`, inLanguage: course.language, isAccessibleForFree: true,
    provider: { "@type": "Organization", name: "Chaos", url: siteUrl },
    author: { "@type": "Person", name: course.ownerName },
    hasPart: course.lessons.map((l, i) => ({ "@type": "LearningResource", position: i + 1, name: l.title, url: `${siteUrl}/learn/${l.id}` })),
  };
  const first = course.lessons[0];
  const ar = course.language.startsWith("ar");
  const labels = ar
    ? { explore: "Chaos Learn · دورة مجانية", by: "بقلم", lessons: "الدروس", start: "ابدأ الدورة", empty: "لا توجد دروس متاحة للقراءة في هذه الدورة حاليًا.", count: `${course.lessons.length} ${course.lessons.length === 1 ? "درس" : "دروس"}` }
    : { explore: "Chaos Learn · Free course", by: "By", lessons: "Lessons", start: "Start the course", empty: "There are no readable lessons in this course right now.", count: `${course.lessons.length} ${course.lessons.length === 1 ? "lesson" : "lessons"}` };
  return (
    <div className="site-ui">
      <SiteNav />
      <main id="main-content" tabIndex={-1} className="cp" dir={ar ? "rtl" : "ltr"} lang={course.language}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="cp-hero">
        <Link href="/learn" className="cp-kicker">{labels.explore}</Link>
        {/* A real image, like the lesson cover, so the picture isn't cut down to a thin band. */}
        {course.coverUrl
          // eslint-disable-next-line @next/next/no-img-element -- covers can be any https URL a creator pastes
          ? <img className="cp-cover cp-cover--image" src={course.coverUrl} alt="" />
          : <div className="cp-cover" style={coverStyle(course.id)} aria-hidden="true" />}
        {course.icon && <span className="cp-icon" aria-hidden="true"><CourseOrLessonIcon icon={course.icon} size={48} /></span>}
        <h1>{course.title}</h1>
        {course.description && <p>{course.description}</p>}
        <div className="cp-by"><span>{labels.by} <Link href={`/card/${course.ownerUsername}`}>{course.ownerName || `@${course.ownerUsername}`}</Link></span><span aria-hidden="true">·</span><span>{labels.count}</span></div>
        {course.tags.length > 0 && <div className="cp-tags">{course.tags.map((t) => <span key={t}>{t}</span>)}</div>}
      </header>
      <section className="cp-main" aria-labelledby="course-lessons">
        {first && <Link className="cp-start site-btn site-btn--primary" href={`/learn/${first.id}?course=${course.id}`}>{labels.start} <ArrowRight size={18} className="cp-arrow" aria-hidden /></Link>}
        <h2 id="course-lessons" className="cp-outline-title">{labels.lessons}</h2>
        {!first && <p className="cx-state">{labels.empty}</p>}
        <ol className="cp-lessons">
          {course.lessons.map((l, i) => (
            <li key={l.id}>
              <Link className="cp-lesson" href={`/learn/${l.id}?course=${course.id}`}>
                <span className="cp-lesson__no">{i + 1}</span>
                <span><span className="cp-lesson__title">{l.title}</span>{l.description && <span className="cp-lesson__desc block">{l.description}</span>}</span>
                <ArrowRight size={18} className="cp-arrow" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      </section>
      </main>
      <SiteFooter />
    </div>
  );
}
