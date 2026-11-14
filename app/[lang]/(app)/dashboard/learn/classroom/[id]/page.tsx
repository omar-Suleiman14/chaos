"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import "@/components/courses/courses.css";

const words = {
  en: { title: "My classroom", lead: "Announcements, class schedule and private messages with your doctor.",
    back: "My learning", announcement: "Course announcements", none: "No announcements yet.",
    calendar: "Course calendar", event: "Class", due: "Assignment deadline", start: "Starts", end: "Ends",
    noEvents: "No scheduled classes or assignments.", location: "Location",
    messages: "Private messages with doctor", empty: "No messages yet.",
    reply: "Your message", send: "Send", sent: "Message sent.", error: "Message could not be sent.",
    loading: "Loading classroom", signIn: "Sign in to access an approved course." },
  ar: { title: "فصلي", lead: "إعلانات الدورة ومواعيد المحاضرات ورسائلك الخاصة مع الدكتور.",
    back: "تعلمي", announcement: "إعلانات الدورة", none: "لا توجد إعلانات بعد.",
    calendar: "تقويم الدورة", event: "لقاء", due: "آخر موعد للتكليف", start: "يبدأ", end: "ينتهي",
    noEvents: "لا توجد مواعيد حاليًا.", location: "المكان",
    messages: "رسائل خاصة مع الدكتور", empty: "لا توجد رسائل بعد.",
    reply: "رسالتك", send: "إرسال", sent: "تم إرسال الرسالة.", error: "تعذر إرسال الرسالة.",
    loading: "جارٍ تحميل الفصل", signIn: "سجّل الدخول لعرض دورة تمت الموافقة عليها." },
} as const;
export default function StudentClassroom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params), courseId = id as Id<"learnCollections">;
  const { locale } = useLocale(), ar = locale === "ar", t = words[ar ? "ar" : "en"];
  const { isAuthenticated, isLoading } = useConvexAuth();
  const announcements = useQuery(api.courseCommunications.myAnnouncements, isAuthenticated ? { courseId } : "skip");
  const events = useQuery(api.courseCommunications.myEvents, isAuthenticated ? { courseId } : "skip");
  const tasks = useQuery(api.courseAssignments.myAssignments, isAuthenticated ? { courseId } : "skip");
  const conversation = useQuery(api.courseCommunications.conversation, isAuthenticated ? { courseId } : "skip");
  const send = useMutation(api.courseCommunications.sendMessage);
  const [body, setBody] = useState(""), [busy, setBusy] = useState(false);
  const fmt = (ms: number) => new Date(ms).toLocaleString(ar ? "ar-EG" : "en", { dateStyle: "medium", timeStyle: "short" });
  const calendar = [
    ...(events ?? []).map(e => ({ id: String(e.id), title: e.title, when: e.startsAt, end: e.endsAt,
      type: "event" as const, description: e.details, location: e.location })),
    ...(tasks ?? []).map(a => ({ id: String(a.id), title: a.title, when: a.dueAt, end: a.dueAt,
      type: "due" as const, description: "", location: "" })),
  ].sort((a, b) => a.when - b.when);
  if (isLoading || (isAuthenticated && (announcements === undefined || events === undefined ||
      tasks === undefined || conversation === undefined))) return <PageSkeleton label={t.loading} />;
  if (!isAuthenticated) return <main className="lx-page">{t.signIn}</main>;
  return <main className="lx-page grid gap-5" dir={ar ? "rtl" : "ltr"}>
    <Link href="/dashboard/learn" className="ws-btn ws-btn--ghost ws-btn--sm w-fit">{t.back}</Link>
    <header className="lx-hero"><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.lead}</p></header>
    <section className="cb-section grid gap-3">
      <h2 className="text-lg font-semibold">{t.announcement}</h2>
      {!announcements?.length && <p className="cb-note">{t.none}</p>}
      {announcements?.map(a => <article className="grid gap-2 rounded-lg border border-border p-3" key={a.id}>
        <h3 className="font-semibold" dir="auto">{a.title}</h3>
        <p className="whitespace-pre-wrap" dir="auto">{a.body}</p>
        <p className="cb-note">{fmt(a.updatedAt)}</p>
      </article>)}
    </section>
    <section className="cb-section grid gap-3">
      <h2 className="text-lg font-semibold">{t.calendar}</h2>
      {!calendar.length && <p className="cb-note">{t.noEvents}</p>}
      {calendar.map(e => <article className="rounded-lg border border-border p-3 grid gap-1" key={e.type + e.id}>
        <div className="flex flex-wrap gap-2 items-center">
          <h3 className="font-semibold" dir="auto">{e.title}</h3>
          <span className="cb-note">{e.type === "due" ? t.due : t.event}</span>
        </div>
        <p>{t.start}: {fmt(e.when)} {e.type === "event" ? "· " + t.end + ": " + fmt(e.end) : ""}</p>
        {e.location && <p dir="auto">{t.location}: {e.location}</p>}
        {e.description && <p className="whitespace-pre-wrap" dir="auto">{e.description}</p>}
      </article>)}
    </section>
    <section className="cb-section grid gap-3">
      <h2 className="text-lg font-semibold">{t.messages}</h2>
      {!conversation?.length && <p className="cb-note">{t.empty}</p>}
      <div className="grid max-h-96 gap-2 overflow-y-auto" aria-live="polite">
        {conversation?.map(m => <article className="rounded-lg border border-border p-3" key={m.id}>
          <p className="whitespace-pre-wrap" dir="auto">{m.body}</p>
          <p className="cb-note">{m.isMine ? (ar ? "أنت" : "You") : (ar ? "الدكتور" : "Doctor")} · {fmt(m.createdAt)}</p>
        </article>)}
      </div>
      <form className="grid gap-2" onSubmit={e => { e.preventDefault(); if (busy) return; setBusy(true);
        void send({ courseId, body }).then(() => { setBody(""); toast.success(t.sent); })
          .catch(error => toast.error(error, { fallback: t.error })).finally(() => setBusy(false)); }}>
        <label className="grid gap-1">{t.reply}
          <textarea className="kb-input" maxLength={2000} rows={3} required value={body} onChange={e => setBody(e.target.value)} /></label>
        <button type="submit" className="ws-btn ws-btn--primary w-fit" disabled={busy || !body.trim()}>{t.send}</button>
      </form>
    </section>
  </main>;
}
