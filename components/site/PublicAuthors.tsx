"use client";

import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { usePaginatedQuery } from "convex/react";
import Link from "@/components/site/SiteLink";
import { ChevronLeft } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";
import { cardRuqaa } from "@/lib/cardFonts";
import { memberCardSvg } from "@/lib/memberCard";
import { useEyesFollowPointer } from "@/components/card/useEyesFollowPointer";
import { useTilt } from "@/components/card/useTilt";
import { SiteNav, SiteFooter } from "./SiteChrome";
import "@/app/landing.css";
import "./authors.css";

type Author = { name: string; username: string; seed: string; memberSince: number; style: number };
/**
 * Card art is built once per author and look: swiping brings the same few cards back into the stack
 * and each live update hands over new objects, so rebuilding the SVG every time was wasted work.
 */
const artCache = new Map<string, string>();
function authorSvg(author: Author, locale: "ar" | "en") {
  const key = `${locale}|${author.username}|${author.name}|${author.seed}|${author.style}|${author.memberSince}`;
  let art = artCache.get(key);
  if (!art) {
    art = memberCardSvg({ ...author, locale, url: `/card/${author.username}` }).replaceAll("mc-front-", `author-${author.username}-mc-front-`).replace(/<rect[^>]*filter="url\([^"\n]*grain\)"[^>]*\/>/g, "");
    if (artCache.size > 300) artCache.clear();
    artCache.set(key, art);
  }
  return art;
}
const AuthorArt = memo(function AuthorArt({ author, locale }: { author: Author; locale: "ar" | "en" }) {
  return <div className="author-art" aria-hidden dangerouslySetInnerHTML={{ __html: authorSvg(author, locale) }} />;
}, (a, b) => a.locale === b.locale && a.author.username === b.author.username && a.author.name === b.author.name && a.author.seed === b.author.seed && a.author.style === b.author.style);

/** `initial` is the server's first page of authors, so the stack is in the first HTML instead of "Loading authors…". */
/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- The labelled carousel supports arrow and Home keys as well as drag gestures; cards remain native links. */
export default function PublicAuthors({ initial = [] }: { initial?: Author[] }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const live = usePaginatedQuery(api.publicAuthors.browse, {}, { initialNumItems: 24 });
  const { loadMore } = live;
  // While the live first page loads, the server's copy stands in (and counts as "more on the way").
  const status = live.status === "LoadingFirstPage" && initial.length ? "LoadingMore" : live.status;
  const results = live.status === "LoadingFirstPage" ? initial : live.results;
  const [selectedIndex, setIndex] = useState(0);
  const [fannedIndex, setFannedIndex] = useState<number | null>(null);
  const index = Math.min(selectedIndex, Math.max(0, results.length - 1));
  const fanned = fannedIndex === index;
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fanned) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".author-stack-card")) setFannedIndex(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFannedIndex(null);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [fanned]);
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
      {status === "LoadingFirstPage" ? <output className="authors-state" >{ar ? "جارٍ تحميل المؤلفين…" : "Loading authors…"}</output> : !results.length ? <output className="authors-state" >{status === "Exhausted" ? (ar ? "لا يوجد مؤلفون بمحتوى عام بعد." : "No authors with public content yet.") : (ar ? "جارٍ البحث عن المؤلفين…" : "Finding authors…")}</output> : <>
        <div className="author-scene" style={{ "--fan-count": cards.length } as CSSProperties}><section ref={stage} className="author-stack" data-fanned={fanned}  aria-roledescription="carousel" aria-label={ar ? "بطاقات المؤلفين" : "Author cards"} tabIndex={0}
          onKeyDown={event => { if (event.key === "ArrowRight") { event.preventDefault(); next(); } else if (event.key === "ArrowLeft") { event.preventDefault(); previous(); } else if (event.key === "Home") { event.preventDefault(); setIndex(0); } }}
          onPointerDown={event => { suppressClick.current = false; gesture.current = { x: event.clientX, y: event.clientY }; }}
          onPointerUp={event => { if (!gesture.current) return; const delta = event.clientX - gesture.current.x; const vertical = event.clientY - gesture.current.y; gesture.current = null; suppressClick.current = Math.abs(delta) > 12 || Math.abs(vertical) > 12; if (Math.abs(delta) > 45 && Math.abs(delta) > Math.abs(vertical)) { if (delta < 0) next(); else previous(); } }}
          onPointerCancel={() => { gesture.current = null; suppressClick.current = true; }}
          onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
          onDragStart={event => event.preventDefault()}>
          {cards.map(({ author, position }) => {
            const depth = Math.abs(position);
            const style = { "--depth": depth, "--position": position, "--lean": `${position * 3}deg`, "--turn": `${position * -12}deg`, zIndex: 5 - depth } as CSSProperties;
            return position === 0 ? <Link key={author.username} href={`/card/${encodeURIComponent(author.username)}`} prefetch aria-label={`${ar ? "عرض بطاقة" : "View card of"} ${author.name}`} draggable={false} className="author-stack-card" style={style} data-active="true"><AuthorArt author={author} locale={locale} /></Link> :
              <button key={author.username} type="button" className="author-stack-card" style={style} data-active="false" aria-expanded={fanned} aria-label={ar ? `${fanned ? "ضم البطاقات" : "افرد البطاقات"}: ${author.name}` : `${fanned ? "Close" : "Fan out"} author cards: ${author.name}`} onClick={() => setFannedIndex(fanned ? null : index)}><AuthorArt author={author} locale={locale} /></button>;
          })}
        </section>
        </div>
        <p className="sr-only" aria-live="polite" aria-atomic="true">{current?.name} @{current?.username}</p>
        <p className="authors-hint">{ar ? "اسحب البطاقة يمينًا أو يسارًا، أو استخدم مفاتيح الأسهم." : "Swipe or drag the card, or use the arrow keys."}</p>
      </>}
    </main>
    <SiteFooter />
  </div>;
}
/* oxlint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
