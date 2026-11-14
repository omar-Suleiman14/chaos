"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { WsTabs } from "@/components/workspace/primitives";
import type { Id } from "@/convex/_generated/dataModel";

const tabs = ["enrollments", "exams", "grading", "usage", "support", "audit"] as const;
type Tab = (typeof tabs)[number];
const translations = {
  en: {
    enrollments: "Enrollment", exams: "Exams", grading: "Grading", usage: "Usage",
    support: "Support", audit: "Audit", all: "All statuses", load: "Load more",
    loading: "Loading…", empty: "No records in this page.", noBilling: "Operational reports only. No billing or payments.",
    meta: "This view contains operational metadata only. Teachers retain admission and grading authority.",
  },
  ar: {
    enrollments: "الالتحاق", exams: "الامتحانات", grading: "التصحيح", usage: "الاستخدام",
    support: "الدعم", audit: "سجل الإدارة", all: "كل الحالات", load: "تحميل المزيد",
    loading: "جارٍ التحميل…", empty: "لا توجد سجلات في هذه الصفحة.", noBilling: "تقارير تشغيلية فقط، بدون مدفوعات أو فواتير.",
    meta: "تظهر هنا بيانات التشغيل فقط. يظل قبول الطلاب واعتماد الدرجات بيد المدرس.",
  },
};
function format(time: number | null) {
  return time === null ? "—" : new Date(time).toLocaleString();
}
function More({ status, loadMore, empty, loading, load }: {
  status: string; loadMore: (count: number) => void;
  empty: boolean; loading: string; load: string;
}) {
  return <div className="space-y-3">
    {status === "LoadingFirstPage" && <output>{loading}</output>}
    {status !== "LoadingFirstPage" && empty && <p className="ws-page-subtitle">{empty ? "No matching records." : ""}</p>}
    {(status === "CanLoadMore" || status === "LoadingMore") &&
      <button className="ws-btn" disabled={status === "LoadingMore"} onClick={() => loadMore(20)}>
        {status === "LoadingMore" ? loading : load}
      </button>}
  </div>;
}

function Enrollments({ locale }: { locale: "en" | "ar" }) {
  const [status, setStatus] = useState<"" | "pending" | "approved" | "rejected" | "withdrawn" | "suspended" | "removed">("pending");
  const q = usePaginatedQuery(api.adminOperations.admissions,
    { status: status || undefined }, { initialNumItems: 20 });
  return <section className="space-y-4" aria-label="Course enrollment operations">
    <label className="flex flex-wrap gap-2 items-center text-sm">{locale === "ar" ? "الحالة" : "Status"}
      <select className="kb-input w-auto" aria-label="Enrollment status" value={status} onChange={e => setStatus(e.target.value as typeof status)}>
        {["", "pending", "approved", "rejected", "withdrawn", "suspended", "removed"].map(s =>
          <option key={s} value={s}>{s || translations[locale].all}</option>)}
      </select>
    </label>
    {!!q.results.length && <div className="ws-table-wrap"><table className="ws-table">
      <thead><tr><th>Course</th><th>Student account</th><th>Doctor account</th><th>Status</th><th>Requested</th></tr></thead>
      <tbody>{q.results.map(row => <tr key={row.id}>
        <td><strong dir="auto">{row.courseTitle}</strong><small className="block text-muted-foreground break-all">{row.courseId}</small></td>
        <td className="break-all">{row.studentId}</td><td className="break-all">{row.ownerId}</td>
        <td>{row.status}</td><td>{format(row.requestedAt)}</td>
      </tr>)}</tbody>
    </table></div>}
    <More status={q.status} loadMore={q.loadMore} empty={!q.results.length} loading={translations[locale].loading} load={translations[locale].load} />
  </section>;
}

function Exams({ locale }: { locale: "en" | "ar" }) {
  const q = usePaginatedQuery(api.adminOperations.exams, {}, { initialNumItems: 20 });
  return <section className="space-y-4" aria-label="Exam release operations">
    {!!q.results.length && <div className="ws-table-wrap"><table className="ws-table">
      <thead><tr><th>Course</th><th>Doctor account</th><th>Version</th><th>Setup</th><th>Student entry</th><th>Window</th><th>Updated</th></tr></thead>
      <tbody>{q.results.map(row => <tr key={row.id}>
        <td><strong dir="auto">{row.courseTitle}</strong><small className="block text-muted-foreground break-all">{row.id}</small></td>
        <td className="break-all">{row.ownerId}</td><td>{row.version}</td>
        <td>{row.configured ? "Configured" : "Incomplete"}{row.assigned ? " · Assigned" : ""}</td>
        <td>{row.studentEntryEnabled ? "Enabled" : "Disabled"}</td>
        <td>{row.mode === "scheduled" ? format(row.opensAt) + " – " + format(row.closesAt) : row.mode ?? "—"}</td>
        <td>{format(row.updatedAt)}</td>
      </tr>)}</tbody>
    </table></div>}
    <More status={q.status} loadMore={q.loadMore} empty={!q.results.length} loading={translations[locale].loading} load={translations[locale].load} />
  </section>;
}

