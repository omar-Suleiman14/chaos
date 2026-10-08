"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import LoadingState from "@/components/LoadingState";
import { useCopy } from "@/lib/i18n";

const copy = { en: { opening: "Opening your quiz…" }, ar: { opening: "جارٍ فتح اختبارك…" } };

/** Old quiz editor and results links (`?id=<quiz>`) lead to the quiz form the quiz became, or to the library. */
export default function ConvertedQuizRedirect({ to }: { to: "edit" | "responses" }) {
  const t = useCopy(copy);
  const router = useRouter();
  const quizId = useSearchParams().get("id");
  const formId = useQuery(api.links.convertedQuiz, quizId ? { quizId } : "skip");
  useEffect(() => {
    if (quizId && formId === undefined) return;
    router.replace(formId ? `/dashboard/forms/${formId}${to === "responses" ? "/responses" : ""}` : "/dashboard?tab=quizzes");
  }, [formId, quizId, router, to]);
  return <LoadingState label={t.opening} />;
}
