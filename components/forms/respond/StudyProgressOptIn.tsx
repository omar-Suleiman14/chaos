"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Language } from "@/convex/formLogic";
import { parseError } from "@/lib/errors";

/** Offered only by the Learn quiz flow, after a linked completed submission. */
export function StudyProgressOptIn({ responseId, language }: {
  responseId: Id<"formResponses">;
  language: Language;
}) {
  const ingest = useMutation(api.learnPractice.ingestResponse);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [evidenceCount, setEvidenceCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const ar = language === "ar";

  const save = async () => {
    if (pending.current || evidenceCount !== null) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await ingest({ formResponseId: responseId });
      setEvidenceCount(result.evidenceCount);
    } catch (err) {
      setError(parseError(err, ar ? "تعذّر استخدام هذه المحاولة. يجب أن تكون إجابة اختبار مكتملة مرتبطة بحسابك الحالي." : "This attempt could not be used. It must be a completed quiz response linked to your current account.").message);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="form-receipt" lang={language} dir={ar ? "rtl" : "ltr"}>
      {evidenceCount !== null ? (
        <p role="status">{evidenceCount > 0
          ? ar ? "أُضيفت هذه المحاولة إلى تقدّمك الدراسي." : "This attempt was added to your study progress."
          : ar ? "لا توجد أسئلة مرتبطة بمفاهيم دراسية في هذه المحاولة؛ لم يُضف أي تقدّم." : "This attempt has no questions mapped to study concepts; no progress was added."}</p>
      ) : (
        <>
          <p className="text-xs form-muted">{ar ? "يمكنك استخدام هذه المحاولة لتحديث تقدّمك في المفاهيم الدراسية المرتبطة بهذا الاختبار." : "You can use this attempt to update your progress for study concepts linked to this quiz."}</p>
          <button type="button" className="form-btn form-btn-ghost form-btn-sm" disabled={saving} onClick={() => void save()}>
            {saving ? ar ? "جارٍ الحفظ…" : "Saving…" : ar ? "استخدم هذه المحاولة للتقدّم الدراسي" : "Use this attempt for study progress"}
          </button>
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </div>
  );
}
