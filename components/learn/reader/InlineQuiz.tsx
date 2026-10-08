"use client";
import { useLessonActivity } from "./ActivityContext";
import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { useQuery, warmQuery } from "@/lib/convexCache";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import Link from "@/components/site/SiteLink";
import QueryErrorBoundary from "@/components/forms/QueryErrorBoundary";
import { localeDir } from "@/lib/locale";
import { BlockPlaceholder, useNearViewport } from "./LazyBlock";
const loadForm = () => import("@/components/forms/respond/RespondPage").then((m) => m.RespondToForm);
const Form = dynamic(() => import("@/components/forms/respond/RespondPage").then((m) => m.RespondToForm));
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
  const [view, setView] = useQuizView();
  // Loaded when the reader scrolls near it, not with the lesson (components/learn/reader/LazyBlock.tsx).
  const [ref, near] = useNearViewport<HTMLDivElement>();
  // Quiz blocks name quiz forms; an old classic quiz reference that was not converted shows as unavailable.
  const form = asset.kind === "form";
  const details = useQuery(api.learnFrontend.embeddedQuiz, near && form ? { asset: { kind: "form", id: asset.id as Id<"forms"> } } : "skip");
  // Start code and metadata together instead of waiting for metadata before downloading code.
  useEffect(() => {
    if (!near || !form) return;
    void loadForm().catch(() => {
      // Rendering retries the import and the local error boundary handles a persistent failure.
    });
  }, [near, form]);
  const publicShareId = details?.shareId || shareId;
  useEffect(() => {
    if (near && form && publicShareId) warmQuery(api.respond.getPublicForm, { shareId: publicShareId });
  }, [near, form, publicShareId]);
  if (form && details === undefined)
    return <div ref={ref}><BlockPlaceholder label={ar ? "جارٍ تحميل التدريب…" : "Loading practice…"} height={280} /></div>;
  if (!form || !details)
    return (
      <p className="lx-muted">
        {ar ? "هذا الاختبار غير متاح." : "This quiz is unavailable."}
      </p>
    );
  return (
    <section className="lx-inline-quiz" data-view={view} aria-label={title || details.title} dir={localeDir(locale)}>
      <header className="lx-inline-quiz__head">
        <div className="lx-inline-quiz__title">
          <strong dir="auto">{title || details.title}</strong>
          <span className="lx-muted">{ar ? `${details.questionCount} سؤال` : `${details.questionCount} questions`} · <Link className="lx-link" href={details.href}>{ar ? "افتح الاختبار الكامل" : "Open full quiz"}</Link></span>
        </div>
        <div className="lx-inline-quiz__views" role="group" aria-label={ar ? "طريقة العرض" : "View"}>
          {(["minimal", "full"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "minimal" ? (ar ? "مختصر" : "Minimal") : (ar ? "كامل" : "Full")}
            </button>
          ))}
        </div>
      </header>
      <QueryErrorBoundary key={`${asset.kind}:${asset.id}:${view}`}>
        {/* Keep a lazy player download from hiding the lesson and resetting its scroll. */}
        <Suspense fallback={<BlockPlaceholder label={ar ? "جارٍ تحميل التدريب…" : "Loading practice…"} height={280} />}>
        <Form shareId={details.shareId || shareId || ""} inline minimal={view === "minimal"} studyProgress onComplete={() => report(asset)} />
        </Suspense></QueryErrorBoundary>
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
