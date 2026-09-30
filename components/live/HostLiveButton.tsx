"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { Radio } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FormTheme } from "@/convex/formLogic";
import { parseError } from "@/lib/errors";
import { useCopy, useLocale } from "@/lib/i18n";

const copy = {
  en: {
    host: "Host live", starting: "Starting…",
    errors: {
      LIVE_NOT_PUBLISHED: "Publish this quiz before hosting it live.",
      LIVE_NOT_QUIZ: "Turn on Quiz mode and publish before hosting live.",
      LIVE_NO_QUESTIONS: "Live games need choice questions with two to four options and a correct answer.",
    } as Record<string, string>,
  },
  ar: {
    host: "استضف مباشرة", starting: "جارٍ البدء…",
    errors: {
      LIVE_NOT_PUBLISHED: "انشر هذا الاختبار قبل استضافته مباشرة.",
      LIVE_NOT_QUIZ: "فعّل وضع الاختبار وانشر قبل الاستضافة المباشرة.",
      LIVE_NO_QUESTIONS: "تحتاج الألعاب المباشرة إلى أسئلة اختيار فيها من خيارين إلى أربعة وإجابة صحيحة.",
    } as Record<string, string>,
  },
};

/** Creates a live game for a quiz-mode form or an old quiz and opens the host screen. */
export function useHostLive() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const router = useRouter();
  const create = useMutation(api.live.createGame);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const start = async (target: ({ formId: Id<"forms"> } | { quizId: Id<"quizzes"> }) & { theme?: FormTheme; timeLimitSec?: number; showAnswerLabels?: boolean }): Promise<string | null> => {
    if (pending.current) return null;
    pending.current = true;
    setBusy(true);
    try {
      const gameId = await create({ ...target, language: locale });
      router.push(`/dashboard/live/${gameId}`);
      return null;
    } catch (e) {
      const { code, message } = parseError(e);
      return t.errors[code] ?? message;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { start, busy, label: busy ? t.starting : t.host };
}

export default function HostLiveButton({ formId, onError, className = "ws-btn" }: { formId: Id<"forms">; onError: (message: string) => void; className?: string }) {
  const { start, busy, label } = useHostLive();
  return (
    <button type="button" className={className} disabled={busy} aria-label={label}
      onClick={async () => { const error = await start({ formId }); if (error) onError(error); }}>
      <Radio size={16} aria-hidden="true" /><span className="ws-phone-hide">{label}</span>
    </button>
  );
}
