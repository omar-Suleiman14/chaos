"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import "@/components/courses/courses.css";

const words = {
  en: { title: "Classroom & communications", back: "Course editor", intro: "Publish announcements, schedule classes and reply privately to approved students.",
    announcements: "Announcements", name: "Title", body: "Message", draft: "Create draft", publish: "Publish",
    withhold: "Unpublish", archive: "Archive", empty: "No announcements yet.",
    calendar: "Class calendar", event: "Schedule event", details: "Details", venue: "Room or meeting information",
    start: "Starts", end: "Ends", due: "Assignment due", noEvents: "No events scheduled.",
    management: "Class management", roster: "Approved students", groups: "Groups", manage: "Manage class membership",
    messages: "Private student messages", select: "Select an approved student", send: "Send", reply: "Write a reply",
    noMessages: "No messages yet.", loadOlder: "Load older messages", loading: "Loading…", saved: "Saved.", error: "Could not complete action.",
    unpublished: "Draft", published: "Published", updated: "Updated" },
  ar: { title: "الفصل والتواصل", back: "محرر الدورة", intro: "انشر الإعلانات، وجدول المحاضرات، وتواصل مع الطلاب المعتمدين بشكل خاص.",
    announcements: "الإعلانات", name: "العنوان", body: "الرسالة", draft: "إنشاء مسودة", publish: "نشر",
    withhold: "إلغاء النشر", archive: "أرشفة", empty: "لا توجد إعلانات.",
    calendar: "تقويم الدورة", event: "جدولة لقاء", details: "التفاصيل", venue: "قاعة أو معلومات الاجتماع",
    start: "يبدأ", end: "ينتهي", due: "موعد تسليم التكليف", noEvents: "لا توجد لقاءات.",
    management: "إدارة الفصل", roster: "الطلاب المعتمدون", groups: "المجموعات", manage: "إدارة أعضاء الدورة",
    messages: "رسائل الطلاب الخاصة", select: "اختر طالبًا معتمدًا", send: "إرسال", reply: "اكتب الرد",
    noMessages: "لا توجد رسائل.", loadOlder: "تحميل رسائل أقدم", loading: "جارٍ التحميل…", saved: "تم الحفظ.", error: "تعذر إتمام العملية.",
    unpublished: "مسودة", published: "منشور", updated: "آخر تحديث" },
} as const;
function inputDate(ms: number) {
  return new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export default function TeacherClassroom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params), courseId = id as Id<"learnCollections">;
  const { locale } = useLocale(), ar = locale === "ar", t = words[ar ? "ar" : "en"];
  const { isAuthenticated, isLoading } = useConvexAuth();
  const anns = useQuery(api.courseCommunications.teacherAnnouncements, isAuthenticated ? { courseId } : "skip");
  const events = useQuery(api.courseCommunications.teacherEvents, isAuthenticated ? { courseId } : "skip");
  const roster = useQuery(api.courseCohorts.roster, isAuthenticated ? { courseId } : "skip");
  const tasks = useQuery(api.courseAssignments.teacherAssignments, isAuthenticated ? { courseId } : "skip");
  const [student, setStudent] = useState("");
  const messages = usePaginatedQuery(api.courseCommunications.conversation,
    isAuthenticated && student ? { courseId, studentId: student } : "skip", { initialNumItems: 50 });
  const createAnn = useMutation(api.courseCommunications.createAnnouncement);
  const reviseAnn = useMutation(api.courseCommunications.reviseAnnouncement);
  const createEvent = useMutation(api.courseCommunications.createEvent);
  const reviseEvent = useMutation(api.courseCommunications.reviseEvent);
  const send = useMutation(api.courseCommunications.sendMessage);
  const [aTitle, setATitle] = useState(""), [aBody, setABody] = useState("");
  const [eTitle, setETitle] = useState(""), [eDetails, setEDetails] = useState(""), [venue, setVenue] = useState("");
  const [start, setStart] = useState(() => inputDate(Date.now() + 86400000));
  const [end, setEnd] = useState(() => inputDate(Date.now() + 90000000));
  const [reply, setReply] = useState(""), [busy, setBusy] = useState(false);
  async function work(action: () => Promise<unknown>, after?: () => void) {
    if (busy) return;
    setBusy(true);
    try { await action(); after?.(); toast.success(t.saved); }
    catch (error) { toast.error(error, { fallback: t.error }); }
    finally { setBusy(false); }
  }
  if (isLoading || (isAuthenticated && (anns === undefined || events === undefined || roster === undefined || tasks === undefined)))
    return <PageSkeleton label={t.title} />;
  if (!isAuthenticated) return <main className="lx-page">{t.title}</main>;
  const approved = roster?.students.filter(s => s.status === "approved") ?? [];
  const fmt = (ms: number) => new Date(ms).toLocaleString(ar ? "ar-EG" : "en", { dateStyle: "medium", timeStyle: "short" });
  return <main className="lx-page grid gap-5" dir={ar ? "rtl" : "ltr"}>
    <Link className="ws-btn ws-btn--ghost ws-btn--sm w-fit" href={"/dashboard/courses/" + id}>{t.back}</Link>
    <header className="lx-hero"><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.intro}</p></header>
    <section className="cb-section grid gap-3">
      <h2 className="text-lg font-semibold">{t.announcements}</h2>
      <form className="grid gap-2" onSubmit={e => { e.preventDefault(); void work(
        () => createAnn({ courseId, title: aTitle, body: aBody }),
        () => { setATitle(""); setABody(""); }); }}>
        <label className="grid gap-1">{t.name}<input required maxLength={180} className="kb-input" value={aTitle} onChange={e => setATitle(e.target.value)} /></label>
        <label className="grid gap-1">{t.body}<textarea required maxLength={4000} rows={3} className="kb-input" value={aBody} onChange={e => setABody(e.target.value)} /></label>
        <button type="submit" disabled={busy} className="ws-btn ws-btn--primary w-fit">{t.draft}</button>
      </form>
      {!anns?.length && <p className="cb-note">{t.empty}</p>}
      {anns?.filter(a => !a.archived).map(a => <article className="grid gap-2 rounded-lg border border-border p-3" key={a._id}>
        <div className="flex flex-wrap items-center gap-2"><strong dir="auto">{a.title}</strong>
          <span className="cb-note">{a.published ? t.published : t.unpublished}</span></div>
        <p dir="auto" className="whitespace-pre-wrap">{a.body}</p>
        <p className="cb-note">{t.updated}: {fmt(a.updatedAt)}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} className="ws-btn ws-btn--ghost ws-btn--sm"
            onClick={() => void work(() => reviseAnn({ announcementId: a._id, expectedRevision: a.revision,
              title: a.title, body: a.body, published: !a.published, archived: false }))}>{a.published ? t.withhold : t.publish}</button>
          <button type="button" disabled={busy} className="ws-btn ws-btn--ghost ws-btn--sm"
            onClick={() => void work(() => reviseAnn({ announcementId: a._id, expectedRevision: a.revision,
              title: a.title, body: a.body, published: false, archived: true }))}>{t.archive}</button>
        </div>
      </article>)}
    </section>
    <section className="cb-section grid gap-3">
      <h2 className="text-lg font-semibold">{t.calendar}</h2>
      <form className="grid gap-2" onSubmit={e => { e.preventDefault(); void work(
        () => createEvent({ courseId, title: eTitle, details: eDetails, location: venue,
          startsAt: new Date(start).getTime(), endsAt: new Date(end).getTime() }),
        () => { setETitle(""); setEDetails(""); setVenue(""); }); }}>
        <label className="grid gap-1">{t.name}<input required maxLength={180} className="kb-input" value={eTitle} onChange={e => setETitle(e.target.value)} /></label>
        <label className="grid gap-1">{t.details}<textarea className="kb-input" maxLength={2000} value={eDetails} onChange={e => setEDetails(e.target.value)} /></label>
        <label className="grid gap-1">{t.venue}<input className="kb-input" maxLength={240} value={venue} onChange={e => setVenue(e.target.value)} /></label>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1">{t.start}<input required type="datetime-local" className="kb-input" value={start} onChange={e => setStart(e.target.value)} /></label>
          <label className="grid gap-1">{t.end}<input required type="datetime-local" className="kb-input" value={end} onChange={e => setEnd(e.target.value)} /></label>
        </div>
        <button type="submit" disabled={busy} className="ws-btn ws-btn--primary w-fit">{t.event}</button>
      </form>
      {!events?.length && <p className="cb-note">{t.noEvents}</p>}
      {events?.filter(e => !e.archived).map(e => <article className="grid gap-2 rounded-lg border border-border p-3" key={e._id}>
        <strong dir="auto">{e.title}</strong><p>{fmt(e.startsAt)} – {fmt(e.endsAt)}</p>
        {e.location && <p dir="auto">{e.location}</p>}
        {e.details && <p dir="auto" className="whitespace-pre-wrap">{e.details}</p>}
        <p className="cb-note">{e.published ? t.published : t.unpublished}</p>
        <div className="flex gap-2">
          <button type="button" disabled={busy} className="ws-btn ws-btn--ghost ws-btn--sm"
            onClick={() => void work(() => reviseEvent({ eventId: e._id, expectedRevision: e.revision, title: e.title,
              details: e.details, location: e.location, startsAt: e.startsAt, endsAt: e.endsAt,
              published: !e.published, archived: false }))}>{e.published ? t.withhold : t.publish}</button>
          <button type="button" disabled={busy} className="ws-btn ws-btn--ghost ws-btn--sm"
            onClick={() => void work(() => reviseEvent({ eventId: e._id, expectedRevision: e.revision, title: e.title,
              details: e.details, location: e.location, startsAt: e.startsAt, endsAt: e.endsAt,
              published: false, archived: true }))}>{t.archive}</button>
        </div>
      </article>)}
      {tasks?.filter(a => a.published && !a.archived).map(a => <p className="cb-note" key={a._id}>
        {t.due}: <span dir="auto">{a.title}</span> — {fmt(a.dueAt)}</p>)}
    </section>
    <section className="cb-section grid gap-3">
      <h2 className="text-lg font-semibold">{t.management}</h2>
      <p className="cb-note">{t.roster}: {approved.length} · {t.groups}: {roster?.groups.length ?? 0}</p>
      {roster?.truncated && <p className="cb-note">{ar ? "القائمة جزئية، راجع إدارة الدورة." : "Roster is partial; use course management."}</p>}
      <Link className="ws-btn ws-btn--ghost w-fit" href={"/dashboard/courses/" + id}>{t.manage}</Link>
      <h3 className="font-semibold">{t.messages}</h3>
      <label className="grid gap-1">{t.select}<select className="kb-input" value={student} onChange={e => setStudent(e.target.value)}>
        <option value="">{t.select}</option>{approved.map(s => <option key={s.studentId} value={s.studentId}>{s.name} {s.username ? "(@" + s.username + ")" : ""}</option>)}
      </select></label>
      {student && <><div className="grid max-h-80 gap-2 overflow-y-auto" aria-live="polite">
        {messages.status === "LoadingFirstPage" && <p className="cb-note">{t.loading}</p>}
        {messages.status !== "LoadingFirstPage" && !messages.results.length && <p className="cb-note">{t.noMessages}</p>}
        {messages.results.slice().reverse().map(m => <article key={m.id} className="rounded-lg border border-border p-3">
          <p dir="auto" className="whitespace-pre-wrap">{m.body}</p><p className="cb-note">{m.isMine ? (ar ? "أنت" : "You") : (ar ? "الطالب" : "Student")} · {fmt(m.createdAt)}</p>
        </article>)}
      </div>{messages.status !== "Exhausted" && <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm w-fit" disabled={messages.status === "LoadingMore"} onClick={() => messages.loadMore(50)}>{messages.status === "LoadingMore" ? t.loading : t.loadOlder}</button>}<form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void work(
        () => send({ courseId, studentId: student, body: reply }), () => setReply("")); }}>
        <label className="flex-1">{t.reply}<textarea required maxLength={2000} rows={2} className="kb-input w-full" value={reply} onChange={e => setReply(e.target.value)} /></label>
        <button type="submit" className="ws-btn ws-btn--primary self-end" disabled={busy || !reply.trim()}>{t.send}</button>
      </form></>}
    </section>
  </main>;
}
