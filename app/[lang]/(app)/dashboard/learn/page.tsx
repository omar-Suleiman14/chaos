"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Bookmark, BookOpen, Compass, GraduationCap, Layers, Plus, Target } from "lucide-react";
import { EmptyState, LessonCard } from "@/components/learn/ui";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import {
  useLearnActions, useLearnCapabilities, useMyLessons, useProgress, usePublicLessons, useRecentLessons, useSaved, useWeakAreas,
} from "@/lib/learn/data";
import { errorMessage } from "@/lib/errors";
import { useCopy, useLocale } from "@/lib/i18n";

const copy = {
  en: {
    title: "Learn", lead: "Your lessons, courses and study material in one place.", newLesson: "New lesson", explore: "Explore",
    continue: "Continue learning", continueEmpty: "Lessons you start show up here so you can pick up where you left off.",
    courses: "My courses", coursesEmpty: "Courses you start appear here with your next lesson.", browse: "Browse courses", all: "See all",
    saved: "Saved", savedEmpty: "Save lessons or single paragraphs and diagrams while you read.",
    recent: "Recently opened", mine: "Your lessons", mineEmpty: "Write a lesson from scratch: headings, images, videos, equations and sources.",
    discover: "New in Explore", discoverEmpty: "No public lessons yet. Publish one to start the collection.",
    review: "Needs review", reviewLead: "Concepts your recent practice suggests revisiting.", practice: "Practice", reread: "Re-read",
    loading: "Loading Learn…", block: "Saved part", untitled: "Untitled lesson",
  },
  ar: {
    title: "تعلّم", lead: "دروسك ومقرراتك ومواد مذاكرتك في مكان واحد.", newLesson: "درس جديد", explore: "استكشف",
    continue: "تابع التعلّم", continueEmpty: "تظهر هنا الدروس التي تبدأها لتكمل من حيث توقفت.",
    courses: "مقرراتي", coursesEmpty: "تظهر هنا الدورات التي تبدأها مع درسك التالي.", browse: "تصفح المقررات", all: "عرض الكل",
    saved: "المحفوظات", savedEmpty: "احفظ دروسًا أو فقرات ورسومًا منفردة أثناء القراءة.",
    recent: "فُتحت مؤخرًا", mine: "دروسك", mineEmpty: "اكتب درسًا من الصفر: عناوين وصور وفيديو ومعادلات ومصادر.",
    discover: "جديد في الاستكشاف", discoverEmpty: "لا دروس عامة بعد. انشر درسًا لتبدأ المجموعة.",
    review: "يحتاج إلى مراجعة", reviewLead: "مفاهيم يقترح تدريبك الأخير أن تعود إليها.", practice: "تدرّب", reread: "أعد القراءة",
    loading: "جارٍ تحميل Learn…", block: "جزء محفوظ", untitled: "درس بلا عنوان",
  },
};

