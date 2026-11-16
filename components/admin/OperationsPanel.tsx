"use client";

import { useEffect, useState } from "react";
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
const labels = {
  en: {
    course: "Course", studentAccount: "Student account", doctorAccount: "Doctor account", status: "Status",
    requested: "Requested", version: "Version", setup: "Setup", studentEntry: "Student entry", window: "Window",
    updated: "Updated", job: "Job", retries: "Retries", leaseExpires: "Lease expires", when: "When",
    action: "Action", actor: "Actor", target: "Target", reason: "Reason", newStatus: "New status",
    reasonLength: "Reason (8–500 characters)", saving: "Saving…", updateCase: "Update case",
    newCase: "New support case", subject: "Subject", summary: "Summary (avoid exam answers and medical details)",
    accountId: "Account ID (optional)", priority: "Priority", normal: "Normal", urgent: "Urgent",
    createCase: "Create case", created: "Support case created.", accountPrefix: "Account: ",
    updatedPrefix: "Updated ", noMatch: "No matching records.", supportCasePrefix: "Support case",
    open: "Open", in_progress: "In progress", resolved: "Resolved", pending: "Pending",
    approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn", suspended: "Suspended", removed: "Removed",
    queued: "Queued", claimed: "Claimed", doctor_review: "Doctor review", configured: "Configured",
    incomplete: "Incomplete", assigned: "Assigned", enabled: "Enabled", disabled: "Disabled",
    completedSnapshot: "Completed snapshot: ", lastCompleted: "Completed", sincePrevious: "Change since previous snapshot",
    scheduled: "Scheduled", manual: "Manual", enrollmentOperations: "Course enrollment operations",
    examOperations: "Exam release operations", gradingOperations: "Assisted grading operations",
    supportOperations: "Platform support workflows", auditHistory: "Platform audit history",
    account: "Account", plan: "Plan", planExpired: "Plan expired", suspensionExpired: "Suspension expired",
    grantAdmin: "Administrator granted", revokeAdmin: "Administrator revoked", free: "Free", pro: "Pro",
    refreshFailed: "Could not refresh usage data.", updateFailed: "Could not update support case.",
    createFailed: "Could not create support case.", otherAction: "Other administrative action",
    reopen: "Reopen exhausted job", confirmReopen: "This claim expired after three retries. Reopen this job, reset its retry counter, and preserve its existing proposal drafts?",
    reopenFailed: "Could not reopen the grading job.", reopened: "Job reopened and queued.",
  },
  ar: {
    course: "الدورة", studentAccount: "حساب الطالب", doctorAccount: "حساب المدرس", status: "الحالة",
    requested: "تاريخ الطلب", version: "الإصدار", setup: "الإعداد", studentEntry: "دخول الطالب", window: "الفترة",
    updated: "آخر تحديث", job: "المهمة", retries: "المحاولات", leaseExpires: "انتهاء المهلة", when: "التاريخ",
    action: "الإجراء", actor: "المنفذ", target: "الهدف", reason: "السبب", newStatus: "الحالة الجديدة",
    reasonLength: "السبب (من ٨ إلى ٥٠٠ حرف)", saving: "جارٍ الحفظ…", updateCase: "تحديث الحالة",
    newCase: "حالة دعم جديدة", subject: "الموضوع", summary: "الملخص (تجنب إجابات الامتحانات والتفاصيل الطبية)",
    accountId: "معرّف الحساب (اختياري)", priority: "الأولوية", normal: "عادية", urgent: "عاجلة",
    createCase: "إنشاء حالة", created: "تم إنشاء حالة الدعم.", accountPrefix: "الحساب: ",
    updatedPrefix: "آخر تحديث ", noMatch: "لا توجد سجلات مطابقة.", supportCasePrefix: "حالة الدعم",
    open: "مفتوحة", in_progress: "قيد المتابعة", resolved: "تم الحل", pending: "قيد الانتظار",
    approved: "مقبول", rejected: "مرفوض", withdrawn: "منسحب", suspended: "موقوف", removed: "محذوف",
    queued: "في الطابور", claimed: "مستلم", doctor_review: "مراجعة المدرس", configured: "مُعدّ",
    incomplete: "غير مكتمل", assigned: "مُكلّف", enabled: "مفعّل", disabled: "معطّل",
    completedSnapshot: "آخر إحصاء مكتمل: ", lastCompleted: "مكتمل", sincePrevious: "التغيير منذ الإحصاء السابق",
    scheduled: "مجدول", manual: "يدوي", enrollmentOperations: "إدارة تسجيل الدورات",
    examOperations: "إدارة نشر الامتحانات", gradingOperations: "إدارة التصحيح المساعد",
    supportOperations: "مسارات دعم المنصة", auditHistory: "سجل إدارة المنصة",
    account: "الحساب", plan: "الخطة", planExpired: "انتهت الخطة", suspensionExpired: "انتهى الإيقاف",
    grantAdmin: "تم منح صلاحية الإدارة", revokeAdmin: "تم إلغاء صلاحية الإدارة", free: "مجانية", pro: "احترافية",
    refreshFailed: "تعذر تحديث بيانات الاستخدام.", updateFailed: "تعذر تحديث حالة الدعم.",
    createFailed: "تعذر إنشاء حالة الدعم.", otherAction: "إجراء إداري آخر",
    reopen: "إعادة فتح المهمة المستنفدة", confirmReopen: "انتهت مهلة هذه المهمة بعد ثلاث محاولات. هل تريد إعادة فتحها وتصفير عداد المحاولات مع الاحتفاظ بمسودات التقييم؟",
    reopenFailed: "تعذرت إعادة فتح مهمة التصحيح.", reopened: "أعيد فتح المهمة وإضافتها إلى الطابور.",
  },
} as const;
function format(time: number | null, locale: "en" | "ar") {
  return time === null ? "—" : new Date(time).toLocaleString(locale === "ar" ? "ar-EG" : "en-US");
}
function statusLabel(value: string, locale: "en" | "ar") {
  return value in labels[locale] ? labels[locale][value as keyof typeof labels.en] : value;
}
function auditActionLabel(action: string, locale: "en" | "ar") {
  if (action === "support_case_created") return labels[locale].created;
  if (action.startsWith("support_case_"))
    return labels[locale].supportCasePrefix + " · " + statusLabel(action.slice("support_case_".length), locale);
  if (action.startsWith("account_"))
    return labels[locale].account + " · " + statusLabel(action.slice("account_".length), locale);
  if (action === "plan_free" || action === "plan_pro")
    return labels[locale].plan + " · " + labels[locale][action.slice("plan_".length) as "free" | "pro"];
  if (action === "plan_expired") return labels[locale].planExpired;
  if (action === "suspension_expired") return labels[locale].suspensionExpired;
  if (action === "grant_admin") return labels[locale].grantAdmin;
  if (action === "revoke_admin") return labels[locale].revokeAdmin;
  return locale === "ar" ? labels.ar.otherAction : action.replaceAll("_", " ");
}
function More({ status, loadMore, empty, loading, load, noMatch }: {
  status: string; loadMore: (count: number) => void;
  empty: boolean; loading: string; load: string; noMatch: string;
}) {
  return <div className="space-y-3">
    {status === "LoadingFirstPage" && <output>{loading}</output>}
    {status !== "LoadingFirstPage" && empty && <p className="ws-page-subtitle">{noMatch}</p>}
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
  return <section className="space-y-4" aria-label={labels[locale].enrollmentOperations}>
    <label className="flex flex-wrap gap-2 items-center text-sm">{labels[locale].status}
      <select className="kb-input w-auto" aria-label={labels[locale].status} value={status} onChange={e => setStatus(e.target.value as typeof status)}>
        {["", "pending", "approved", "rejected", "withdrawn", "suspended", "removed"].map(s =>
          <option key={s} value={s}>{s || translations[locale].all}</option>)}
      </select>
    </label>
    {!!q.results.length && <div className="ws-table-wrap"><table className="ws-table">
      <thead><tr><th>{labels[locale].course}</th><th>{labels[locale].studentAccount}</th><th>{labels[locale].doctorAccount}</th><th>{labels[locale].status}</th><th>{labels[locale].requested}</th></tr></thead>
      <tbody>{q.results.map(row => <tr key={row.id}>
        <td><strong dir="auto">{row.courseTitle}</strong><small className="block text-muted-foreground break-all">{row.courseId}</small></td>
        <td className="break-all">{row.studentId}</td><td className="break-all">{row.ownerId}</td>
        <td>{statusLabel(row.status, locale)}</td><td>{format(row.requestedAt, locale)}</td>
      </tr>)}</tbody>
    </table></div>}
    <More status={q.status} loadMore={q.loadMore} empty={!q.results.length} loading={translations[locale].loading} load={translations[locale].load} noMatch={labels[locale].noMatch} />
  </section>;
}

