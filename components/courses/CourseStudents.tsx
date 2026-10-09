"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CARD_THEMES } from "@/lib/memberCard";
import MemberAvatar from "@/components/MemberAvatar";
import Link from "@/components/site/SiteLink";
import { formatDate, useCopy, useLocale } from "@/lib/i18n";

const copy = {
  en: {
    title: "Students", loading: "Loading students…",
    unpublished: "Publish the course to start enrolling students.", empty: "No one has started this course yet. Share the course link to get your first students.",
    enrolled: "Students", enrolledHint: (signed: number, guests: number) => `${signed} signed in · ${guests} guests`,
    active: "Active this week", newHint: (n: number) => `${n} new this week`,
    finished: "Finished the course", avg: "Average progress",
    funnel: "Completion by lesson", funnelHelp: "How many students finished each lesson.",
    list: "Recent students", name: "Student", progress: "Progress", last: "Last lesson", seen: "Last active", guest: "Guest",
    truncated: "Showing the most recent 2,000 students.", more: (n: number) => `Showing the 100 most recent of ${n}.`,
    lessonsDone: (done: number, total: number) => `${done}/${total}`, done: "Finished",
  },
  ar: {
    title: "الطلاب", loading: "جارٍ تحميل الطلاب…",
    unpublished: "انشر الدورة لتبدأ باستقبال الطلاب.", empty: "لم يبدأ أحد هذه الدورة بعد. شارك رابط الدورة لتحصل على أول طلابك.",
    enrolled: "الطلاب", enrolledHint: (signed: number, guests: number) => `${signed} مسجّلون · ${guests} ضيوف`,
    active: "نشطون هذا الأسبوع", newHint: (n: number) => `${n} جدد هذا الأسبوع`,
    finished: "أنهوا الدورة", avg: "متوسط التقدم",
    funnel: "الإكمال حسب الدرس", funnelHelp: "كم طالبًا أنهى كل درس.",
    list: "أحدث الطلاب", name: "الطالب", progress: "التقدم", last: "آخر درس", seen: "آخر نشاط", guest: "ضيف",
    truncated: "يظهر أحدث 2,000 طالب.", more: (n: number) => `يظهر أحدث 100 من ${n}.`,
    lessonsDone: (done: number, total: number) => `${done}/${total}`, done: "أنهى",
  },
};

export default function CourseStudents({ courseId }: { courseId: Id<"learnCollections"> }) {
  const t = useCopy(copy), { locale } = useLocale();
  const data = useQuery(api.courseStudents.analytics, { courseId });
  const n = (value: number) => value.toLocaleString(locale);
  return (
    <section className="cb-section grid gap-4" aria-labelledby="cb-students">
      <h2 id="cb-students">{t.title}</h2>
      {data === undefined ? <output className="ws-stats ws-skeleton" style={{ minHeight: 88 }}  aria-label={t.loading} />
        : !data.published && data.enrolled === 0 ? <p className="cb-note">{t.unpublished}</p>
        : data.enrolled === 0 ? <p className="cb-note">{t.empty}</p>
        : <>
          <dl className="ws-stats">
            <div className="ws-stat"><dt>{t.enrolled}</dt><dd><span className="ws-stat__value">{n(data.enrolled)}</span><span className="ws-stat__hint">{t.enrolledHint(data.signedIn, data.guests)}</span></dd></div>
            <div className="ws-stat"><dt>{t.active}</dt><dd><span className="ws-stat__value">{n(data.active7d)}</span><span className="ws-stat__hint">{t.newHint(data.newThisWeek)}</span></dd></div>
            <div className="ws-stat"><dt>{t.finished}</dt><dd><span className="ws-stat__value">{n(data.finished)}</span><span className="ws-stat__hint">{Math.round(data.finished / data.enrolled * 100)}%</span></dd></div>
            <div className="ws-stat"><dt>{t.avg}</dt><dd><span className="ws-stat__value">{data.averagePercent}%</span></dd></div>
          </dl>

          {data.perLesson.length > 0 && <div className="ws-question">
            <div><h3 className="ws-question__title">{t.funnel}</h3><p className="ws-question__meta">{t.funnelHelp}</p></div>
            <div className="ws-bars">
              {data.perLesson.map((lesson, i) => {
                const pct = Math.round(lesson.completed / data.enrolled * 100);
                return <div key={lesson.id} className="ws-bars__row" title={`${lesson.title}: ${n(lesson.completed)} (${pct}%)`}>
                  <span className="ws-bars__label" dir="auto">{i + 1}. {lesson.title}</span>
                  <span className="ws-bars__value">{n(lesson.completed)}<span className="ws-bars__pct">{pct}%</span></span>
                  <span className="ws-bars__track" aria-hidden="true"><span className="ws-bars__fill" style={{ width: `${pct}%` }} /></span>
                </div>;
              })}
            </div>
          </div>}

          <div className="cs-students">
            <h3 className="ws-question__title">{t.list}</h3>
            <div className="cs-students__scroll">
              <table className="ws-table cs-table">
                <thead><tr><th>{t.name}</th><th>{t.progress}</th><th>{t.last}</th><th>{t.seen}</th></tr></thead>
                <tbody>{data.students.map(s => {
                  const theme = CARD_THEMES[s.style % CARD_THEMES.length];
                  const who = <><span className="cs-avatar" aria-hidden style={{ background: theme.art[1] }}><MemberAvatar seed={s.seed} size={22} /></span><span className="cs-name"><strong dir="auto">{s.name}</strong><small dir={s.username ? "ltr" : "auto"}>{s.username ? `@${s.username}` : t.guest}</small></span></>;
                  return <tr key={s.id}>
                    <td>{s.username ? <Link prefetch={false} className="cs-who" href={`/card/${encodeURIComponent(s.username)}`}>{who}</Link> : <span className="cs-who">{who}</span>}</td>
                    <td><span className="cs-progress"><span className="ws-bars__track" aria-hidden="true"><span className="ws-bars__fill" style={{ width: `${s.percent}%` }} /></span>{s.finished ? t.done : t.lessonsDone(s.completed, data.lessons)}</span></td>
                    <td className="cs-muted" dir="auto">{s.lastLesson ?? "—"}</td>
                    <td className="cs-muted">{formatDate(locale, s.lastActive, { dateStyle: "medium" })}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {data.truncated ? <p className="cb-note">{t.truncated}</p> : data.enrolled > data.students.length && <p className="cb-note">{t.more(data.enrolled)}</p>}
          </div>
        </>}
    </section>
  );
}
