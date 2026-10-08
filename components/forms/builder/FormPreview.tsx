"use client";

import { useEffect, useMemo, useState } from "react";
import { Monitor, RotateCcw, Smartphone, X } from "lucide-react";
import FormRenderer, { EndingView, themeClass, themeStyle } from "@/components/forms/FormRenderer";
import { gradeQuiz } from "@/convex/formQuiz";
import { useIsPhone } from "@/components/workspace/useIsPhone";
import { useModal } from "@/components/workspace/useModal";
import { selectEnding } from "@/convex/formLogic";
import type { Answers, FormDefinition, Language } from "@/convex/formLogic";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: { startAgain: "Start again", preview: "Preview", close: "Close preview", language: "Language", device: "Device", desktop: "Desktop", phone: "Phone", restart: "Restart" },
  ar: { startAgain: "ابدأ من جديد", preview: "معاينة", close: "أغلق المعاينة", language: "اللغة", device: "الجهاز", desktop: "الحاسوب", phone: "الهاتف", restart: "أعد التشغيل" },
};

/** The form exactly as respondents see it, with answers kept only in memory. */
export function PreviewSurface({ def, language, height, runKey }: { def: FormDefinition; language: Language; height: string; runKey: number }) {
  const t = useCopy(copy);
  const [answers, setAnswers] = useState<Answers>({});
  const [done, setDone] = useState<Answers | null>(null);
  useEffect(() => { setAnswers({}); setDone(null); }, [runKey]);
  const grade = useMemo(() => (done ? gradeQuiz(def, done) : null), [def, done]);

  return (
    <div className={`ws-respondent-preview ws-preview-scroll ${themeClass(def)}`} style={{ ...themeStyle(def), ["--form-stage-h" as string]: height }}>
      {done ? (
        <div className={def.presentation === "conversational" || def.presentation === "swipe" ? "" : "form-page-body"}>
          <EndingView ending={selectEnding(def, done)} def={def} language={language} answers={done} score={grade ? { value: grade.score, max: grade.maxScore } : null}>
            <button type="button" className="form-btn form-btn-ghost form-btn-sm" onClick={() => { setAnswers({}); setDone(null); }}><RotateCcw size={14} /> {t.startAgain}</button>
          </EndingView>
        </div>
      ) : (
        <FormRenderer key={`${runKey}-${def.presentation}-${language}-${def.theme.cover ?? ""}`} definition={def} language={language} answers={answers}
          onAnswer={(id, v) => setAnswers((a) => { const n = { ...a }; if (v === undefined) delete n[id]; else n[id] = v; return n; })}
          onSubmit={() => setDone(answers)} submitLabel={language === "ar" ? "إرسال (معاينة)" : "Submit (preview)"} />
      )}
    </div>
  );
}

/** Full-screen preview with a device switch, opened from the builder header. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- This custom dialog uses the existing focus, Escape and dismissal lifecycle; a native dialog would require a different open and top-layer lifecycle. */
export function FullPreview({ def, onClose }: { def: FormDefinition; onClose: () => void }) {
  const t = useCopy(copy);
  const modal = useModal({ onClose });
  const phone = useIsPhone();
  const [chosen, setDevice] = useState<"desktop" | "mobile">("desktop");
  // On a phone the preview simply is the phone: no frame, no device switch.
  const device = phone ? "desktop" : chosen;
  const [language, setLanguage] = useState<Language>(def.defaultLanguage);
  const [run, setRun] = useState(0);

  return (
    <div ref={modal} tabIndex={-1} className="ws-overlay !p-0 !place-items-stretch !bg-[var(--background)]" role="dialog" aria-modal="true" aria-label={t.preview}>
      <div className="flex flex-col h-[100dvh]">
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 h-14 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0 text-[15px] font-semibold">
            <button type="button" className="ws-icon-button" onClick={onClose} aria-label={t.close}><X size={20} /></button>
            <span className="truncate">{t.preview}</span>
          </div>
          <div className="flex items-center gap-2">
            {def.languages.length > 1 && (
              <fieldset className="ws-segmented"  aria-label={t.language}>
                {def.languages.map((l) => <button key={l} type="button" aria-pressed={language === l} onClick={() => setLanguage(l)}>{l === "ar" ? "العربية" : "English"}</button>)}
              </fieldset>
            )}
            {!phone && <fieldset className="ws-segmented"  aria-label={t.device}>
              <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")} aria-label={t.desktop}><Monitor size={14} /></button>
              <button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")} aria-label={t.phone}><Smartphone size={14} /></button>
            </fieldset>}
            <button type="button" className="ws-btn ws-btn--ghost" onClick={() => setRun((n) => n + 1)} aria-label={t.restart}><RotateCcw size={16} /><span className="ws-phone-hide">{t.restart}</span></button>
          </div>
        </div>
        <div className={`flex-1 min-h-0 ${device === "mobile" ? "grid place-items-center p-4 bg-[var(--ws-canvas-subtle)]" : ""}`}>
          <div className={device === "mobile" ? "ws-preview-frame ws-preview-frame--mobile w-full" : "h-full"}>
            <PreviewSurface def={def} language={language} height={device === "mobile" ? "min(760px, calc(100dvh - 7rem))" : "calc(100dvh - 3.5rem)"} runKey={run} />
          </div>
        </div>
      </div>
    </div>
  );
}
/* oxlint-enable jsx-a11y/prefer-tag-over-role */
