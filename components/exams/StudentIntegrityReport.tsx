"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const copy = {
  en: { title: "Browser event record", empty: "No retained browser events.",
    help: "These events do not prove misconduct. You may add an explanation for a teacher to review.",
    label: "Explanation (10–500 characters)", send: "Send explanation", saved: "Explanation sent.",
    failed: "Could not send your explanation. Reload and try again.", loading: "Loading…", reviews: "Human reviews" },
  ar: { title: "سجل أحداث المتصفح", empty: "لا توجد أحداث محفوظة للمتصفح.",
    help: "هذه الأحداث لا تثبت المخالفة. يمكنك إضافة توضيح ليراجعه المدرس.",
    label: "التوضيح (من ١٠ إلى ٥٠٠ حرف)", send: "إرسال التوضيح", saved: "تم إرسال التوضيح.",
    failed: "تعذر إرسال التوضيح. أعد التحميل وحاول مجددًا.", loading: "جارٍ التحميل…", reviews: "المراجعات البشرية" },
} as const;

export function StudentIntegrityReport({ attemptId, locale }: {
  attemptId: Id<"examAttempts">; locale: "en" | "ar";
}) {
  const t = copy[locale];
  const events = useQuery(api.examIntegrity.getMine, { attemptId });
  const cases = useQuery(api.examInvigilation.myReport, { attemptId });
  const explain = useMutation(api.examInvigilation.explainEvent);
  const [selected, setSelected] = useState("");
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <section className="cb-section grid gap-3" aria-label={t.title}>
    <h2 className="font-semibold">{t.title}</h2><p className="cb-note">{t.help}</p>
    {!events || !cases ? <p>{t.loading}</p> : <>
      {cases.length > 0 && <div className="grid gap-2"><h3 className="font-medium">{t.reviews}</h3>
        {cases.map(row => <p key={row.eventId} className="rounded border border-border p-2" dir="auto">
          {row.disposition}{row.studentExplanation ? " · " + row.studentExplanation : ""}
        </p>)}</div>}
      {!events.length && <p>{t.empty}</p>}
      <div className="grid gap-2">{events.map(event => <button key={event.eventId} type="button"
        className="rounded border border-border p-2 text-start" aria-pressed={selected === event.eventId}
        onClick={() => { setSelected(event.eventId); setText(""); setMessage(""); }}>
        {new Date(event.observedAt).toLocaleString(locale === "ar" ? "ar-EG" : "en-US")} · {event.kind} · {event.decision}
      </button>)}</div>
      {selected && <div className="grid gap-2">
        {cases.find(row => row.eventId === selected)?.studentExplanation &&
          <p dir="auto">{cases.find(row => row.eventId === selected)?.studentExplanation}</p>}
        <label className="grid gap-1">{t.label}<textarea className="kb-input" maxLength={500} value={text}
          onChange={event => setText(event.target.value)} /></label>
        <button type="button" className="ws-btn ws-btn--ghost w-fit" disabled={busy || text.trim().length < 10}
          onClick={() => {
            setBusy(true); setMessage("");
            void explain({ attemptId, eventId: selected,
              expectedRevision: cases.find(row => row.eventId === selected)?.revision ?? 0, explanation: text })
              .then(() => { setText(""); setMessage(t.saved); })
              .catch(() => setMessage(t.failed)).finally(() => setBusy(false));
          }}>{t.send}</button>
        {message && <output>{message}</output>}
      </div>}
    </>}
  </section>;
}
