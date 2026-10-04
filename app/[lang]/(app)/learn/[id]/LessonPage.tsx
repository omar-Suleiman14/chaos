"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import LessonReader, { LockedCourseLesson, UnavailableLesson } from "@/components/learn/reader/LessonReader";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { useLearnViewer, useLesson, useCourseLesson } from "@/lib/learn/data";
import { useCourseEnrollment } from "@/lib/learn/courseEnrollment";
import { useCopy } from "@/lib/i18n";

import type { Lesson } from "@/lib/learn/types";

const copy = { en: { loading: "Opening lesson…" }, ar: { loading: "جارٍ فتح الدرس…" } };

export default function LessonPage({ id, initialLesson }: { id: string; initialLesson?: Lesson | null }) {
  const t = useCopy(copy);
  const params = useSearchParams();
  const preview = params.get("preview") === "draft";
  const courseId = preview ? null : params.get("course");
  const liveLesson = useLesson(courseId ? undefined : id);
  const courseLesson = useCourseLesson(courseId, id);
  const lesson = courseId ? courseLesson : liveLesson !== undefined ? liveLesson : initialLesson;
  const viewer = useLearnViewer();
  const enrollment = useCourseEnrollment(courseId).state;
  const isOwner = !!lesson && lesson.ownerId === viewer?.id;
  const title = lesson ? (preview && isOwner ? lesson.draft : lesson.published ?? lesson.draft).meta.title : "";
  useEffect(() => { if (title) document.title = `${title} · Chaos`; }, [title]);
  if (lesson === undefined) return <PageSkeleton label={t.loading} />;
  // Removed lessons stay visible to their owner (with the moderation notice) and nobody else.
  if (lesson === null || (!isOwner && (lesson.moderation === "removed" || lesson.moderation === "unavailable"))) return <UnavailableLesson backHref={viewer?.signedIn ? "/dashboard/learn" : "/"} />;
  if (!isOwner && !lesson.published) return <UnavailableLesson backHref={viewer?.signedIn ? "/dashboard/learn" : "/"} />;
  if (courseId && !isOwner) {
    if (enrollment === undefined) return <PageSkeleton label={t.loading} />;
    if (!enrollment.enrolled) return <LockedCourseLesson courseId={courseId} title={title} />;
  }
  return <LessonReader key={`${lesson.id}:${lesson.published?.version}:${preview}`} courseId={courseId} lesson={lesson} previewDraft={preview && isOwner} backHref={courseId ? `/learn/courses/${encodeURIComponent(courseId)}` : isOwner && preview ? `/dashboard/learn/lessons/${lesson.id}` : "/learn"} />;
}
