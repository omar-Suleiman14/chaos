import type { Metadata } from "next";
import { Suspense } from "react";
import { fetchCourseLesson, fetchHomeCourse, fetchPublicLesson, fetchPublicLessonResult } from "@/lib/learn/server";
import { lessonMetadata, lessonPath, lessonStructuredData } from "@/lib/learn/seo";
import { serializeStructuredData } from "@/lib/seo";
import { canonicalUrl, sectionOrigin } from "@/lib/hosts";
import LessonPage from "./LessonPage";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const lesson = await fetchPublicLesson(id);
  // No backend to ask yet: stay out of search results rather than guess.
  if (lesson === undefined) return { title: "Lesson", alternates: { canonical: canonicalUrl(lessonPath(id)) }, robots: { index: false, follow: false } };
  return lessonMetadata(lesson);
}

export default async function PublicLessonRoute({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const preview = query.preview === "draft";
  const linkedCourse = typeof query.course === "string" ? query.course : null;
  // A plain link to a lesson in a public course opens inside that course. Deciding it here, from
  // shared cached reads, saves the reader a placeholder, a client query and a second navigation.
  const [lesson, home, initial] = await Promise.all([
    fetchPublicLesson(id),
    preview || linkedCourse ? null : fetchHomeCourse(id),
    preview || linkedCourse ? null : fetchPublicLessonResult(id),
  ]);
  const courseId = preview ? null : linkedCourse ?? home ?? null;
  const initialCourseLesson = courseId ? await fetchCourseLesson(courseId, id) : null;
  const structured = lesson ? lessonStructuredData(lesson, sectionOrigin("learn")) : null;
  return (
    <>
      {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(structured) }} />}
      <Suspense fallback={null}>
        <LessonPage id={id} homeCourse={home === undefined ? undefined : home} initial={courseId ? initialCourseLesson : initial} />
      </Suspense>
    </>
  );
}