export default function LearnHome() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const router = useRouter();
  const caps = useLearnCapabilities();
  const actions = useLearnActions();
  const mine = useMyLessons();
  const recent = useRecentLessons(12);
  const progress = useProgress();
  const saved = useSaved();
  const courses = useQuery(api.courses.myLearning, {});
  const discover = usePublicLessons({ sort: "recent" });
  const weak = useWeakAreas();
  const [error, setError] = useState("");

  if (!mine || !recent || !progress || !saved || !courses || !discover) return <PageSkeleton label={t.loading} />;

  const hrefFor = (id: string, ownerId: string) => mine.some((l) => l.id === id && l.ownerId === ownerId) ? `/dashboard/learn/lessons/${id}` : `/learn/${id}`;
  const inProgress = recent.filter(({ lesson }) => progress[lesson.id]?.state === "in_progress").slice(0, 3);
  const recentOther = recent.filter(({ lesson }) => !inProgress.some((r) => r.lesson.id === lesson.id)).slice(0, 6);
  const newLesson = async () => { try { const id = await actions.createLesson({ language: locale }); router.push(`/dashboard/learn/lessons/${id}`); } catch (err) { setError(errorMessage(err)); } };

  return (
    <div className="lx-page">
      <header className="lx-hero">
        <div><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.lead}</p></div>
        <div className="lx-actions">
          <Link href="/learn" className="ws-btn"><Compass size={16} aria-hidden />{t.explore}</Link>
          <button type="button" className="ws-btn ws-btn--primary" onClick={newLesson}><Plus size={16} aria-hidden />{t.newLesson}</button>
        </div>
      </header>
      {error && <p className="lx-error" role="alert">{error}</p>}

      <section className="lx-section" aria-labelledby="learn-continue">
        <header><h2 id="learn-continue">{t.continue}</h2></header>
        {inProgress.length ? (
          <div className="lx-grid">{inProgress.map(({ lesson }) => <LessonCard key={lesson.id} lesson={lesson} href={`/learn/${lesson.id}`} progress={progress[lesson.id]} />)}</div>
        ) : <p className="lx-muted">{t.continueEmpty}</p>}
      </section>

      <section className="lx-section" aria-labelledby="learn-courses">
        <header><h2 id="learn-courses">{t.courses}</h2><Link className="lx-link" href="/learn/courses">{courses.length ? t.all : t.browse}</Link></header>
        {courses.length ? (
          <div className="lx-level-grid">
            {courses.slice(0, 6).map(c => <Link key={c.id} className="lx-node" href={c.nextLessonId ? `/learn/${c.nextLessonId}?course=${c.id}` : `/learn/courses/${c.id}`}><GraduationCap size={18} aria-hidden /><span dir="auto">{c.title}<small>{c.completed} / {c.total} · {t.continue}</small></span></Link>)}
          </div>
        ) : <EmptyState icon={GraduationCap} title={t.courses} body={t.coursesEmpty}><Link className="ws-btn" href="/learn/courses">{t.browse}</Link></EmptyState>}
      </section>

      {caps.weakAreas && weak && weak.length > 0 && (
        <section className="lx-section" aria-labelledby="learn-review">
          <header><h2 id="learn-review">{t.review}</h2></header>
          <p className="lx-help">{t.reviewLead}</p>
          <div className="lx-list">
            {weak.slice(0, 5).map((w) => (
              <div key={`${w.lessonId}-${w.concept}`} className="lx-row">
                <span className="lx-row__icon" aria-hidden><Target size={16} /></span>
                <div className="lx-row__main"><span className="lx-row__title">{w.concept}</span></div>
                <Link className="ws-btn ws-btn--sm ws-btn--ghost" href={`/learn/${w.lessonId}${w.blockId ? `#${w.blockId}` : ""}`}>{t.reread}</Link>
                {w.quizFormId && <Link className="ws-btn ws-btn--sm" href={`/learn/${w.lessonId}?tab=practice`}>{t.practice}</Link>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="lx-section" aria-labelledby="learn-saved">
        <header><h2 id="learn-saved">{t.saved}</h2>{saved.length > 0 && <Link className="lx-link" href="/dashboard/learn/saved">{t.all}</Link>}</header>
        {saved.length ? (
          <div className="lx-list">
            {saved.slice(0, 5).map((s) => (
              <Link key={s.id} className="lx-row" href={`/learn/${s.lessonId}${s.blockId ? `#${s.blockId}` : ""}`}>
                <span className="lx-row__icon" data-kind="lesson" aria-hidden>{s.kind === "block" ? <Bookmark size={16} /> : <BookOpen size={16} />}</span>
                <span className="lx-row__main"><span className="lx-row__title">{s.kind === "block" ? s.excerpt || t.block : s.lessonTitle || t.untitled}</span>{s.kind === "block" && <span className="lx-row__sub">{s.lessonTitle}</span>}</span>
                <ArrowRight size={15} aria-hidden className="lx-flip" />
              </Link>
            ))}
          </div>
        ) : <p className="lx-muted">{t.savedEmpty}</p>}
      </section>

      {recentOther.length > 0 && (
        <section className="lx-section" aria-labelledby="learn-recent">
          <header><h2 id="learn-recent">{t.recent}</h2></header>
          <div className="lx-grid">{recentOther.map(({ lesson }) => <LessonCard key={lesson.id} lesson={lesson} href={hrefFor(lesson.id, lesson.ownerId)} progress={progress[lesson.id]} />)}</div>
        </section>
      )}

      <section className="lx-section" aria-labelledby="learn-mine">
        <header><h2 id="learn-mine">{t.mine}</h2>{mine.length > 0 && <Link className="lx-link" href="/dashboard/learn/library">{t.all}</Link>}</header>
        {mine.length ? (
          <div className="lx-grid">{mine.slice(0, 6).map((l) => <LessonCard key={l.id} lesson={l} href={`/dashboard/learn/lessons/${l.id}`} showStatus />)}</div>
        ) : <EmptyState icon={BookOpen} title={t.mine} body={t.mineEmpty}><button type="button" className="ws-btn ws-btn--primary" onClick={newLesson}><Plus size={16} aria-hidden />{t.newLesson}</button></EmptyState>}
      </section>

      <section className="lx-section" aria-labelledby="learn-discover">
        <header><h2 id="learn-discover">{t.discover}</h2><Link className="lx-link" href="/learn">{t.explore}</Link></header>
        {discover.length ? (
          <div className="lx-grid">{discover.slice(0, 6).map((l) => <LessonCard key={l.id} lesson={l} href={`/learn/${l.id}`} progress={progress[l.id]} />)}</div>
        ) : <EmptyState icon={Layers} title={t.discover} body={t.discoverEmpty} />}
      </section>
    </div>
  );
}
