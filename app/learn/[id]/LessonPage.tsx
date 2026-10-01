"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import LessonReader, { UnavailableLesson } from "@/components/learn/reader/LessonReader";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { useLearnViewer, useLesson } from "@/lib/learn/data";
import { useCopy } from "@/lib/i18n";

const copy = { en: { loading: "Opening lesson…" }, ar: { loading: "جارٍ فتح الدرس…" } };

export default function LessonPage({ id }: { id: string }) {
  const t = useCopy(copy);
  const lesson = useLesson(id);
  const viewer = useLearnViewer();
  const preview = useSearchParams().get("preview") === "draft";
  const isOwner = !!lesson && lesson.ownerId === viewer?.id;
  const title = lesson ? (preview && isOwner ? lesson.draft : lesson.published ?? lesson.draft).meta.title : "";
  useEffect(() => { if (title) document.title = `${title} · Chaos`; }, [title]);
  if (lesson === undefined) return <PageSkeleton label={t.loading} />;
  // Removed lessons stay visible to their owner (with the moderation notice) and nobody else.
  if (lesson === null || (!isOwner && (lesson.moderation === "removed" || lesson.moderation === "unavailable"))) return <UnavailableLesson backHref={viewer?.signedIn ? "/dashboard/learn" : "/"} />;
  if (!isOwner && !lesson.published) return <UnavailableLesson backHref={viewer?.signedIn ? "/dashboard/learn" : "/"} />;
  return <LessonReader lesson={lesson} previewDraft={preview && isOwner} backHref={isOwner ? `/dashboard/learn/lessons/${lesson.id}` : "/learn"} />;
}
