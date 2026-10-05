"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { createPortal } from "react-dom";
import { sfx } from "@/lib/sfx";
import { useLocale } from "@/lib/i18n";

/** Apple Pay–style confirmation: the page frosts over, a blue circle springs in and a white check draws, then it fades away. */
function CompletionHud({ label, onDone }: { label: string; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const leave = window.setTimeout(() => setLeaving(true), 1500);
    const close = window.setTimeout(onDone, 1830);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(leave); window.clearTimeout(close); window.removeEventListener("keydown", onKey); };
  }, [onDone]);
  return createPortal(
    <div className="lx-hud" data-leaving={leaving || undefined} onClick={onDone} role="status" aria-live="polite">
      <svg className="lx-hud__mark" viewBox="0 0 72 72" aria-hidden>
        <circle className="lx-hud__fill" cx="36" cy="36" r="36" />
        <path className="lx-hud__check" d="M22 37.5 31.5 47 50 27" />
      </svg>
      <span className="lx-hud__label">{label}</span>
    </div>,
    document.body,
  );
}

export default function CompletionAction({ completed, disabled, onComplete, onReset, completionSound = "lesson_complete" }: { completed: boolean; disabled: boolean; onComplete: () => Promise<void>; onReset: () => Promise<void>; completionSound?: "lesson_complete" | "course_complete" }) {
  const { locale } = useLocale(), ar = locale === "ar";
  const [busy, setBusy] = useState(false), [celebrating, setCelebrating] = useState(false), [hud, setHud] = useState(false);
  const closeHud = useCallback(() => setHud(false), []);
  const done = completed || celebrating;
  const label = completionSound === "course_complete" ? (ar ? "اكتملت الدورة" : "Course completed") : (ar ? "اكتمل الدرس" : "Lesson completed");
  return <div className="lx-completion">
    <div className="lx-actions">
      {done ? <><span className="lx-completion-success" role="status"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="12" /><path d="m7 12.5 3.2 3.2L17 9" /></svg>{ar ? "اكتمل الدرس" : "Lesson completed"}</span><button type="button" className="lx-link" disabled={busy} onClick={async () => { setBusy(true); try { await onReset(); setCelebrating(false); } catch (err) { toast.error(err); } finally { setBusy(false); } }}>{ar ? "ابدأ من جديد" : "Start over"}</button></> : <button type="button" className="ws-btn ws-btn--primary lx-complete-button" disabled={disabled || busy} onClick={async () => {
        sfx.unlock(); setBusy(true);
        try {
          await onComplete(); setCelebrating(true); setHud(true);
          // Chime as the check draws, like Apple Pay.
          window.setTimeout(() => sfx.play(completionSound, "soft"), 260);
        }
        catch (err) { toast.error(err); }
        finally { setBusy(false); }
      }}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "أكمل الدرس" : "Complete lesson")}</button>}
    </div>
    {hud && <CompletionHud label={label} onDone={closeHud} />}
  </div>;
}
