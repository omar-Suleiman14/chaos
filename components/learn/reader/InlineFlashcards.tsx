"use client";

import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { localeDir } from "@/lib/locale";
import { useCopy, useLocale } from "@/lib/i18n";
import QueryErrorBoundary from "@/components/forms/QueryErrorBoundary";
import { BlockPlaceholder, useNearViewport } from "./LazyBlock";
const FlashcardStudy = dynamic(() => import("../study/FlashcardStudy"));

export default function InlineFlashcards({ setId }: { setId: string }) {
  const { locale } = useLocale();
  const t = useCopy({ en: { loading: "Loading flashcards…", unavailable: "These flashcards are unavailable.", cards: (n: number) => `${n} cards` }, ar: { loading: "جارٍ تحميل البطاقات…", unavailable: "هذه البطاقات غير متاحة.", cards: (n: number) => `${n} بطاقة` } });
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const deck = useQuery(api.learnFrontend.embeddedFlashcards, near ? { setId } : "skip");
  if (deck === undefined) return <div ref={ref}><BlockPlaceholder label={t.loading} height={300} /></div>;
  if (!deck) return <p className="lx-muted">{t.unavailable}</p>;
  return <section className="lx-inline-flashcards" aria-label={deck.title} dir={localeDir(locale)}>
    <header className="lx-panel__row"><strong dir="auto">{deck.title}</strong><span className="lx-muted">{t.cards(deck.cardCount)}</span></header>
    <QueryErrorBoundary key={setId}><FlashcardStudy setId={setId} /></QueryErrorBoundary>
  </section>;
}
