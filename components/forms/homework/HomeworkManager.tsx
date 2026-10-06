"use client";

import { ChaosSelect } from "@/components/workspace/ChaosSelect";
import { toast } from "@/lib/toast";
import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCopy } from "@/lib/i18n";
import QueryErrorBoundary from "../QueryErrorBoundary";
import AttemptHistory from "./AttemptHistory";
import { homeworkCopy, homeworkError } from "./copy";
import { linkOrigin } from "@/lib/hosts";
import { hostHref } from "@/lib/hosts";

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
  const [email, setEmail] = useState("");
  const assignments = useQuery(api.homework.listForForm, { formId });
  const roster = useQuery(api.homework.roster, assignmentId ? { assignmentId } : "skip");
  const [reportStudent, setReportStudent] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const run = async (work: () => Promise<unknown>, message: string) => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { await work(); toast.success(message); } catch (e) { toast.error(homeworkError(e, t)); }
    finally { pending.current = false; setBusy(false); }
  };
  if (form === undefined) return <p role="status">{t.loading}</p>;
  if (!form) return <p className="ws-empty">{t.unavailable}</p>;
  if (form.role !== "owner") return <p className="ws-empty">{t.ownerOnly}</p>;
  return <div className="grid gap-6">
    <header><Link className="ws-link-quiet" href={hostHref(`/dashboard/forms/${formId}/responses`)}>{t.back}</Link><h1 className="ws-page-title">{t.title} · {form.title}</h1><p className="ws-page-subtitle">{t.pinned}</p></header>
    {!form.versions.length ? <p className="ws-empty">{t.published}</p> : <form className="kb-card-bordered grid gap-4 p-5" onSubmit={e => {
      e.preventDefault(); const fields = new FormData(e.currentTarget);
      if (!version?.definition.quiz?.enabled) { toast.error(t.quiz); return; }
      const opensAt = new Date(String(fields.get("opens"))).getTime(), deadline = new Date(String(fields.get("deadline"))).getTime();
      if (!Number.isFinite(opensAt) || !Number.isFinite(deadline) || deadline <= Math.max(opensAt, Date.now())) { toast.error(t.dates); return; }
      void run(async () => { const id = await create({ formId, versionId: version._id, title: String(fields.get("title")).trim(), opensAt, deadline, maxAttempts: Number(fields.get("attempts")) }); setAssignment(id); setReportStudent(""); }, t.saved);
    }}>
      <h2 className="text-lg font-semibold">{t.create}</h2>
      <label className="grid gap-1">{t.name}<input className="kb-input" name="title" required maxLength={200} defaultValue={form.title} /></label>
      <label className="grid gap-1">{t.version}<ChaosSelect className="kb-input" value={versionNumber ?? ""} onChange={e => setVersion(Number(e.target.value))}>{form.versions.map(v => <option key={v.version} value={v.version}>{v.version}</option>)}</ChaosSelect></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1">{t.opens}<input className="kb-input" type="datetime-local" name="opens" required /></label><label className="grid gap-1">{t.deadline}<input className="kb-input" type="datetime-local" name="deadline" required /></label></div>
      <label className="grid gap-1">{t.attempts}<input className="kb-input" type="number" name="attempts" min={1} max={10} step={1} defaultValue={1} required /></label>
      <button className="ws-btn w-fit" disabled={busy || !version?.definition.quiz?.enabled}>{busy ? t.creating : t.create}</button>
      {version && !version.definition.quiz?.enabled && <p className="ws-muted">{t.quiz}</p>}
    </form>}
    {assignments && assignments.length > 0 && <label className="grid gap-1 max-w-md">{t.yours}<ChaosSelect className="kb-input" value={assignmentId ?? ""} onChange={e => { setAssignment((e.target.value || null) as Id<"homeworkAssignments"> | null); setReportStudent(""); }}>
      <option value="">{t.choose}</option>
      {assignments.map(a => <option key={a.id} value={a.id}>{a.title} · v{a.version} · {new Date(a.deadline).toLocaleDateString()}{a.closed ? ` · ${t.closedTag}` : ""}</option>)}
    </ChaosSelect></label>}
    {assignmentId && <section className="kb-card-bordered grid gap-4 p-5" aria-label={t.manage}>
      <div className="flex gap-3 flex-wrap"><Link className="ws-link" href={hostHref(`/homework/${assignmentId}`)}>{t.link}</Link><button className="ws-btn" type="button" disabled={busy} onClick={() => void run(() => navigator.clipboard.writeText(`${linkOrigin("dashboard")}/homework/${assignmentId}`), t.copied)}>{t.copy}</button></div>
      <form className="flex gap-2 flex-wrap items-end" onSubmit={e => { e.preventDefault(); if (email.trim()) void run(async () => { await enroll({ assignmentId, email: email.trim(), active: true }); setEmail(""); }, t.enrolled); }}>
        <label className="grid gap-1 flex-1 min-w-56">{t.student}<input className="kb-input" type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={200} aria-describedby="homework-student-hint" /></label>
        <button className="ws-btn" disabled={busy || !email.trim()}>{t.enroll}</button>
      </form>
      <p id="homework-student-hint" className="ws-muted">{t.studentHint}</p>
      <h2 className="text-base font-semibold">{t.roster}</h2>
      {roster === undefined ? <p role="status">{t.loading}</p> : roster.length === 0 ? <p className="ws-muted">{t.noStudents}</p> : <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="text-start"><th className="text-start p-2">{t.student}</th><th className="text-start p-2">{t.submitted}</th><th className="text-start p-2">{t.best}</th><th className="p-2"><span className="sr-only">{t.manage}</span></th></tr></thead>
        <tbody>{roster.map(r => <tr key={r.studentId} className="border-t">
          <td className="p-2"><span className="block">{r.name || r.email}</span><span className="block ws-muted" dir="ltr">{r.email}</span>{!r.active && <span className="ws-muted"> · {t.inactive}</span>}</td>
          <td className="p-2">{r.submitted}/{r.attempts}{r.lastSubmittedAt ? <span className="block ws-muted">{new Date(r.lastSubmittedAt).toLocaleString()}</span> : null}</td>
          <td className="p-2">{r.bestScore === null ? "—" : `${r.bestScore}/${r.maxScore ?? "?"}`}</td>
          <td className="p-2"><div className="flex gap-2 justify-end flex-wrap">
            <button className="ws-btn ws-btn--sm" type="button" onClick={() => setReportStudent(r.studentId)}>{t.report}</button>
            <button className="ws-btn ws-btn--sm" type="button" disabled={busy} onClick={() => void run(() => enroll({ assignmentId, studentId: r.studentId, active: !r.active }), t.enrolled)}>{r.active ? t.revoke : t.reenroll}</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
      <div className="flex flex-wrap gap-2">
        <button className="ws-btn" type="button" disabled={busy} onClick={() => void run(() => setClosed({ assignmentId, closed: true }), t.updated)}>{t.close}</button>
        <button className="ws-btn" type="button" disabled={busy} onClick={() => void run(() => setClosed({ assignmentId, closed: false }), t.updated)}>{t.reopen}</button>
      </div>
      {reportStudent && <QueryErrorBoundary key={`${assignmentId}:${reportStudent}`}><StudentReport assignmentId={assignmentId} studentId={reportStudent} /></QueryErrorBoundary>}
    </section>}
  </div>;
}
