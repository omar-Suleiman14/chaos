"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { WsDialog } from "@/components/workspace/primitives";
import { useLearnActions } from "@/lib/learn/data";
import type { ReportReason, ReportTarget } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    title: "Report", lead: "Reports go to Chaos moderators. The author is not told who reported.",
    reasons: {
      incorrect: ["Incorrect or dangerous information", "Facts that are wrong, outdated or could cause harm if followed."],
      copyright: ["Copyright problem", "Material copied without permission, or missing credit for its owner."],
      spam: ["Spam or advertising", "Promotion, link farming or content unrelated to studying."],
      abuse: ["Abusive or hateful", "Harassment, hate, threats or personal information about someone."],
      other: ["Something else", "Tell us what is wrong."],
    } as Record<ReportReason, [string, string]>,
    policy: "How copyright reports work", details: "Details", detailsHelp: (r: ReportReason): string => r === "incorrect" ? "Say what is wrong and, if you can, a source that shows the correct information." : r === "copyright" ? "Who owns the material and where it was originally published." : "Anything that helps a moderator understand.",
    required: "Please add a few words so a moderator can act on it.", send: "Send report", cancel: "Cancel", sent: "Thanks. A moderator will review it.", close: "Close",
  },
  ar: {
    title: "إبلاغ", lead: "تصل البلاغات إلى مشرفي Chaos. لا يُخبَر الكاتب بمن أبلغ.",
    reasons: {
      incorrect: ["معلومات خاطئة أو خطِرة", "حقائق خاطئة أو قديمة أو قد تسبب ضررًا إن اتُّبعت."],
      copyright: ["مشكلة حقوق نشر", "مادة منسوخة دون إذن، أو دون نسبتها إلى صاحبها."],
      spam: ["رسائل مزعجة أو إعلان", "ترويج أو روابط أو محتوى لا علاقة له بالدراسة."],
      abuse: ["إساءة أو كراهية", "تحرّش أو كراهية أو تهديد أو معلومات شخصية عن أحد."],
      other: ["شيء آخر", "أخبرنا ما المشكلة."],
    } as Record<ReportReason, [string, string]>,
    policy: "كيف تُعالَج بلاغات حقوق النشر", details: "التفاصيل", detailsHelp: (r: ReportReason): string => r === "incorrect" ? "اذكر الخطأ، وإن أمكن مصدرًا يوضّح المعلومة الصحيحة." : r === "copyright" ? "من يملك المادة وأين نُشرت أصلًا." : "أي شيء يساعد المشرف على الفهم.",
    required: "أضف بضع كلمات ليتمكن المشرف من التصرف.", send: "أرسل البلاغ", cancel: "إلغاء", sent: "شكرًا. سيراجعه أحد المشرفين.", close: "إغلاق",
  },
};

export default function ReportDialog({ target, title, onClose }: { target: ReportTarget; title: string; onClose: () => void }) {
  const t = useCopy(copy);
  const actions = useLearnActions();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const needsDetails = reason === "incorrect" || reason === "copyright" || reason === "other";
  return (
    <WsDialog title={`${t.title}: ${title}`} description={t.lead} onClose={onClose}>
      {sent ? (
        <div className="lx-form">
          <output className="lx-notice" data-tone="info" ><CheckCircle2 size={16} aria-hidden />{t.sent}</output>
          <div className="lx-actions" style={{ justifyContent: "flex-end" }}><button type="button" className="ws-btn ws-btn--primary" onClick={onClose}>{t.close}</button></div>
        </div>
      ) : (
        <form className="lx-form" onSubmit={async (e) => {
          e.preventDefault();
          if (!reason || pending) return;
          if (needsDetails && details.trim().length < 5) { setError(t.required); return; }
          setPending(true); setError("");
          try { await actions.report(target, reason, details); setSent(true); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setPending(false); }
        }}>
          <fieldset className="lx-field" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
            <legend className="sr-only">{t.title}</legend>
            {(Object.keys(t.reasons) as ReportReason[]).filter(r => r !== "other").map((r) => (
              <label key={r} aria-label={t.reasons[r][0]} className="lx-panel" style={{ display: "flex", gap: 10, cursor: "pointer", padding: 10, borderColor: reason === r ? "var(--primary)" : undefined }}>
                <input type="radio" name="reason" checked={reason === r} onChange={() => { setReason(r); setError(""); }} />
                <span style={{ display: "grid", gap: 2 }}><strong style={{ fontSize: 14 }}>{t.reasons[r][0]}</strong><span className="lx-muted" style={{ fontWeight: 400 }}>{t.reasons[r][1]}</span></span>
              </label>
            ))}
          </fieldset>
          {reason && (
            <label className="lx-field">{t.details}
              <textarea className="lx-textarea" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} aria-invalid={!!error} aria-describedby="report-help" />
              <small id="report-help">{t.detailsHelp(reason)}</small>
            </label>
          )}
          {reason === "copyright" && <a className="lx-muted" href="/copyright" target="_blank" rel="noopener" style={{ fontSize: 13, textDecoration: "underline" }}>{t.policy}</a>}
          {error && <p className="lx-error" role="alert">{error}</p>}
          <div className="lx-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="ws-btn ws-btn--ghost" onClick={onClose}>{t.cancel}</button>
            <button type="submit" className="ws-btn ws-btn--primary" disabled={!reason || pending}>{t.send}</button>
          </div>
        </form>
      )}
    </WsDialog>
  );
}
