"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { useLearnViewer } from "@/lib/learn/data";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "@/components/site/SiteLink";
import { useCourseProgress } from "@/lib/learn/courseProgress";
import { useLocale } from "@/lib/i18n";

/** Raw scroll past the end of the lesson that opens the next one. */
const PULL = 420;
/** The content moves at most this far, with growing resistance, like a rubber band. */
const STRETCH = 90;

function scrollParent(el: HTMLElement | null): HTMLElement {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

/**
 * Scrolling on past the end of a lesson pulls against resistance while a ring fills; once full it opens the
 * next lesson, like starting a new chat by pulling in the ChatGPT app. Letting go early springs back.
 */
function usePullToNext(root: React.RefObject<HTMLElement | null>, go: (() => void) | null) {
  const [pull, setPull] = useState(0);
  const [going, setGoing] = useState(false);
  useEffect(() => {
    if (!go || !root.current) return;
    const scroller = scrollParent(root.current);
    const atBottom = () => scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    let raw = 0, bottomSince = atBottom() ? 0 : Infinity, idle = 0, touchY: number | null = null, done = false;
    const set = (value: number) => {
      raw = Math.max(0, value);
      setPull(Math.min(1, raw / PULL));
      if (raw >= PULL && !done) {
        done = true;
        navigator.vibrate?.(12);
        setGoing(true);
        // Let the ring finish before the page changes.
        window.setTimeout(go, 260);
      }
    };
    const release = () => { if (!done) set(0); };
    const onScroll = () => { if (atBottom()) { if (bottomSince === Infinity) bottomSince = performance.now(); } else { bottomSince = Infinity; release(); } };
    // Momentum from the scroll that reached the end should not count as pulling.
    const settled = () => atBottom() && performance.now() - (bottomSince === Infinity ? (bottomSince = performance.now()) : bottomSince) > 180;
    const onWheel = (e: WheelEvent) => {
      if (done || e.ctrlKey || !settled()) return;
      if (e.deltaY <= 0) { release(); return; }
      set(raw + Math.min(60, e.deltaY * (e.deltaMode === 1 ? 16 : 1)));
      window.clearTimeout(idle);
      idle = window.setTimeout(release, 220);
    };
    const onTouchStart = (e: TouchEvent) => { touchY = settled() ? e.touches[0].clientY : null; };
    const onTouchMove = (e: TouchEvent) => { if (touchY !== null && !done) set((touchY - e.touches[0].clientY) * 1.4); };
    const onTouchEnd = () => { touchY = null; release(); };
    const target = scroller === (document.scrollingElement ?? document.documentElement) ? window : scroller;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.clearTimeout(idle);
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [root, go]);
  return { pull, going };
}

export default function CourseNavigation({ courseId, lessonId, completed }: { courseId?: string | null; lessonId: string; completed: boolean }) {
  const viewer = useLearnViewer(), remember = useMutation(api.courses.remember);
  useEffect(() => { if (courseId && viewer?.signedIn) void remember({ courseId }).catch(() => {}); }, [courseId, viewer?.signedIn, remember]);
  const course = useQuery(api.courses.getPublic, courseId ? { courseId } : "skip");
  const progress = useCourseProgress(courseId ?? "");
  const { locale } = useLocale(), ar = locale === "ar";
  const root = useRef<HTMLElement>(null), nextLink = useRef<HTMLAnchorElement>(null);
  const index = course ? course.lessons.findIndex(l => l.id === lessonId) : -1;
  const next = course && index >= 0 ? course.lessons[index + 1] : undefined;
  const [go] = useState(() => () => nextLink.current?.click());
  const { pull, going } = usePullToNext(root, next ? go : null);
  if (!course || index < 0) return null;
  const previous = course.lessons[index - 1];
  const nextModule = next && course.modules.find(m => m.lessonIds.includes(next.id as never));
  const count = course.lessons.filter(l => l.id === lessonId ? completed : progress[l.id]?.completed).length;
  const href = (id: string) => `/learn/${id}?course=${encodeURIComponent(course.id)}`;
  // Rubber band: each extra pixel moves the content less.
  const stretch = STRETCH * (1 - Math.exp(-pull * 2.2));
  const circumference = 2 * Math.PI * 15;
  return <nav ref={root} className="lx-course-navigation" aria-label={ar ? "التنقل في الدورة" : "Course navigation"}>
    <Link href={`/learn/courses/${course.id}`} dir="auto">{course.title}</Link>
    <p className="lx-muted" aria-live="polite">{ar ? `${count} / ${course.lessons.length} دروس مكتملة` : `${count} / ${course.lessons.length} lessons completed`}</p>
    <div className="lx-course-meter" role="progressbar" aria-valuenow={count} aria-valuemin={0} aria-valuemax={course.lessons.length} aria-label={ar ? "تقدم الدورة" : "Course progress"}><span style={{ width: `${count / Math.max(1, course.lessons.length) * 100}%` }} /></div>
    <div className="lx-upnext-wrap" style={{ transform: stretch ? `translateY(${-stretch}px)` : undefined }} data-pulling={pull > 0 || undefined}>
      {next && <Link ref={nextLink} className="lx-upnext" href={href(next.id)}>
        <span className="lx-upnext__text">
          <span className="lx-upnext__label">{ar ? "التالي" : "Up next"}{nextModule && <> · <bdi>{nextModule.title}</bdi></>}</span>
          <bdi className="lx-upnext__title">{next.title}</bdi>
        </span>
        <span className="lx-upnext__arrow" aria-hidden><ArrowRight size={18} className="lx-flip" /></span>
      </Link>}
      {previous && <Link className="lx-prevlesson" href={href(previous.id)}><ChevronLeft size={15} className="lx-flip" aria-hidden /><span>{ar ? "السابق: " : "Previous: "}<bdi>{previous.title}</bdi></span></Link>}
    </div>
    {next && <div className="lx-pullnext" aria-hidden style={{ opacity: going ? 1 : Math.min(1, pull * 3), transform: `translateY(${-stretch * 0.6}px)` }}>
      <svg viewBox="0 0 36 36" width="36" height="36" data-going={going || undefined}>
        <circle cx="18" cy="18" r="15" className="lx-pullnext__track" />
        <circle cx="18" cy="18" r="15" className="lx-pullnext__ring" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - (going ? 0.75 : pull))} />
      </svg>
      <span>{going ? (ar ? "جارٍ فتح الدرس التالي" : "Opening next lesson") : pull >= 0.85 ? (ar ? "تابع للدرس التالي" : "Keep going for the next lesson") : (ar ? "اسحب للدرس التالي" : "Pull for the next lesson")}</span>
    </div>}
  </nav>;
}