function Grading({ locale }: { locale: "en" | "ar" }) {
  const [status, setStatus] = useState<"" | "queued" | "claimed" | "doctor_review">("");
  const q = usePaginatedQuery(api.adminOperations.grading, { status: status || undefined }, { initialNumItems: 20 });
  return <section className="space-y-4" aria-label="Assisted grading operations">
    <label className="flex flex-wrap gap-2 items-center text-sm">Status
      <select className="kb-input w-auto" aria-label="Grading status" value={status} onChange={e => setStatus(e.target.value as typeof status)}>
        {["", "queued", "claimed", "doctor_review"].map(s => <option key={s} value={s}>{s || translations[locale].all}</option>)}
      </select>
    </label>
    {!!q.results.length && <div className="ws-table-wrap"><table className="ws-table">
      <thead><tr><th>Job</th><th>Doctor</th><th>Status</th><th>Retries</th><th>Lease expires</th><th>Updated</th></tr></thead>
      <tbody>{q.results.map(row => <tr key={row.id}>
        <td className="break-all">{row.id}</td><td className="break-all">{row.ownerId}</td><td>{row.status}</td>
        <td>{row.retryCount}</td><td>{format(row.claimExpiresAt)}</td><td>{format(row.updatedAt)}</td>
      </tr>)}</tbody>
    </table></div>}
    <More status={q.status} loadMore={q.loadMore} empty={!q.results.length} loading={translations[locale].loading} load={translations[locale].load} />
  </section>;
}

