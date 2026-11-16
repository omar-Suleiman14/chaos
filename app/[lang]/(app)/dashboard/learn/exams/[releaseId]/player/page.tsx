"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useConvexAuth } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { LiveExamPlayer } from "@/components/exams/LiveExamPlayer";
import { useLocale } from "@/lib/i18n";
import "@/components/courses/courses.css";

function Player() {
  const { releaseId } = useParams<{ releaseId: string }>();
  const attempt = useSearchParams().get("attempt");
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { locale } = useLocale();
  const ar = locale === "ar";
  if (isLoading) return <p>{ar ? "جارٍ التحميل…" : "Loading…"}</p>;
  if (!isAuthenticated || !attempt) return <main className="lx-page">
    <p>{ar ? "افتح الامتحان من صفحة القواعد." : "Open the exam from its rules page."}</p>
    <Link href={"/dashboard/learn/exams/" + releaseId}>{ar ? "العودة إلى القواعد" : "Back to exam rules"}</Link>
  </main>;
  return <main className="lx-page"><LiveExamPlayer attemptId={attempt as Id<"examAttempts">} locale={ar ? "ar" : "en"} /></main>;
}
export default function StudentExamPage() {
  return <Suspense fallback={<p>Loading…</p>}><Player /></Suspense>;
}
