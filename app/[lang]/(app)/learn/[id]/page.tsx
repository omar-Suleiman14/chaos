import type { Metadata } from "next";
import { Suspense } from "react";
import { fetchPublicLesson } from "@/lib/learn/server";
import { lessonMetadata, lessonPath, lessonStructuredData } from "@/lib/learn/seo";
import { serializeStructuredData } from "@/lib/seo";
import { canonicalUrl, sectionOrigin } from "@/lib/hosts";
import LessonPage from "./LessonPage";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const lesson = await fetchPublicLesson(id);
  // No backend to ask yet: stay out of search results rather than guess.
  if (lesson === undefined) return { title: "Lesson", alternates: { canonical: canonicalUrl(lessonPath(id)) }, robots: { index: false, follow: false } };
  return lessonMetadata(lesson);
}

export default async function PublicLessonRoute({ params }: Props) {
  const { id } = await params;
  const lesson = await fetchPublicLesson(id);
  const structured = lesson ? lessonStructuredData(lesson, sectionOrigin("learn")) : null;
  return (
    <>
      {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(structured) }} />}
      <Suspense fallback={null}><LessonPage id={id} initialLesson={lesson ?? null} /></Suspense>
    </>
  );
}
