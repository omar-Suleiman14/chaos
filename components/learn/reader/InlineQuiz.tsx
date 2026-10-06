"use client";
import { useLessonActivity } from "./ActivityContext";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useQuery } from "@/lib/convexCache";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import Link from "@/components/site/SiteLink";
import QueryErrorBoundary from "@/components/forms/QueryErrorBoundary";
import { localeDir } from "@/lib/locale";
import { BlockPlaceholder, useNearViewport } from "./LazyBlock";
const Form = dynamic(() =>
  import("@/components/forms/respond/RespondPage").then((m) => m.RespondToForm),
);
const Quiz = dynamic(() => import("@/components/quizzes/QuizPlayer"));
export default function InlineQuiz({
  asset,
  shareId,
  title,
}: {
  asset: { kind: "form" | "quiz"; id: string };
  shareId?: string;
  title?: string;
}) {
  const report = useLessonActivity();
  const { locale } = useLocale();
  const ar = locale === "ar";
  // Classic quizzes still open on request; forms show their questions straight away.
  const [started, setStarted] = useState(false);
  const [view, setView] = useQuizView();
  // Loaded when the reader scrolls near it, not with the lesson (components/learn/reader/LazyBlock.tsx).
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const details = useQuery(api.learnFrontend.embeddedQuiz, near ? {
    asset:
      asset.kind === "form"
        ? { kind: "form", id: asset.id as Id<"forms"> }
        : { kind: "quiz", id: asset.id as Id<"quizzes"> },
  } : "skip");
  if (details === undefined)
    return <div ref={ref}><BlockPlaceholder label={ar ? "جارٍ تحميل التدريب…" : "Loading practice…"} height={280} /></div>;
  if (!details)
    return (
      <p className="lx-muted">
        {ar ? "هذا الاختبار غير متاح." : "This quiz is unavailable."}
      </p>
    );
  const form = asset.kind === "form";
  return (
    <section className="lx-inline-quiz" data-view={form ? view : "full"} aria-label={title || details.title} dir={localeDir(locale)}>
      <header className="lx-inline-quiz__head">
        <div className="lx-inline-quiz__title">
          <strong dir="auto">{title || details.title}</strong>
          <span className="lx-muted">{ar ? `${details.questionCount} سؤال` : `${details.questionCount} questions`} · <Link className="lx-link" href={details.href}>{ar ? "افتح الاختبار الكامل" : "Open full quiz"}</Link></span>
        </div>
        {form ? (
          <div className="lx-inline-quiz__views" role="group" aria-label={ar ? "طريقة العرض" : "View"}>
            {(["minimal", "full"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                {v === "minimal" ? (ar ? "مختصر" : "Minimal") : (ar ? "كامل" : "Full")}
              </button>
            ))}
          </div>
        ) : (
          <button type="button" className="ws-btn ws-btn--primary ws-btn--sm" aria-expanded={started} onClick={() => setStarted(!started)}>
            {started ? (ar ? "إغلاق التدريب" : "Close practice") : (ar ? "ابدأ التدريب" : "Start practice")}
          </button>
        )}
      </header>
      {(form || started) && <QueryErrorBoundary key={`${asset.kind}:${asset.id}:${view}`}>
        {form ? (
          <Form shareId={details.shareId || shareId || ""} inline minimal={view === "minimal"} studyProgress onComplete={() => report(asset)} />
        ) : (
          <Quiz quizId={asset.id as Id<"quizzes">} inline onComplete={() => report(asset)} />
        )}</QueryErrorBoundary>}
    </section>
  );
}

const VIEW_KEY = "chaos-inline-quiz-view";
/** Minimal by default; a reader who prefers the full form keeps that choice on this device. */
function useQuizView(): ["minimal" | "full", (view: "minimal" | "full") => void] {
  const [view, setView] = useState<"minimal" | "full">("minimal");
  useEffect(() => { try { if (localStorage.getItem(VIEW_KEY) === "full") setView("full"); } catch { /* storage unavailable */ } }, []);
  return [view, (next) => { setView(next); try { localStorage.setItem(VIEW_KEY, next); } catch { /* storage unavailable */ } }];
}
