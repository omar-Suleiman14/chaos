"use client";

import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCopy } from "@/lib/i18n";
import QueryErrorBoundary from "@/components/forms/QueryErrorBoundary";
const FlashcardStudy = dynamic(() => import("../study/FlashcardStudy"));

export default function InlineFlashcards({ setId }: { setId: string }) {
  const t = useCopy({ en: { loading: "Loading flashcards…", unavailable: "These flashcards are unavailable.", cards: (n: number) => `${n} cards` }, ar: { loading: "جارٍ تحميل البطاقات…", unavailable: "هذه البطاقات غير متاحة.", cards: (n: number) => `${n} بطاقة` } });
  const deck = useQuery(api.learnFrontend.embeddedFlashcards, { setId });
  if (deck === undefined) return <p role="status">{t.loading}</p>;
  if (!deck) return <p className="lx-muted">{t.unavailable}</p>;
  return <section className="lx-inline-flashcards" aria-label={deck.title}>
    <header className="lx-panel__row"><strong>{deck.title}</strong><span className="lx-muted">{t.cards(deck.cardCount)}</span></header>
    <QueryErrorBoundary key={setId}><FlashcardStudy setId={setId} /></QueryErrorBoundary>
  </section>;
}
