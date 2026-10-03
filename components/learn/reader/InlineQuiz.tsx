"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useQuery } from "@/lib/convexCache";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
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
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [started, setStarted] = useState(false);
  const details = useQuery(api.learnFrontend.embeddedQuiz, {
    asset:
      asset.kind === "form"
        ? { kind: "form", id: asset.id as Id<"forms"> }
        : { kind: "quiz", id: asset.id as Id<"quizzes"> },
  });
  if (details === undefined)
    return (
      <p role="status">{ar ? "جارٍ تحميل التدريب…" : "Loading practice…"}</p>
    );
  if (!details)
    return (
      <p className="lx-muted">
        {ar ? "هذا الاختبار غير متاح." : "This quiz is unavailable."}
      </p>
    );
  return (
    <section className="lx-inline-quiz" aria-label={title || details.title}>
      <header className="lx-panel__row">
        <strong>{title || details.title}</strong>
        <button
          type="button"
          className="ws-btn ws-btn--primary"
          aria-expanded={started}
          onClick={() => setStarted(!started)}
        >
          {started
            ? ar
              ? "إغلاق التدريب"
              : "Close practice"
            : ar
              ? "ابدأ التدريب"
              : "Start practice"}
        </button>
      </header>
      {started &&
        (asset.kind === "form" ? (
          <Form shareId={details.shareId || shareId || ""} inline />
        ) : (
          <Quiz quizId={asset.id as Id<"quizzes">} inline />
        ))}
    </section>
  );
}
