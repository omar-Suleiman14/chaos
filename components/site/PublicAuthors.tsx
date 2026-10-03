"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";
import { cardRuqaa } from "@/lib/cardFonts";
import { memberCardSvg } from "@/lib/memberCard";
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
  const index = Math.min(selectedIndex, Math.max(0, results.length - 1));
  const stage = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const wheelAt = useRef(0);
  const pendingNext = useRef(false);
  const previousLength = useRef(0);
  const next = () => {
    if (index < results.length - 1) setIndex(index + 1);
    else if (status === "CanLoadMore") { pendingNext.current = true; loadMore(24); }
    else if (status === "Exhausted") setIndex(0);
  };
  const previous = () => setIndex(index > 0 ? index - 1 : results.length - 1);
  useEffect(() => {
    if (pendingNext.current && results.length > previousLength.current) { setIndex(previousLength.current); pendingNext.current = false; }
    previousLength.current = results.length;
    if (status === "CanLoadMore" && (results.length === 0 || index >= results.length - 5)) loadMore(24);
  }, [index, results.length, status, loadMore]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (event.ctrlKey || Math.abs(delta) < 12 || results.length < 2) return;
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
      <header><p className="authors-eyebrow">{ar ? "مجتمع Chaos" : "The Chaos community"}</p><h1>{ar ? "تعرّف على المؤلفين" : "Discover authors"}</h1><p>{ar ? "أشخاص يشاركون الدروس والدورات والاختبارات. اسحب أو مرّر لتصفّح البطاقات. اضغط على بطاقة لفتحها." : "Meet the people sharing lessons, courses and quizzes. Swipe or scroll to browse. Tap a card to open it."}</p></header>
      {status === "LoadingFirstPage" ? <p className="authors-state" role="status">{ar ? "جارٍ تحميل المؤلفين…" : "Loading authors…"}</p> : !results.length ? <p className="authors-state" role="status">{status === "Exhausted" ? (ar ? "لا يوجد مؤلفون بمحتوى عام بعد." : "No authors with public content yet.") : (ar ? "جارٍ البحث عن المؤلفين…" : "Finding authors…")}</p> : <>
        <div ref={stage} className="author-stack" role="region" aria-roledescription="carousel" aria-label={ar ? "بطاقات المؤلفين" : "Author cards"} tabIndex={0}
          onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); next(); } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); previous(); } else if (event.key === "Home") { event.preventDefault(); setIndex(0); } }}
          onPointerMove={event => { if (event.pointerType === "touch") return; const bounds = event.currentTarget.getBoundingClientRect(); const x = Math.max(-.5, Math.min(.5, (event.clientX - bounds.left) / bounds.width - .5)); const y = Math.max(-.5, Math.min(.5, (event.clientY - bounds.top) / bounds.height - .5)); event.currentTarget.style.setProperty("--hover-x", `${-y * 10}deg`); event.currentTarget.style.setProperty("--hover-y", `${x * 14}deg`); }}
          onPointerLeave={event => { event.currentTarget.style.setProperty("--hover-x", "0deg"); event.currentTarget.style.setProperty("--hover-y", "0deg"); }}
          onPointerDown={event => { suppressClick.current = false; gesture.current = { x: event.clientX, y: event.clientY }; }}
          onPointerUp={event => { if (!gesture.current) return; const delta = event.clientX - gesture.current.x; const vertical = event.clientY - gesture.current.y; gesture.current = null; suppressClick.current = Math.abs(delta) > 12 || Math.abs(vertical) > 12; if (Math.abs(delta) > 45 && Math.abs(delta) > Math.abs(vertical)) { if (delta < 0) next(); else previous(); } }}
          onPointerCancel={() => { gesture.current = null; suppressClick.current = true; }}
          onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
          onDragStart={event => event.preventDefault()}>
          {cards.map(({author, position}) => { const depth = Math.abs(position); return <Link key={author.username} href={`/card/${encodeURIComponent(author.username)}`} aria-label={`${ar ? "??? ?????" : "View card of"} ${author.name}`} tabIndex={position === 0 ? 0 : -1} draggable={false} className="author-stack-card" aria-hidden={position !== 0} style={{ "--depth": depth, "--position": position, "--lean": `${position * 3}deg`, "--turn": `${position * -12}deg`, zIndex: 5 - depth } as CSSProperties} data-active={position === 0}><AuthorArt author={author} locale={locale} /></Link>; })}
          <div className="author-navigation" aria-label={ar ? "تصفح المؤلفين" : "Browse authors"}>
            <button type="button" className="author-arrow author-arrow--previous" aria-label={ar ? "المؤلف السابق" : "Previous author"} onPointerDown={event => event.stopPropagation()} onClick={previous} disabled={results.length < 2}><ChevronLeft size={20} /></button>
            <button type="button" className="author-arrow author-arrow--next" aria-label={ar ? "المؤلف التالي" : "Next author"} onPointerDown={event => event.stopPropagation()} onClick={next} disabled={results.length < 2 && status === "Exhausted"}><ChevronRight size={20} /></button>
          </div>
        </div>
        <p className="sr-only" aria-live="polite" aria-atomic="true">{current?.name} @{current?.username}</p>
        <p className="authors-hint">{ar ? "اسحب يمينًا أو يسارًا، أو مرّر فوق البطاقات." : "Swipe left or right, or scroll over the cards."}</p>
      </>}
    </main>
    <SiteFooter />
  </div>;
}
