"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import LessonReader, { LockedCourseLesson, UnavailableLesson } from "@/components/learn/reader/LessonReader";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { publicUiLesson, useLearnViewer, useLesson, useCourseLesson } from "@/lib/learn/data";
import { useCourseEnrollment } from "@/lib/learn/courseEnrollment";
import { useCopy } from "@/lib/i18n";
import type { CourseLessonResult, PublicLessonResult } from "@/lib/learn/server";

const copy = { en: { loading: "Opening lesson…" }, ar: { loading: "جارٍ فتح الدرس…" } };

/**
 * `initial` is the server's anonymous read of the published lesson (or of the course's copy), shown
 * until the live query answers. `homeCourse` is the public course a plain link belongs to, already
 * looked up on the server; undefined when the server could not ask, and the browser asks instead.
 */
export default function LessonPage({ id, initial, homeCourse: serverHome }: { id: string; initial?: PublicLessonResult | CourseLessonResult | null; homeCourse?: string | null }) {
  const t = useCopy(copy);
  const params = useSearchParams();
  const preview = params.get("preview") === "draft";
  const linked = preview ? null : params.get("course");
  const clientHome = useQuery(api.courses.courseForLesson, preview || linked || serverHome !== undefined ? "skip" : { lessonId: id });
  const home = serverHome !== undefined ? serverHome : clientHome;
  // Lessons in a published course open inside it, so the course's Start step applies to plain links too.
  const courseId = preview ? null : linked ?? home ?? null;
  // Put the course in the address without a navigation: the page already shows the lesson inside it.
  useEffect(() => {
    if (!home || linked || preview) return;
    const url = new URL(window.location.href);
    url.searchParams.set("course", home);
    window.history.replaceState(window.history.state, "", url);
  }, [home, linked, preview]);
  const liveLesson = useLesson(courseId ? undefined : id, !preview);
  const courseLesson = useCourseLesson(courseId, id);
  const initialLesson = useMemo(() => initial ? publicUiLesson(initial) : initial, [initial]);
  const live = courseId ? courseLesson : liveLesson;
  // The server's copy fills in only while live data loads; its "not found" waits for the live answer,
  // since an owner or team member may see what an anonymous read cannot.
  const lesson = live !== undefined ? live : initialLesson ?? undefined;
  const viewer = useLearnViewer();
  const enrollment = useCourseEnrollment(courseId).state;
  const isOwner = !!lesson && lesson.ownerId === viewer?.id;
  const title = lesson ? (preview && isOwner ? lesson.draft : lesson.published ?? lesson.draft).meta.title : "";
  useEffect(() => { if (title) document.title = `${title} · Chaos`; }, [title]);
  if (lesson === undefined || (!courseId && home === undefined && !preview && !linked)) return <PageSkeleton label={t.loading} />;
  // Removed lessons stay visible to their owner (with the moderation notice) and nobody else.
  if (lesson === null || (!isOwner && (lesson.moderation === "removed" || lesson.moderation === "unavailable"))) return <UnavailableLesson backHref={viewer?.signedIn ? "/dashboard/learn" : "/"} />;
  if (!isOwner && !lesson.published) return <UnavailableLesson backHref={viewer?.signedIn ? "/dashboard/learn" : "/"} />;
  if (courseId && !isOwner) {
    if (enrollment === undefined) return <PageSkeleton label={t.loading} />;
    if (!enrollment.enrolled) return <LockedCourseLesson courseId={courseId} title={title} />;
  }
  return <LessonReader key={`${lesson.id}:${lesson.published?.version}:${preview}`} courseId={courseId} lesson={lesson} previewDraft={preview && isOwner} backHref={courseId ? `/learn/courses/${encodeURIComponent(courseId)}` : isOwner && preview ? `/dashboard/learn/lessons/${lesson.id}` : "/learn"} />;
}