function Usage({ locale }: { locale: "en" | "ar" }) {
  const report = useQuery(api.adminAnalytics.overview);
  const history = useQuery(api.adminAnalytics.history);
  const refresh = useMutation(api.adminAnalytics.refresh);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const counts = report?.completedAt ? report.counts : null;
  const latest = history?.[0];
  const previous = history?.[1];
  const differences = latest && previous ? [
    { label: locale === "ar" ? "الحسابات" : "Accounts", value: latest.counts.users - previous.counts.users },
    { label: locale === "ar" ? "النماذج" : "Forms", value: latest.counts.forms - previous.counts.forms },
    { label: locale === "ar" ? "الردود" : "Responses", value: latest.counts.responses - previous.counts.responses },
    { label: locale === "ar" ? "الردود الجزئية" : "Partial responses", value: latest.counts.partials - previous.counts.partials },
  ] : [];
  const numeric = (value: number) => value.toLocaleString(locale === "ar" ? "ar-EG" : "en-US");
  return <section className="space-y-4" aria-label={locale === "ar" ? "إحصائيات المنصة" : "Platform usage"}>
    <p className="ws-page-subtitle">{translations[locale].noBilling} {report?.completedAt
      ? (locale === "ar" ? "آخر إحصاء مكتمل: " : "Completed snapshot: ") + format(report.completedAt)
      : locale === "ar" ? "لا يوجد إحصاء مكتمل بعد." : "No completed snapshot yet."}
      {report?.running ? (locale === "ar" ? " التحديث جارٍ." : " Refresh in progress.") : ""}
    </p>
    <button className="ws-btn" disabled={busy || report?.running} onClick={async () => {
      setBusy(true); setError("");
      try { await refresh({}); } catch (e) { setError(e instanceof Error ? e.message : "Refresh failed"); }
      finally { setBusy(false); }
    }}>{busy ? (locale === "ar" ? "جارٍ الإرسال…" : "Requesting…")
      : (locale === "ar" ? "تحديث إحصاءات الاستخدام" : "Refresh usage snapshot")}</button>
    {error && <p role="alert">{error}</p>}
    {counts && <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {([
        [locale === "ar" ? "الحسابات" : "Accounts", counts.users],
        [locale === "ar" ? "النماذج المنشورة" : "Published forms", counts.liveForms],
        [locale === "ar" ? "النماذج" : "Forms", counts.forms],
        [locale === "ar" ? "الردود" : "Responses", counts.responses],
        [locale === "ar" ? "الردود الجزئية" : "Partial responses", counts.partials],
        [locale === "ar" ? "الحسابات المقيدة" : "Restricted accounts", counts.restricted],
      ] as const).map(([label, value]) =>
        <div key={label} className="rounded-lg border p-4"><span className="text-sm text-muted-foreground">{label}</span><strong className="block text-2xl">{numeric(value)}</strong></div>)}
    </div>}
    <div className="space-y-3">
      <h3 className="font-semibold">{locale === "ar" ? "سجل إحصاءات الاستخدام" : "Usage snapshot history"}</h3>
      <p className="ws-page-subtitle">{locale === "ar"
        ? "آخر 30 عملية إحصاء مكتملة فقط. الفروق بين عمليات التحديث وليست معدلات نشاط يومية؛ لا تتضمن بيانات الطلاب الفردية."
        : "Last 30 completed scans only. Changes are between refreshes, not daily activity; no individual student data."}</p>
      {history === undefined ? <output>{translations[locale].loading}</output> :
        history.length === 0 ? <p className="ws-page-subtitle">{locale === "ar" ? "لا يوجد سجل حتى الآن." : "No completed refresh history yet."}</p> : <>
          {differences.length > 0 && <div className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label={locale === "ar" ? "التغير منذ الإحصاء السابق" : "Change since previous snapshot"}>
            {differences.map(item => <div key={item.label} className="rounded-lg border p-3">
              <span className="block text-sm text-muted-foreground">{item.label}</span>
              <strong className="block text-lg" dir="ltr">{item.value > 0 ? "+" : ""}{numeric(item.value)}</strong>
            </div>)}
          </div>}
          <div className="ws-table-wrap"><table className="ws-table">
            <caption className="sr-only">{locale === "ar" ? "الإحصاءات المكتملة مرتبة من الأحدث إلى الأقدم" : "Completed usage scans, newest first"}</caption>
            <thead><tr>
              <th scope="col">{locale === "ar" ? "وقت الاكتمال" : "Completed"}</th>
              <th scope="col">{locale === "ar" ? "الحسابات" : "Accounts"}</th>
              <th scope="col">{locale === "ar" ? "النماذج" : "Forms"}</th>
              <th scope="col">{locale === "ar" ? "الردود" : "Responses"}</th>
              <th scope="col">{locale === "ar" ? "الردود الجزئية" : "Partials"}</th>
            </tr></thead>
            <tbody>{history.map((row, index) => <tr key={index}>
              <td>{format(row.completedAt)}</td><td>{numeric(row.counts.users)}</td>
              <td>{numeric(row.counts.forms)}</td><td>{numeric(row.counts.responses)}</td>
              <td>{numeric(row.counts.partials)}</td>
            </tr>)}</tbody>
          </table></div>
        </>}
    </div>
  </section>;
}

type SupportRow = { id: Id<"platformSupportCases">; subject: string; summary: string;
  status: "open" | "in_progress" | "resolved"; priority: "normal" | "urgent";
  revision: number; updatedAt: number; accountId: string | null };
function SupportCase({ item }: { item: SupportRow }) {
  const [status, setStatus] = useState<SupportRow["status"]>(item.status);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const transition = useMutation(api.adminOperations.transitionCase);
  return <article className="rounded-lg border p-4 space-y-3">
    <div className="flex flex-wrap justify-between items-start gap-2">
      <div><strong dir="auto">{item.subject}</strong><p className="text-sm text-muted-foreground whitespace-pre-wrap" dir="auto">{item.summary}</p></div>
      <span className="text-sm">{item.priority} · {item.status}</span>
    </div>
    <p className="text-xs text-muted-foreground break-all">{item.accountId ? "Account: " + item.accountId + " · " : ""}Updated {format(item.updatedAt)}</p>
    <div className="flex flex-wrap gap-2 items-end">
      <label className="text-sm">New status
        <select className="kb-input block" aria-label={"Status for " + item.subject} value={status} onChange={e => setStatus(e.target.value as SupportRow["status"])}>
          <option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option>
        </select>
      </label>
      <label className="flex-1 min-w-48 text-sm">Reason (8–500 characters)
        <input className="kb-input block w-full" maxLength={500} value={reason}
          aria-label={"Reason for " + item.subject} onChange={e => setReason(e.target.value)} />
      </label>
      <button className="ws-btn" disabled={saving || status === item.status || reason.trim().length < 8}
        onClick={async () => {
          setSaving(true); setError("");
          try { await transition({ caseId: item.id, status, expectedRevision: item.revision, reason }); setReason(""); }
          catch (e) { setError(e instanceof Error ? e.message : "Could not update support case"); }
          finally { setSaving(false); }
        }}>{saving ? "Saving…" : "Update case"}</button>
    </div>
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
  </article>;
}

