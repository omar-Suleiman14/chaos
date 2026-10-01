"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCopy } from "@/lib/i18n";
import QueryErrorBoundary from "../QueryErrorBoundary";
import AttemptHistory from "./AttemptHistory";
import { homeworkCopy, homeworkError } from "./copy";

function StudentReport({ assignmentId, studentId }: { assignmentId: Id<"homeworkAssignments">; studentId: string }) {
  const rows = useQuery(api.homework.report, { assignmentId, studentId });
  return <AttemptHistory rows={rows} />;
}

export default function HomeworkManager({ formId }: { formId: Id<"forms"> }) {
  const t = useCopy(homeworkCopy);
  const form = useQuery(api.forms.getFormForEditor, { formId });
  const [selectedVersion, setVersion] = useState<number | null>(null);
  const versionNumber = selectedVersion ?? form?.publishedVersion;
  const version = useQuery(api.forms.getVersion, versionNumber ? { formId, version: versionNumber } : "skip");
  const create = useMutation(api.homework.create), enroll = useMutation(api.homework.enroll), setClosed = useMutation(api.homework.setClosed);
  const [assignmentId, setAssignment] = useState<Id<"homeworkAssignments"> | null>(null);
  const [studentId, setStudent] = useState("");
  const [reportStudent, setReportStudent] = useState("");
  const [error, setError] = useState(""), [status, setStatus] = useState(""), [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const run = async (work: () => Promise<unknown>, message: string) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setStatus("");
    try { await work(); setStatus(message); } catch (e) { setError(homeworkError(e, t)); }
    finally { pending.current = false; setBusy(false); }
  };
  if (form === undefined) return <p role="status">{t.loading}</p>;
  if (!form) return <p className="ws-empty">{t.unavailable}</p>;
  if (form.role !== "owner") return <p className="ws-empty">{t.ownerOnly}</p>;
  return <div className="grid gap-6">
    <header><Link className="ws-link-quiet" href={`/dashboard/forms/${formId}/responses`}>{t.back}</Link><h1 className="ws-page-title">{t.title} · {form.title}</h1><p className="ws-page-subtitle">{t.pinned}</p></header>
    {error && <p role="alert" className="ws-error">{error}</p>}{status && <p role="status">{status}</p>}
    {!form.versions.length ? <p className="ws-empty">{t.published}</p> : <form className="kb-card-bordered grid gap-4 p-5" onSubmit={e => {
      e.preventDefault(); const fields = new FormData(e.currentTarget);
      if (!version?.definition.quiz?.enabled) { setError(t.quiz); return; }
      const opensAt = new Date(String(fields.get("opens"))).getTime(), deadline = new Date(String(fields.get("deadline"))).getTime();
      if (!Number.isFinite(opensAt) || !Number.isFinite(deadline) || deadline <= Math.max(opensAt, Date.now())) { setError(t.dates); return; }
      void run(async () => { const id = await create({ formId, versionId: version._id, title: String(fields.get("title")).trim(), opensAt, deadline, maxAttempts: Number(fields.get("attempts")) }); setAssignment(id); setReportStudent(""); }, t.saved);
    }}>
      <h2 className="text-lg font-semibold">{t.create}</h2>
      <label className="grid gap-1">{t.name}<input className="kb-input" name="title" required maxLength={200} defaultValue={form.title} /></label>
      <label className="grid gap-1">{t.version}<select className="kb-input" value={versionNumber ?? ""} onChange={e => setVersion(Number(e.target.value))}>{form.versions.map(v => <option key={v.version} value={v.version}>{v.version}</option>)}</select></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1">{t.opens}<input className="kb-input" type="datetime-local" name="opens" required /></label><label className="grid gap-1">{t.deadline}<input className="kb-input" type="datetime-local" name="deadline" required /></label></div>
      <label className="grid gap-1">{t.attempts}<input className="kb-input" type="number" name="attempts" min={1} max={10} step={1} defaultValue={1} required /></label>
      <button className="ws-btn w-fit" disabled={busy || !version?.definition.quiz?.enabled}>{busy ? t.creating : t.create}</button>
      {version && !version.definition.quiz?.enabled && <p className="ws-muted">{t.quiz}</p>}
    </form>}
    <form className="flex gap-3 flex-wrap items-end" onSubmit={e => { e.preventDefault(); const id = String(new FormData(e.currentTarget).get("assignmentId")).trim(); if (!/^[A-Za-z0-9]{10,64}$/.test(id)) { setError(t.invalidId); return; } setAssignment(id as Id<"homeworkAssignments">); setReportStudent(""); setError(""); setStatus(""); }}><label className="grid gap-1 flex-1">{t.existing}<input aria-label={t.assignmentId} name="assignmentId" className="kb-input" required /></label><button className="ws-btn">{t.manage}</button></form>
    {assignmentId && <section className="kb-card-bordered grid gap-4 p-5" aria-label={t.manage}>
      <p className="ws-muted">{t.assignmentId}: <span className="break-all" dir="ltr">{assignmentId}</span></p>
      <div className="flex gap-3 flex-wrap"><Link className="ws-link" href={`/homework/${assignmentId}`}>{t.link}</Link><button className="ws-btn" type="button" disabled={busy} onClick={() => void run(() => navigator.clipboard.writeText(`${window.location.origin}/homework/${assignmentId}`), t.copied)}>{t.copy}</button></div>
      <label className="grid gap-1">{t.student}<input className="kb-input" value={studentId} onChange={e => setStudent(e.target.value)} maxLength={200} aria-describedby="homework-student-hint" /></label><p id="homework-student-hint" className="ws-muted">{t.studentHint}</p>
      <div className="flex flex-wrap gap-2">
        <button className="ws-btn" type="button" disabled={busy || !studentId.trim()} onClick={() => void run(() => enroll({ assignmentId, studentId: studentId.trim(), active: true }), t.enrolled)}>{t.enroll}</button>
        <button className="ws-btn" type="button" disabled={busy || !studentId.trim()} onClick={() => void run(() => enroll({ assignmentId, studentId: studentId.trim(), active: false }), t.enrolled)}>{t.revoke}</button>
        <button className="ws-btn" type="button" disabled={busy || !studentId.trim()} onClick={() => setReportStudent(studentId.trim())}>{t.report}</button>
        <button className="ws-btn" type="button" disabled={busy} onClick={() => void run(() => setClosed({ assignmentId, closed: true }), t.updated)}>{t.close}</button>
        <button className="ws-btn" type="button" disabled={busy} onClick={() => void run(() => setClosed({ assignmentId, closed: false }), t.updated)}>{t.reopen}</button>
      </div>
      {reportStudent && <QueryErrorBoundary key={`${assignmentId}:${reportStudent}`}><StudentReport assignmentId={assignmentId} studentId={reportStudent} /></QueryErrorBoundary>}
    </section>}
  </div>;
}
