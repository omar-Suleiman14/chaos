"use client";
import { useEffect, useState } from "react";
import { sfx } from "@/lib/sfx";
import { useLocale } from "@/lib/i18n";
export default function CompletionAction({ completed, disabled, onComplete, onReset }: { completed: boolean; disabled: boolean; onComplete: () => Promise<void>; onReset: () => Promise<void> }) {
  const { locale } = useLocale(), ar = locale === "ar";
  const [busy, setBusy] = useState(false), [celebrating, setCelebrating] = useState(false), [sound, setSound] = useState(false), [error, setError] = useState("");
  useEffect(() => { const sync = () => setSound(sfx.isEnabled()); sync(); window.addEventListener("chaos-sfx-change", sync); return () => window.removeEventListener("chaos-sfx-change", sync); }, []);
  const done = completed || celebrating;
  return <div className="lx-completion">
    <div className="lx-actions">
      {done ? <><span className="lx-completion-success" data-animate={celebrating || undefined} role="status"><svg width="28" height="28" viewBox="0 0 32 32" aria-hidden><circle cx="16" cy="16" r="13" /><path d="m9 16 5 5 9-10" /></svg>{ar ? "اكتمل الدرس" : "Lesson completed"}</span><button type="button" className="lx-link" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await onReset(); setCelebrating(false); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }}>{ar ? "ابدأ من جديد" : "Start over"}</button></> : <button type="button" className="ws-btn ws-btn--primary lx-complete-button" disabled={disabled || busy} onClick={async () => {
        sfx.unlock(); setBusy(true); setError("");
        try { await onComplete(); setCelebrating(true); sfx.play("lesson_complete", "soft"); }
        catch (err) { setError(err instanceof Error ? err.message : String(err)); }
        finally { setBusy(false); }
      }}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "أكمل الدرس" : "Complete lesson")}</button>}
    </div>
    <label className="lx-completion-sound"><input type="checkbox" checked={sound} onChange={e => sfx.setEnabled(e.target.checked)} />{ar ? "أصوات الإكمال" : "Completion sounds"}</label>
    {error && <p role="alert" className="lx-error">{error}</p>}
  </div>;
}
