import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { fetchPublicCourse } from "@/lib/learn/server";
import { pageMetadata } from "@/lib/seo";
import { siteUrl } from "@/lib/site";
import { coverStyle } from "@/components/courses/shared";
import "@/components/courses/courses.css";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await fetchPublicCourse(id);
  if (!course) return { title: "Course", robots: { index: false, follow: false } };
  const description = course.description || `A free course on Chaos with ${course.lessons.length} lessons.`;
  const meta = pageMetadata(course.title, description, `/learn/courses/${course.id}`);
  return { ...meta, openGraph: { ...meta.openGraph, type: "article", ...(course.coverUrl ? { images: [{ url: course.coverUrl }] } : {}) } };
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
  return (
    <div className="cp" dir={course.language.startsWith("ar") ? "rtl" : "ltr"} lang={course.language}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="cp-hero" style={coverStyle(course.id, course.coverUrl)}>
        <Link href="/learn" className="cp-kicker" style={{ textDecoration: "none" }}>Chaos · Free course</Link>
        <h1>{course.title}</h1>
        {course.description && <p>{course.description}</p>}
        <div className="cp-by">By <Link href={`/card/${course.ownerUsername}`}>{course.ownerName || `@${course.ownerUsername}`}</Link> · {course.lessons.length} {course.lessons.length === 1 ? "lesson" : "lessons"}</div>
        {course.tags.length > 0 && <div className="cp-tags">{course.tags.map((t) => <span key={t}>{t}</span>)}</div>}
      </header>
      <main className="cp-main">
        {first && <Link className="cp-start" href={`/learn/${first.id}?course=${course.id}`}>Start the course <ArrowRight size={18} aria-hidden /></Link>}
        <ol className="cp-lessons">
          {course.lessons.map((l, i) => (
            <li key={l.id}>
              <Link className="cp-lesson" href={`/learn/${l.id}?course=${course.id}`}>
                <span className="cp-lesson__no">{i + 1}</span>
                <span><span className="cp-lesson__title">{l.title}</span>{l.description && <span className="cp-lesson__desc block">{l.description}</span>}</span>
                <ArrowRight size={18} aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
