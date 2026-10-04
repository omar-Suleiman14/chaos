"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePaginatedQuery } from "convex/react";
import Link from "@/components/site/SiteLink";
import { ChevronLeft } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";
import { cardRuqaa } from "@/lib/cardFonts";
import { memberCardSvg } from "@/lib/memberCard";
import { useEyesFollowPointer } from "@/components/card/useEyesFollowPointer";
import { useTilt } from "@/components/card/useTilt";
import StudentOrbit from "@/components/card/StudentOrbit";
import { SiteNav, SiteFooter } from "./SiteChrome";
import "@/app/landing.css";
import "./authors.css";

type Author = { name: string; username: string; seed: string; memberSince: number; style: number };
function AuthorArt({ author, locale }: { author: Author; locale: "ar" | "en" }) {
  const art = useMemo(() => memberCardSvg({ ...author, locale, url: `/card/${author.username}` }).replaceAll("mc-front-", `author-${author.username}-mc-front-`).replace(/<rect[^>]*filter="url\([^"\n]*grain\)"[^>]*\/>/g, ""), [author, locale]);
  return <div className="author-art" aria-hidden dangerouslySetInnerHTML={{ __html: art }} />;
}

export default function PublicAuthors() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { results, status, loadMore } = usePaginatedQuery(api.publicAuthors.browse, {}, { initialNumItems: 24 });
  const [selectedIndex, setIndex] = useState(0);
  const [fannedIndex, setFannedIndex] = useState<number | null>(null);
  const index = Math.min(selectedIndex, Math.max(0, results.length - 1));
  const fanned = fannedIndex === index;
  const stage = useRef<HTMLDivElement>(null);
  // Every avatar in the stack looks toward the mouse (or finger while swiping).
  useEyesFollowPointer(stage);
  // Every card in the stack shies away from the mouse, the nearest most, and follows a phone's tilt
  // (useTilt writes the variables authors.css reads on each card).
  const stackCards = useCallback(() => Array.from(stage.current?.querySelectorAll<HTMLElement>(".author-stack-card") ?? []), []);
  useTilt(stage, stackCards);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const wheelAt = useRef(0);
  const pendingNext = useRef(false);
  const previousLength = useRef(0);
  const next = useCallback(() => {
    if (index < results.length - 1) setIndex(index + 1);
    else if (status === "CanLoadMore") { pendingNext.current = true; loadMore(24); }
    else if (status === "LoadingMore") pendingNext.current = true;
    else if (status === "Exhausted") setIndex(0);
  }, [index, results.length, status, loadMore]);
  const previous = useCallback(() => setIndex(index > 0 ? index - 1 : Math.max(0, results.length - 1)), [index, results.length]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || results.length < 2) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable], [role="menu"], [role="listbox"], [role="dialog"], [role="radiogroup"]')) return;
      if (event.key === "ArrowRight") { event.preventDefault(); next(); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); previous(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [next, previous, results.length]);
  useEffect(() => {
    if (pendingNext.current && results.length > previousLength.current) { setIndex(previousLength.current); pendingNext.current = false; }
    previousLength.current = results.length;
    if (status === "CanLoadMore" && (results.length === 0 || index >= results.length - 5)) loadMore(24);
  }, [index, results.length, status, loadMore]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      // Only a sideways trackpad swipe browses; scrolling up and down always scrolls the page.
      const delta = event.deltaX;
      if (event.ctrlKey || Math.abs(delta) <= Math.abs(event.deltaY) || Math.abs(delta) < 12 || results.length < 2) return;
      const direction = delta > 0 ? 1 : -1;
      event.preventDefault();
      if (performance.now() - wheelAt.current < 420) return;
      wheelAt.current = performance.now();
      if (direction < 0) setIndex(index > 0 ? index - 1 : results.length - 1);
      else if (index < results.length - 1) setIndex(index + 1);
      else if (status === "CanLoadMore") { pendingNext.current = true; loadMore(24); }
      else if (status === "Exhausted") setIndex(0);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [index, results.length, status, loadMore]);
  const current = results[index];
  const offsets = results.length >= 5 ? [-2, -1, 0, 1, 2] : results.length >= 3 ? [-1, 0, 1, ...(results.length === 4 ? [2] : [])] : results.length === 2 ? [0, 1] : [0];
  const cards = offsets.map(position => ({ position, author: results[(index + position + results.length) % results.length] }));
  return <div className={`site-ui ${cardRuqaa.variable}`}>
    <SiteNav />
    <main id="main-content" tabIndex={-1} className="authors-page">
      <Link href="/learn" className="authors-back"><ChevronLeft size={18} />{ar ? "الدورات" : "Courses"}</Link>
      <header><p className="authors-eyebrow">{ar ? "مجتمع Chaos" : "The Chaos community"}</p><h1>{ar ? "تعرّف على المؤلفين" : "Discover authors"}</h1><p>{ar ? "أشخاص يشاركون الدروس والدورات والاختبارات. اسحب لتصفّح البطاقات. اضغط على بطاقة لفتحها." : "Meet the people sharing lessons, courses and quizzes. Swipe or drag to browse. Tap a card to open it."}</p></header>
      {status === "LoadingFirstPage" ? <p className="authors-state" role="status">{ar ? "جارٍ تحميل المؤلفين…" : "Loading authors…"}</p> : !results.length ? <p className="authors-state" role="status">{status === "Exhausted" ? (ar ? "لا يوجد مؤلفون بمحتوى عام بعد." : "No authors with public content yet.") : (ar ? "جارٍ البحث عن المؤلفين…" : "Finding authors…")}</p> : <>
        <div className="author-scene"><div ref={stage} className="author-stack" data-fanned={fanned} role="region" aria-roledescription="carousel" aria-label={ar ? "بطاقات المؤلفين" : "Author cards"} tabIndex={0}
          onKeyDown={event => { if (event.key === "ArrowRight") { event.preventDefault(); next(); } else if (event.key === "ArrowLeft") { event.preventDefault(); previous(); } else if (event.key === "Home") { event.preventDefault(); setIndex(0); } }}
          onPointerDown={event => { suppressClick.current = false; gesture.current = { x: event.clientX, y: event.clientY }; }}
          onPointerUp={event => { if (!gesture.current) return; const delta = event.clientX - gesture.current.x; const vertical = event.clientY - gesture.current.y; gesture.current = null; suppressClick.current = Math.abs(delta) > 12 || Math.abs(vertical) > 12; if (Math.abs(delta) > 45 && Math.abs(delta) > Math.abs(vertical)) { if (delta < 0) next(); else previous(); } }}
          onPointerCancel={() => { gesture.current = null; suppressClick.current = true; }}
          onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
          onDragStart={event => event.preventDefault()}>
          {cards.map(({ author, position }) => {
            const depth = Math.abs(position);
            const style = { "--depth": depth, "--position": position, "--lean": `${position * 3}deg`, "--turn": `${position * -12}deg`, zIndex: 5 - depth } as CSSProperties;
            return position === 0 ? <Link key={author.username} href={`/card/${encodeURIComponent(author.username)}`} aria-label={`${ar ? "عرض بطاقة" : "View card of"} ${author.name}`} draggable={false} className="author-stack-card" style={style} data-active="true"><AuthorArt author={author} locale={locale} /></Link> :
              <button key={author.username} type="button" className="author-stack-card" style={style} data-active="false" aria-expanded={fanned} aria-label={ar ? `${fanned ? "ضم البطاقات" : "افرد البطاقات"}: ${author.name}` : `${fanned ? "Close" : "Fan out"} author cards: ${author.name}`} onClick={() => setFannedIndex(fanned ? null : index)}><AuthorArt author={author} locale={locale} /></button>;
          })}
        </div>
          {current && <StudentOrbit key={current.username} username={current.username} />}
        </div>
        <p className="sr-only" aria-live="polite" aria-atomic="true">{current?.name} @{current?.username}</p>
        <p className="authors-hint">{ar ? "اسحب البطاقة يمينًا أو يسارًا، أو استخدم مفاتيح الأسهم." : "Swipe or drag the card, or use the arrow keys."}</p>
      </>}
    </main>
    <SiteFooter />
  </div>;
}
