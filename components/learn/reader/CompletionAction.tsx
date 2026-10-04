"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { sfx } from "@/lib/sfx";
import { useLocale } from "@/lib/i18n";

/** Apple Pay–style confirmation: a frosted card where a blue ring fills and a white check draws, then it fades away. */
function CompletionHud({ label, onDone }: { label: string; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const leave = window.setTimeout(() => setLeaving(true), 1900);
    const close = window.setTimeout(onDone, 2200);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(leave); window.clearTimeout(close); window.removeEventListener("keydown", onKey); };
  }, [onDone]);
  return createPortal(
    <div className="lx-hud" data-leaving={leaving || undefined} onClick={onDone}>
      <div className="lx-hud__card" role="status" aria-live="polite">
        <svg className="lx-hud__mark" viewBox="0 0 72 72" aria-hidden>
          <circle className="lx-hud__fill" cx="36" cy="36" r="34" />
          <circle className="lx-hud__ring" cx="36" cy="36" r="34" />
          <path className="lx-hud__check" d="M22 37.5 31.5 47 50 27" />
        </svg>
        <span className="lx-hud__label">{label}</span>
      </div>
    </div>,
    document.body,
  );
}

export default function CompletionAction({ completed, disabled, onComplete, onReset, completionSound = "lesson_complete" }: { completed: boolean; disabled: boolean; onComplete: () => Promise<void>; onReset: () => Promise<void>; completionSound?: "lesson_complete" | "course_complete" }) {
  const { locale } = useLocale(), ar = locale === "ar";
  const [busy, setBusy] = useState(false), [celebrating, setCelebrating] = useState(false), [hud, setHud] = useState(false), [error, setError] = useState("");
  const closeHud = useCallback(() => setHud(false), []);
  const done = completed || celebrating;
  const label = completionSound === "course_complete" ? (ar ? "اكتملت الدورة" : "Course completed") : (ar ? "اكتمل الدرس" : "Lesson completed");
  return <div className="lx-completion">
    <div className="lx-actions">
      {done ? <><span className="lx-completion-success" role="status"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="12" /><path d="m7 12.5 3.2 3.2L17 9" /></svg>{ar ? "اكتمل الدرس" : "Lesson completed"}</span><button type="button" className="lx-link" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await onReset(); setCelebrating(false); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }}>{ar ? "ابدأ من جديد" : "Start over"}</button></> : <button type="button" className="ws-btn ws-btn--primary lx-complete-button" disabled={disabled || busy} onClick={async () => {
        sfx.unlock(); setBusy(true); setError("");
        try {
          await onComplete(); setCelebrating(true); setHud(true);
          // Chime as the check draws, like Apple Pay.
          window.setTimeout(() => sfx.play(completionSound, "soft"), 550);
        }
        catch (err) { setError(err instanceof Error ? err.message : String(err)); }
        finally { setBusy(false); }
      }}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "أكمل الدرس" : "Complete lesson")}</button>}
    </div>
    {hud && <CompletionHud label={label} onDone={closeHud} />}
    {error && <p role="alert" className="lx-error">{error}</p>}
  </div>;
}