function Support({ locale }: { locale: "en" | "ar" }) {
  const [status, setStatus] = useState<"" | "open" | "in_progress" | "resolved">("");
  const q = usePaginatedQuery(api.adminOperations.cases, { status: status || undefined }, { initialNumItems: 20 });
  const create = useMutation(api.adminOperations.createCase);
  const [subject, setSubject] = useState("");
  const [summary, setSummary] = useState("");
  const [accountId, setAccountId] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  return <section className="space-y-5" aria-label="Platform support workflows">
    <form className="rounded-lg border p-4 space-y-3" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError(""); setCreated(false);
      try {
        await create({ subject, summary, priority, ...(accountId.trim() ? { accountId: accountId.trim() } : {}) });
        setSubject(""); setSummary(""); setAccountId(""); setCreated(true);
      } catch (e) { setError(e instanceof Error ? e.message : "Could not create case"); }
      finally { setBusy(false); }
    }}>
      <h2 className="font-semibold">New support case</h2>
      <label className="block text-sm">Subject
        <input className="kb-input block w-full" required minLength={3} maxLength={160} value={subject} onChange={e => setSubject(e.target.value)} />
      </label>
      <label className="block text-sm">Summary (avoid exam answers and medical details)
        <textarea className="kb-input block w-full" required minLength={10} maxLength={1200} rows={3} value={summary} onChange={e => setSummary(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm flex-1">Account ID (optional)
          <input className="kb-input block w-full" value={accountId} onChange={e => setAccountId(e.target.value)} />
        </label>
        <label className="text-sm">Priority
          <select className="kb-input block" value={priority} onChange={e => setPriority(e.target.value as typeof priority)}>
            <option value="normal">Normal</option><option value="urgent">Urgent</option>
          </select>
        </label>
      </div>
      <button className="ws-btn" disabled={busy || subject.trim().length < 3 || summary.trim().length < 10}>{busy ? "Saving…" : "Create case"}</button>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {created && <output>Support case created.</output>}
    </form>
    <label className="flex gap-2 items-center text-sm">Status
      <select className="kb-input w-auto" aria-label="Support status" value={status} onChange={e => setStatus(e.target.value as typeof status)}>
        {["", "open", "in_progress", "resolved"].map(s => <option key={s} value={s}>{s || translations[locale].all}</option>)}
      </select>
    </label>
    <div className="space-y-3">{q.results.map(item => <SupportCase key={item.id} item={item} />)}</div>
    <More status={q.status} loadMore={q.loadMore} empty={!q.results.length} loading={translations[locale].loading} load={translations[locale].load} />
  </section>;
}

function Audit({ locale }: { locale: "en" | "ar" }) {
  const q = usePaginatedQuery(api.adminOperations.audit, {}, { initialNumItems: 20 });
  return <section className="space-y-4" aria-label="Platform audit history">
    {!!q.results.length && <div className="ws-table-wrap"><table className="ws-table">
      <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th><th>Reason</th></tr></thead>
      <tbody>{q.results.map(row => <tr key={row.id}>
        <td>{format(row.createdAt)}</td><td>{row.action}</td><td className="break-all">{row.actorId}</td>
        <td className="break-all">{row.target}</td><td className="break-words" dir="auto">{row.reason}</td>
      </tr>)}</tbody>
    </table></div>}
    <More status={q.status} loadMore={q.loadMore} empty={!q.results.length} loading={translations[locale].loading} load={translations[locale].load} />
  </section>;
}

/** AdminGate in /admin/page.tsx also gates the entire component. Every query rechecks the server role. */
export default function OperationsPanel() {
  const params = useParams<{ lang?: string }>();
  const locale = params?.lang === "ar" ? "ar" : "en";
  const [tab, setTab] = useState<Tab>("enrollments");
  return <div className="space-y-5" dir={locale === "ar" ? "rtl" : "ltr"}>
    <p className="ws-page-subtitle">{translations[locale].meta}</p>
    <WsTabs tabs={tabs} value={tab} onChange={setTab} label="Operational platform sections"
      labels={translations[locale]} />
    {tab === "enrollments" ? <Enrollments locale={locale} /> :
     tab === "exams" ? <Exams locale={locale} /> :
     tab === "grading" ? <Grading locale={locale} /> :
     tab === "usage" ? <Usage locale={locale} /> :
     tab === "support" ? <Support locale={locale} /> : <Audit locale={locale} />}
  </div>;
}
