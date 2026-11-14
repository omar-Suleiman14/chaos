"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";
import { toast } from "@/lib/toast";

/** Only available inside an owner-checked course exam builder. Queries recheck server ownership. */
export function TeacherExamMonitor({ draftId }: { draftId: Id<"examBuilderDrafts"> }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [selectedId, setSelectedId] = useState<Id<"examAttempts"> | null>(null);
  const [eventId, setEventId] = useState("");
  const [reason, setReason] = useState("");
  const [disposition, setDisposition] = useState<
    "no_action" | "follow_up" | "policy_issue"
  >("no_action");
  const [minutes, setMinutes] = useState(15);
  const [candidateId, setCandidateId] = useState("");
  const [accommodation, setAccommodation] = useState<
    "extra_time" | "breaks_allowed" | "reduced_monitoring"
  >("extra_time");
  const [accommodationMinutes, setAccommodationMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const dashboard = useQuery(api.examInvigilation.listForDraft, { draftId });
  const report = useQuery(api.examInvigilation.report,
    selectedId ? { attemptId: selectedId } : "skip");
  const savedAccommodation = useQuery(api.examInvigilation.teacherAccommodation,
    candidateId.trim() ? { draftId, studentId: candidateId.trim() } : "skip");
  const review = useMutation(api.examInvigilation.reviewEvent);
  const extend = useMutation(api.examInvigilation.extendTime);
  const note = useMutation(api.examInvigilation.noteIntervention);
  const saveAccommodation = useMutation(api.examInvigilation.setAccommodation);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(ar ? "تم حفظ الإجراء" : "Action recorded");
      setReason("");
    } catch (error) {
      toast.error(error, { fallback: ar ? "تعذر حفظ الإجراء" : "Could not record action" });
    } finally {
      setBusy(false);
    }
  };
  const chosen = report?.cases.find(c => c.eventId === eventId);
  const date = (at: number) => new Date(at).toLocaleString(ar ? "ar-EG" : "en-US");
  return <section className="cb-section grid gap-4" aria-labelledby="monitor-heading" dir={ar ? "rtl" : "ltr"}>
    <div className="space-y-1">
      <h2 id="monitor-heading" className="font-semibold">
        {ar ? "مراقبة الامتحان ومراجعة الأحداث" : "Exam monitoring & human review"}
      </h2>
      <p className="cb-note">
        {ar ? "أحداث المتصفح ليست دليلًا قاطعًا على الغش. لا توجد عقوبة أو تسليم تلقائي نتيجة المراقبة."
          : "Browser signals never prove cheating. Monitoring alone cannot penalize, grade or submit an attempt."}
      </p>
    </div>
    {!dashboard ? <p className="cb-note">{ar ? "جارٍ التحميل" : "Loading monitor…"}</p> :
      !dashboard.attempts.length ? <p className="cb-note">
        {ar ? "لا توجد محاولات فعلية بعد. بدء الامتحان ما زال مغلقًا."
          : "No live attempts yet. Secure student entry is still disabled."}
      </p> : <>
        <label className="grid gap-1 text-sm">
          {ar ? "اختر محاولة" : "Select an attempt"}
          <select className="kb-input" value={selectedId ?? ""}
            onChange={e => { setSelectedId(e.target.value as Id<"examAttempts"> || null); setEventId(""); }}>
            <option value="">{ar ? "اختر" : "Select"}</option>
            {dashboard.attempts.map(a => <option key={a.attemptId} value={a.attemptId}>
              {a.studentId} · {a.state}
            </option>)}
          </select>
        </label>
        {dashboard.hasMore && <p role="status" className="cb-note">
          {ar ? "تظهر أول ٥٠ محاولة فقط؛ تحتاج البقية لتصفح لاحق."
            : "Only the first 50 attempts are shown; remaining attempts require pagination."}
        </p>}
      </>}
    {selectedId && report && <>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="cb-note">{ar ? "الحالة" : "State"}</dt><dd>{report.state}</dd></div>
        <div><dt className="cb-note">{ar ? "سياسة التسجيل" : "Integrity policy"}</dt><dd>{report.integrityMode}</dd></div>
        <div><dt className="cb-note">{ar ? "وقت الإغلاق" : "Deadline"}</dt>
          <dd>{report.deadlineAt ? date(report.deadlineAt) : "—"}</dd></div>
      </dl>
      <div className="grid gap-2">
        <h3 className="font-medium">{ar ? "أحداث المتصفح" : "Browser events"}</h3>
        {!report.events.length && <p className="cb-note">{ar ? "لا توجد أحداث" : "No telemetry events"}</p>}
        {report.events.map(e => <button key={e.eventId} type="button"
          aria-pressed={eventId === e.eventId}
          className={"w-full rounded-lg border p-3 text-start text-sm " +
            (eventId === e.eventId ? "border-current" : "border-border")}
          onClick={() => setEventId(e.eventId)}>
          <strong>{e.kind}</strong> · {e.decision} · {date(e.observedAt)}
          {e.gapMs !== null ? " · " + Math.round(e.gapMs / 1000) + "s" : ""}
          {report.cases.some(c => c.eventId === e.eventId) && " · " +
            report.cases.find(c => c.eventId === e.eventId)?.disposition}
        </button>)}
      </div>
      {eventId && <fieldset className="grid gap-2 rounded-lg border border-border p-3">
        <legend className="px-1 font-medium">{ar ? "قرار بشري قابل للمراجعة" : "Human incident review"}</legend>
        {chosen?.studentExplanation && <p className="text-sm whitespace-pre-wrap" dir="auto">
          <strong>{ar ? "توضيح الطالب: " : "Student explanation: "}</strong>{chosen.studentExplanation}
        </p>}
        <label className="grid gap-1 text-sm">{ar ? "القرار" : "Review disposition"}
          <select className="kb-input" value={disposition}
            onChange={e => setDisposition(e.target.value as typeof disposition)}>
            <option value="no_action">{ar ? "لا يلزم إجراء" : "No action"}</option>
            <option value="follow_up">{ar ? "تحتاج متابعة" : "Follow up"}</option>
            <option value="policy_issue">{ar ? "مشكلة في السياسة" : "Policy issue"}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">{ar ? "سبب القرار (١٠–٥٠٠ حرف)" : "Reason (10–500 characters)"}
          <textarea className="kb-input" rows={3} maxLength={500} dir="auto"
            value={reason} onChange={e => setReason(e.target.value)} />
        </label>
        <button type="button" className="ws-btn ws-btn--primary justify-self-start"
          disabled={busy || reason.trim().length < 10}
          onClick={() => void run(() => review({
            attemptId: selectedId, eventId, expectedRevision: chosen?.revision ?? 0,
            disposition, reason,
          }))}>{ar ? "تسجيل المراجعة" : "Record human review"}</button>
      </fieldset>}
      {report.state === "in_progress" && <fieldset className="grid gap-3 rounded-lg border border-border p-3">
        <legend className="px-1 font-medium">{ar ? "تدخل يدوي موثق" : "Audited manual intervention"}</legend>
        <label className="grid gap-1 text-sm">{ar ? "السبب (١٠–٥٠٠ حرف)" : "Reason (10–500 characters)"}
          <textarea className="kb-input" rows={2} maxLength={500} dir="auto"
            value={reason} onChange={e => setReason(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">{ar ? "دقائق إضافية" : "Additional minutes"}
          <input type="number" className="kb-input" min={1} max={120} step={1}
            value={minutes} onChange={e => setMinutes(Number(e.target.value))} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ws-btn ws-btn--ghost" disabled={busy || reason.trim().length < 10}
            onClick={() => void run(() => extend({
              attemptId: selectedId, expectedRevision: report.attemptRevision,
              minutes, reason,
            }))}>{ar ? "مد الوقت" : "Extend time"}</button>
          <button type="button" className="ws-btn ws-btn--ghost" disabled={busy || reason.trim().length < 10}
            onClick={() => void run(() => note({
              attemptId: selectedId, kind: "connectivity_acknowledged", reason,
            }))}>{ar ? "توثيق عطل الاتصال" : "Acknowledge connection issue"}</button>
        </div>
      </fieldset>}
      <div className="grid gap-2 text-sm">
        <h3 className="font-medium">{ar ? "سجل القرارات" : "Decision audit trail"}</h3>
        {report.audit.map((a, i) => <p key={a.at + ":" + i} className="rounded-md border border-border p-2" dir="auto">
          {date(a.at)} · {a.action} · {a.detail}
        </p>)}
      </div>
    </>}
    <fieldset className="grid gap-2 rounded-lg border border-border p-3">
      <legend className="px-1 font-medium">{ar ? "تيسيرات قبل بداية الامتحان" : "Pre-start accommodations"}</legend>
      <p className="cb-note">{ar ? "تحتاج معرف طالب مسجل وموافق عليه؛ لا تنطبق التيسيرات تلقائيًا على محاولة جارية."
        : "Enter an approved candidate account ID. These settings do not retroactively change an active attempt."}</p>
      <label className="grid gap-1 text-sm">{ar ? "معرف الطالب" : "Approved candidate account ID"}
        <input className="kb-input" value={candidateId} onChange={e => setCandidateId(e.target.value)}
          maxLength={150} autoComplete="off" />
      </label>
      {savedAccommodation && <p className="cb-note">
        {ar ? "الإعداد الحالي" : "Current setting"}: {savedAccommodation.kind} · {savedAccommodation.additionalMinutes}m
      </p>}
      <label className="grid gap-1 text-sm">{ar ? "التيسير" : "Accommodation"}
        <select className="kb-input" value={accommodation}
          onChange={e => {
            const next = e.target.value as typeof accommodation;
            setAccommodation(next);
            setAccommodationMinutes(next === "extra_time" ? 15 : 0);
          }}>
          <option value="extra_time">{ar ? "وقت إضافي" : "Extra time"}</option>
          <option value="breaks_allowed">{ar ? "استراحات مسموحة" : "Breaks permitted"}</option>
          <option value="reduced_monitoring">{ar ? "مراقبة مخففة" : "Reduced monitoring"}</option>
        </select>
      </label>
      {accommodation === "extra_time" && <label className="grid gap-1 text-sm">
        {ar ? "الدقائق" : "Minutes"}
        <input type="number" className="kb-input" min={1} max={120} step={1}
          value={accommodationMinutes} onChange={e => setAccommodationMinutes(Number(e.target.value))} />
      </label>}
      <button type="button" className="ws-btn ws-btn--ghost justify-self-start"
        disabled={busy || !candidateId.trim() || savedAccommodation === undefined}
        onClick={() => void run(() => saveAccommodation({
          draftId, studentId: candidateId.trim(), kind: accommodation,
          additionalMinutes: accommodation === "extra_time" ? accommodationMinutes : 0,
          expectedRevision: savedAccommodation?.revision ?? 0,
        }))}>{ar ? "حفظ التيسير" : "Save accommodation"}</button>
    </fieldset>
  </section>;
}
