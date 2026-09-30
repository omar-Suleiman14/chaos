"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, Flag, Layers, PenLine } from "lucide-react";
import { Avatar, EmptyState, LessonCard, VerificationBadges } from "@/components/learn/ui";
import ReportDialog from "@/components/learn/reader/ReportDialog";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import { useLearnCapabilities, useLearnViewer, usePerson, useProgress } from "@/lib/learn/data";
import { formatNumber, useCopy, useLocale } from "@/lib/i18n";

const copy = {
  en: {
    loading: "Loading profile…", missing: "Profile not found", missingBody: "This person has no public lessons or profile.",
    lessons: "Published lessons", cards: "Flashcard sets", stats: { lessons: "Lessons", views: "Reads", saves: "Saves", helpful: "Found helpful" },
    edit: "Edit your profile", report: "Report profile", verifyNote: "Badges confirm identity (enrolment or teaching role), not that content is correct.",
    noLessons: "No public lessons yet.", cardsCount: (n: number) => `${n} cards`,
  },
  ar: {
    loading: "جارٍ تحميل الملف الشخصي…", missing: "الملف غير موجود", missingBody: "لا دروس عامة أو ملف شخصي لهذا الشخص.",
    lessons: "الدروس المنشورة", cards: "مجموعات البطاقات", stats: { lessons: "الدروس", views: "القراءات", saves: "الحفظ", helpful: "وجدوه مفيدًا" },
    edit: "عدّل ملفك", report: "أبلغ عن الملف", verifyNote: "تؤكد الشارات الهوية (التسجيل أو التدريس)، لا صحة المحتوى.",
    noLessons: "لا دروس عامة بعد.", cardsCount: (n: number) => `${n} بطاقة`,
  },
};

export default function ProfileView({ id }: { id: string }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const person = usePerson(id);
  const viewer = useLearnViewer();
  const caps = useLearnCapabilities();
  const progress = useProgress() ?? {};
  const [reporting, setReporting] = useState(false);
  if (person === undefined) return <PageSkeleton label={t.loading} />;
  if (person === null) return <div className="lx-page lx-page--narrow" style={{ padding: "48px 16px" }}><EmptyState title={t.missing} body={t.missingBody} /></div>;
  const totals = person.lessons.reduce((a, l) => ({ views: a.views + l.stats.views, saves: a.saves + l.stats.saves, helpful: a.helpful + l.stats.helpful }), { views: 0, saves: 0, helpful: 0 });
  const self = viewer?.id === id;
  return (
    <div className="lx-page" style={{ padding: "32px 16px 64px" }}>
      <header className="lx-profile">
        <Avatar person={person} />
        <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 220 }}>
          <h1 className="ws-page-title">{person.name}</h1>
          {person.username && <span className="lx-muted">@{person.username}</span>}
          {person.bio && <p className="lx-help" style={{ whiteSpace: "pre-wrap" }}>{person.bio}</p>}
          <div className="lx-badges"><VerificationBadges verifications={person.verifications} />
            {person.affiliations.filter((a) => !a.verified).map((a) => <span key={a.institution} className="lx-badge">{a.institution}</span>)}
          </div>
          {person.verifications.some((v) => v.status === "verified") && <small className="lx-muted"><BadgeCheck size={12} aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} /> {t.verifyNote}</small>}
        </div>
        <div className="lx-actions">
          {self && <Link className="ws-btn" href="/dashboard/learn/profile"><PenLine size={15} aria-hidden />{t.edit}</Link>}
          {!self && viewer?.signedIn && caps.reports && <button type="button" className="ws-btn ws-btn--ghost" onClick={() => setReporting(true)}><Flag size={15} aria-hidden />{t.report}</button>}
        </div>
      </header>
      <div className="lx-stats" role="list">
        {([["lessons", person.lessons.length], ["views", totals.views], ["saves", totals.saves], ["helpful", totals.helpful]] as const).map(([k, n]) => (
          <div key={k} role="listitem"><strong>{formatNumber(locale, n)}</strong><span>{t.stats[k]}</span></div>
        ))}
      </div>
      <section className="lx-section" aria-labelledby="profile-lessons">
        <header><h2 id="profile-lessons">{t.lessons}</h2></header>
        {person.lessons.length ? <div className="lx-grid">{person.lessons.map((l) => <LessonCard key={l.id} lesson={l} href={`/learn/${l.id}`} progress={progress[l.id]} />)}</div> : <p className="lx-muted">{t.noLessons}</p>}
      </section>
      {person.flashcards.length > 0 && (
        <section className="lx-section" aria-labelledby="profile-cards">
          <header><h2 id="profile-cards">{t.cards}</h2></header>
          <div className="lx-grid">{person.flashcards.map((s) => (
            <article key={s.id} className="lx-card"><span className="lx-card__meta"><Layers size={13} aria-hidden />{t.cardsCount(s.cards.length)}</span><h3><Link className="lx-card__link" href={`/dashboard/learn/flashcards/${s.id}`}>{s.title}</Link></h3></article>
          ))}</div>
        </section>
      )}
      {reporting && <ReportDialog target={{ kind: "profile", id }} title={person.name} onClose={() => setReporting(false)} />}
    </div>
  );
}
