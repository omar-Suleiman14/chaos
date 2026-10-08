"use client";

import { useMutation } from "convex/react";
import { toast } from "@/lib/toast";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bookmark, BookOpen, BookOpenText, ChevronDown, Compass, GraduationCap, Layers, Plus, Target } from "lucide-react";
import { EmptyState, LessonCard } from "@/components/learn/ui";
import { WsMenu } from "@/components/workspace/primitives";
import {
  useLearnActions, useLearnCapabilities, useMyLessons, useProgress, usePublicLessons, useRecentLessons, useSaved, useWeakAreas,
} from "@/lib/learn/data";
import { useCopy, useLocale } from "@/lib/i18n";
import { hostHref } from "@/lib/hosts";
import { useConfirmed, useConfirmedQuery } from "@/lib/confirmedQuery";
import { hrefIntentHandlers } from "@/lib/convexCache";

const copy = {
  en: {
    title: "Learn", lead: "Your lessons, courses and study material in one place.", newLesson: "New lesson", newLabel: "New", newMenu: "Create something new", lessonItem: "Lesson", lessonHelp: "A page to teach one thing", courseItem: "Course", courseHelp: "Lessons in order, for people to take", setItem: "Flashcard set", setHelp: "Cards to study with spaced review", untitledSet: "Untitled set", explore: "Explore",
    continue: "Continue learning", continueEmpty: "Lessons you start show up here so you can pick up where you left off.",
    courses: "My courses", coursesEmpty: "Courses you start appear here with your next lesson.", browse: "Browse courses", all: "See all",
    saved: "Saved", savedEmpty: "Save lessons or single paragraphs and diagrams while you read.",
    recent: "Recently opened", mine: "Your lessons", mineEmpty: "Write a lesson from scratch: headings, images, videos, equations and sources.",
    discover: "New in Explore", discoverEmpty: "No public lessons yet. Publish one to start the collection.",
    review: "Needs review", reviewLead: "Concepts your recent practice suggests revisiting.", practice: "Practice", reread: "Re-read",
    loading: "Loading Learn…", block: "Saved part", untitled: "Untitled lesson",
  },
  ar: {
    title: "تعلّم", lead: "دروسك ومقرراتك ومواد مذاكرتك في مكان واحد.", newLesson: "درس جديد", newLabel: "جديد", newMenu: "أنشئ شيئًا جديدًا", lessonItem: "درس", lessonHelp: "صفحة تشرح شيئًا واحدًا", courseItem: "دورة", courseHelp: "دروس مرتبة يأخذها الناس", setItem: "مجموعة بطاقات", setHelp: "بطاقات للمذاكرة بالمراجعة المتباعدة", untitledSet: "مجموعة بلا عنوان", explore: "استكشف",
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
  const courses = useConfirmedQuery(api.courses.myLearning, {}).data;
  const createCourse = useMutation(api.courses.create);
  const discover = useConfirmed("learn.discover", usePublicLessons({ sort: "recent" })).data;
  const weak = useWeakAreas();

  // Each section shows as soon as its own data is in (most come from the device cache at once);
  // the page used to wait for the slowest of six before showing anything.
  const wait = <output  aria-busy="true"><span className="sr-only">{t.loading}</span><span className="ws-skeleton" style={{ display: "block", height: 112 }} aria-hidden="true" /></output>;
  const hrefFor = (id: string, ownerId: string) => mine?.some((l) => l.id === id && l.ownerId === ownerId) ? `/dashboard/learn/lessons/${id}` : `/learn/${id}`;
  const studied = recent && progress ? recent : undefined;
  const inProgress = studied ? studied.filter(({ lesson }) => progress![lesson.id]?.state === "in_progress").slice(0, 3) : [];
  const recentOther = studied ? studied.filter(({ lesson }) => !inProgress.some((r) => r.lesson.id === lesson.id)).slice(0, 6) : [];
  const newLesson = async () => { try { const id = await actions.createLesson({ language: locale }); router.push(`/dashboard/learn/lessons/${id}`); } catch (err) { toast.error(err); } };
  const newCourse = async () => { try { const id = await createCourse({ language: locale }); router.push(`/dashboard/courses/${id}`); } catch (err) { toast.error(err); } };
  const newSet = async () => { try { const id = await actions.createFlashcardSet({ title: t.untitledSet }); router.push(`/dashboard/learn/flashcards/${id}?mode=edit`); } catch (err) { toast.error(err); } };

  return (
    <div className="lx-page">
      <header className="lx-hero">
        <div><h1 className="ws-page-title">{t.title}</h1><p className="lx-help">{t.lead}</p></div>
        <div className="lx-actions">
          <Link href={hostHref("/learn")} className="ws-btn"><Compass size={16} aria-hidden />{t.explore}</Link>
          <WsMenu label={t.newMenu} align="end" triggerClassName="ws-btn ws-btn--primary" trigger={<><Plus size={16} aria-hidden />{t.newLabel}<ChevronDown size={15} aria-hidden /></>}>
            {(close) => (
              <div className="ws-new-choices">
                <button type="button" role="menuitem" onClick={() => { close(); void newLesson(); }}><BookOpenText size={16} /><span><strong>{t.lessonItem}</strong><small>{t.lessonHelp}</small></span></button>
                <button type="button" role="menuitem" onClick={() => { close(); void newCourse(); }}><GraduationCap size={16} /><span><strong>{t.courseItem}</strong><small>{t.courseHelp}</small></span></button>
                <button type="button" role="menuitem" onClick={() => { close(); void newSet(); }}><Layers size={16} /><span><strong>{t.setItem}</strong><small>{t.setHelp}</small></span></button>
              </div>
            )}
          </WsMenu>
        </div>
      </header>

      <section className="lx-section" aria-labelledby="learn-continue">
        <header><h2 id="learn-continue">{t.continue}</h2></header>
        {!studied ? wait : inProgress.length ? (
          <div className="lx-grid">{inProgress.map(({ lesson }) => <LessonCard key={lesson.id} lesson={lesson} href={hostHref(`/learn/${lesson.id}`)} progress={progress?.[lesson.id]} />)}</div>
        ) : <p className="lx-muted">{t.continueEmpty}</p>}
      </section>

      <section className="lx-section" aria-labelledby="learn-courses">
        <header><h2 id="learn-courses">{t.courses}</h2><Link className="lx-link" href={hostHref("/learn/courses")}>{courses?.length ? t.all : t.browse}</Link></header>
        {!courses ? wait : courses.length ? (
          <div className="lx-level-grid">
            {courses.slice(0, 6).map(c => <Link key={c.id} className="lx-node" href={c.nextLessonId ? `/learn/${c.nextLessonId}?course=${c.id}` : `/learn/courses/${c.id}`} {...hrefIntentHandlers(c.nextLessonId ? `/learn/${c.nextLessonId}?course=${c.id}` : `/learn/courses/${c.id}`)}><GraduationCap size={18} aria-hidden /><span dir="auto">{c.title}<small>{c.completed} / {c.total} · {t.continue}</small></span></Link>)}
          </div>
        ) : <EmptyState icon={GraduationCap} title={t.courses} body={t.coursesEmpty}><Link className="ws-btn" href={hostHref("/learn/courses")}>{t.browse}</Link></EmptyState>}
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
                {w.flashcardBlockId && <Link className="ws-btn ws-btn--sm" href={hostHref(`/learn/${w.lessonId}#${w.flashcardBlockId}`)}>{locale === "ar" ? "راجع البطاقات" : "Review cards"}</Link>}{w.quizHref && <Link className="ws-btn ws-btn--sm" href={w.quizHref}>{t.practice}</Link>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="lx-section" aria-labelledby="learn-saved">
        <header><h2 id="learn-saved">{t.saved}</h2>{!!saved?.length && <Link className="lx-link" href="/dashboard/learn/saved">{t.all}</Link>}</header>
        {!saved ? wait : saved.length ? (
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
          <div className="lx-grid">{recentOther.map(({ lesson }) => <LessonCard key={lesson.id} lesson={lesson} href={hrefFor(lesson.id, lesson.ownerId)} progress={progress?.[lesson.id]} />)}</div>
        </section>
      )}

      <section className="lx-section" aria-labelledby="learn-mine">
        <header><h2 id="learn-mine">{t.mine}</h2>{!!mine?.length && <Link className="lx-link" href="/dashboard/learn/library">{t.all}</Link>}</header>
        {!mine ? wait : mine.length ? (
          <div className="lx-grid">{mine.slice(0, 6).map((l) => <LessonCard key={l.id} lesson={l} href={`/dashboard/learn/lessons/${l.id}`} showStatus />)}</div>
        ) : <EmptyState icon={BookOpen} title={t.mine} body={t.mineEmpty}><button type="button" className="ws-btn ws-btn--primary" onClick={newLesson}><Plus size={16} aria-hidden />{t.newLesson}</button></EmptyState>}
      </section>

      <section className="lx-section" aria-labelledby="learn-discover">
        <header><h2 id="learn-discover">{t.discover}</h2><Link className="lx-link" href={hostHref("/learn")}>{t.explore}</Link></header>
        {!discover ? wait : discover.length ? (
          <div className="lx-grid">{discover.slice(0, 6).map((l) => <LessonCard key={l.id} lesson={l} href={hostHref(`/learn/${l.id}`)} progress={progress?.[l.id]} />)}</div>
        ) : <EmptyState icon={Layers} title={t.discover} body={t.discoverEmpty} />}
      </section>
    </div>
  );
}