function Exams({ locale }: { locale: "en" | "ar" }) {
  const q = usePaginatedQuery(api.adminOperations.exams, {}, { initialNumItems: 20 });
  return <section className="space-y-4" aria-label={labels[locale].examOperations}>
    {!!q.results.length && <div className="ws-table-wrap"><table className="ws-table">
      <thead><tr><th>{labels[locale].course}</th><th>{labels[locale].doctorAccount}</th><th>{labels[locale].version}</th><th>{labels[locale].setup}</th><th>{labels[locale].studentEntry}</th><th>{labels[locale].window}</th><th>{labels[locale].updated}</th></tr></thead>
      <tbody>{q.results.map(row => <tr key={row.id}>
        <td><strong dir="auto">{row.courseTitle}</strong><small className="block text-muted-foreground break-all">{row.id}</small></td>
        <td className="break-all">{row.ownerId}</td><td>{row.version}</td>
        <td>{row.configured ? labels[locale].configured : labels[locale].incomplete}{row.assigned ? " · " + labels[locale].assigned : ""}</td>
        <td>{row.studentEntryEnabled ? labels[locale].enabled : labels[locale].disabled}</td>
        <td>{row.mode === "scheduled" ? format(row.opensAt, locale) + " – " + format(row.closesAt, locale) : row.mode ? statusLabel(row.mode, locale) : "—"}</td>
        <td>{format(row.updatedAt, locale)}</td>
      </tr>)}</tbody>
    </table></div>}
    <More status={q.status} loadMore={q.loadMore} empty={!q.results.length} loading={translations[locale].loading} load={translations[locale].load} noMatch={labels[locale].noMatch} />
  </section>;
}

function Grading({ locale }: { locale: "en" | "ar" }) {
  const [status, setStatus] = useState<"" | "queued" | "claimed" | "doctor_review">("");
  const q = usePaginatedQuery(api.adminOperations.grading, { status: status || undefined }, { initialNumItems: 20 });
  const reopen = useMutation(api.examGradingJobs.adminReopen);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return <section className="space-y-4" aria-label={labels[locale].gradingOperations}>
    <label className="flex flex-wrap gap-2 items-center text-sm">{labels[locale].status}
      <select className="kb-input w-auto" aria-label={labels[locale].status} value={status} onChange={e => setStatus(e.target.value as typeof status)}>
        {["", "queued", "claimed", "doctor_review"].map(s => <option key={s} value={s}>{s || translations[locale].all}</option>)}
      </select>
    </label>
    {!!q.results.length && <div className="ws-table-wrap"><table className="ws-table">
      <thead><tr><th>{labels[locale].job}</th><th>{labels[locale].doctorAccount}</th><th>{labels[locale].status}</th><th>{labels[locale].retries}</th><th>{labels[locale].leaseExpires}</th><th>{labels[locale].updated}</th><th>{labels[locale].action}</th></tr></thead>
      <tbody>{q.results.map(row => <tr key={row.id}>
        <td className="break-all">{row.id}</td><td className="break-all">{row.ownerId}</td><td>{statusLabel(row.status, locale)}</td>
        <td>{row.retryCount}</td><td>{format(row.claimExpiresAt, locale)}</td><td>{format(row.updatedAt, locale)}</td>
        <td>{row.status === "claimed" && row.retryCount >= 3 && row.claimExpiresAt !== null && row.claimExpiresAt <= now && <button type="button" className="ws-btn ws-btn--sm" disabled={busy !== null} onClick={async () => {
          if (!window.confirm(labels[locale].confirmReopen)) return;
          setBusy(row.id); setError("");
          try { await reopen({ jobId: row.id as Id<"examGradingJobs">, expectedRevision: row.revision, confirmReopen: true }); }
          catch { setError(locale === "ar" ? labels.ar.reopenFailed : labels.en.reopenFailed); }
          finally { setBusy(null); }
        }}>{busy === row.id ? labels[locale].saving : labels[locale].reopen}</button>}</td>
      </tr>)}</tbody>
    </table></div>}
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    <More status={q.status} loadMore={q.loadMore} empty={!q.results.length} loading={translations[locale].loading} load={translations[locale].load} noMatch={labels[locale].noMatch} />
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
      ? labels[locale].completedSnapshot + format(report.completedAt, locale)
      : locale === "ar" ? "لا يوجد إحصاء مكتمل بعد." : "No completed snapshot yet."}
      {report?.running ? (locale === "ar" ? " التحديث جارٍ." : " Refresh in progress.") : ""}
    </p>
    <button className="ws-btn" disabled={busy || report?.running} onClick={async () => {
      setBusy(true); setError("");
      try { await refresh({}); } catch (e) { setError(locale === "ar" ? labels.ar.refreshFailed : e instanceof Error ? e.message : labels.en.refreshFailed); }
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
          {differences.length > 0 && <div className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label={labels[locale].sincePrevious}>
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
              <td>{format(row.completedAt, locale)}</td><td>{numeric(row.counts.users)}</td>
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
function SupportCase({ item, locale }: { item: SupportRow; locale: "en" | "ar" }) {
  const [status, setStatus] = useState<SupportRow["status"]>(item.status);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const transition = useMutation(api.adminOperations.transitionCase);
  return <article className="rounded-lg border p-4 space-y-3">
    <div className="flex flex-wrap justify-between items-start gap-2">
      <div><strong dir="auto">{item.subject}</strong><p className="text-sm text-muted-foreground whitespace-pre-wrap" dir="auto">{item.summary}</p></div>
      <span className="text-sm">{statusLabel(item.priority, locale)} · {statusLabel(item.status, locale)}</span>
    </div>
    <p className="text-xs text-muted-foreground break-all">{item.accountId ? labels[locale].accountPrefix + item.accountId + " · " : ""}{labels[locale].updatedPrefix}{format(item.updatedAt, locale)}</p>
    <div className="flex flex-wrap gap-2 items-end">
      <label className="text-sm">{labels[locale].newStatus}
        <select className="kb-input block" aria-label={labels[locale].newStatus + " · " + item.subject} value={status} onChange={e => setStatus(e.target.value as SupportRow["status"])}>
          <option value="open">{labels[locale].open}</option><option value="in_progress">{labels[locale].in_progress}</option><option value="resolved">{labels[locale].resolved}</option>
        </select>
      </label>
      <label className="flex-1 min-w-48 text-sm">{labels[locale].reasonLength}
        <input className="kb-input block w-full" maxLength={500} value={reason}
          aria-label={labels[locale].reason + " · " + item.subject} onChange={e => setReason(e.target.value)} />
      </label>
      <button className="ws-btn" disabled={saving || status === item.status || reason.trim().length < 8}
        onClick={async () => {
          setSaving(true); setError("");
          try { await transition({ caseId: item.id, status, expectedRevision: item.revision, reason }); setReason(""); }
          catch (e) { setError(locale === "ar" ? labels.ar.updateFailed : e instanceof Error ? e.message : labels.en.updateFailed); }
          finally { setSaving(false); }
        }}>{saving ? labels[locale].saving : labels[locale].updateCase}</button>
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
  return <section className="space-y-5" aria-label={labels[locale].supportOperations}>
    <form className="rounded-lg border p-4 space-y-3" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError(""); setCreated(false);
      try {
        await create({ subject, summary, priority, ...(accountId.trim() ? { accountId: accountId.trim() } : {}) });
        setSubject(""); setSummary(""); setAccountId(""); setCreated(true);
      } catch (e) { setError(locale === "ar" ? labels.ar.createFailed : e instanceof Error ? e.message : labels.en.createFailed); }
      finally { setBusy(false); }
    }}>
      <h2 className="font-semibold">{labels[locale].newCase}</h2>
      <label className="block text-sm">{labels[locale].subject}
        <input className="kb-input block w-full" required minLength={3} maxLength={160} value={subject} onChange={e => setSubject(e.target.value)} />
      </label>
      <label className="block text-sm">{labels[locale].summary}
        <textarea className="kb-input block w-full" required minLength={10} maxLength={1200} rows={3} value={summary} onChange={e => setSummary(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm flex-1">{labels[locale].accountId}
          <input className="kb-input block w-full" value={accountId} onChange={e => setAccountId(e.target.value)} />
        </label>
        <label className="text-sm">{labels[locale].priority}
          <select className="kb-input block" value={priority} onChange={e => setPriority(e.target.value as typeof priority)}>
            <option value="normal">{labels[locale].normal}</option><option value="urgent">{labels[locale].urgent}</option>
          </select>
        </label>
      </div>
      <button className="ws-btn" disabled={busy || subject.trim().length < 3 || summary.trim().length < 10}>{busy ? labels[locale].saving : labels[locale].createCase}</button>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {created && <output>{labels[locale].created}</output>}
    </form>
    <label className="flex gap-2 items-center text-sm">{labels[locale].status}
      <select className="kb-input w-auto" aria-label={labels[locale].status} value={status} onChange={e => setStatus(e.target.value as typeof status)}>
        {["", "open", "in_progress", "resolved"].map(s => <option key={s} value={s}>{s ? statusLabel(s, locale) : translations[locale].all}</option>)}
      </select>
    </label>
    <div className="space-y-3">{q.results.map(item => <SupportCase key={item.id} item={item} locale={locale} />)}</div>
    <More status={q.status} loadMore={q.loadMore} empty={!q.results.length} loading={translations[locale].loading} load={translations[locale].load} noMatch={labels[locale].noMatch} />
  </section>;
}

function Audit({ locale }: { locale: "en" | "ar" }) {
  const q = usePaginatedQuery(api.adminOperations.audit, {}, { initialNumItems: 20 });
  return <section className="space-y-4" aria-label={labels[locale].auditHistory}>
    {!!q.results.length && <div className="ws-table-wrap"><table className="ws-table">
      <thead><tr><th>{labels[locale].when}</th><th>{labels[locale].action}</th><th>{labels[locale].actor}</th><th>{labels[locale].target}</th><th>{labels[locale].reason}</th></tr></thead>
      <tbody>{q.results.map(row => <tr key={row.id}>
        <td>{format(row.createdAt, locale)}</td><td>{auditActionLabel(row.action, locale)}</td><td className="break-all">{row.actorId}</td>
        <td className="break-all">{row.target}</td><td className="break-words" dir="auto">{row.reason}</td>
      </tr>)}</tbody>
    </table></div>}
    <More status={q.status} loadMore={q.loadMore} empty={!q.results.length} loading={translations[locale].loading} load={translations[locale].load} noMatch={labels[locale].noMatch} />
  </section>;
}

/** AdminGate in /admin/page.tsx also gates the entire component. Every query rechecks the server role. */
export default function OperationsPanel() {
  const params = useParams<{ lang?: string }>();
  const locale = params?.lang === "ar" ? "ar" : "en";
  const [tab, setTab] = useState<Tab>("enrollments");
  return <div className="space-y-5" dir={locale === "ar" ? "rtl" : "ltr"}>
    <p className="ws-page-subtitle">{translations[locale].meta}</p>
    <WsTabs tabs={tabs} value={tab} onChange={setTab} label={locale === "ar" ? "أقسام إدارة المنصة" : "Operational platform sections"}
      labels={translations[locale]} />
    {tab === "enrollments" ? <Enrollments locale={locale} /> :
     tab === "exams" ? <Exams locale={locale} /> :
     tab === "grading" ? <Grading locale={locale} /> :
     tab === "usage" ? <Usage locale={locale} /> :
     tab === "support" ? <Support locale={locale} /> : <Audit locale={locale} />}
  </div>;
}
