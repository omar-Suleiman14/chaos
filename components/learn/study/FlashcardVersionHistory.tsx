"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatNumber, useCopy, useLocale } from "@/lib/i18n";
import VersionBrowser, { compareItems, ItemSheet } from "@/components/versions/VersionBrowser";

const copy = {
  en: {
    title: "Version history", draft: "Your draft", version: (n: string) => `Version ${n}`, cards: (n: string) => `${n} cards`,
    restore: "Restore to draft", restoreWarning: "The set's title and cards will be replaced by this version. Learners keep the published set until you publish again.",
    onlyOne: "Nothing published yet. Each time you publish the set, the version appears here.",
  },
  ar: {
    title: "سجل النسخ", draft: "مسودتك", version: (n: string) => `النسخة ${n}`, cards: (n: string) => `${n} بطاقة`,
    restore: "استعد إلى المسودة", restoreWarning: "سيُستبدل عنوان المجموعة وبطاقاتها بهذه النسخة. يبقى المتعلمون على المجموعة المنشورة حتى تنشر مجددًا.",
    onlyOne: "لم يُنشر شيء بعد. تظهر هنا نسخة كلما نشرت المجموعة.",
  },
};

type Card = { id: string; front: string; back: string };
const diffOf = (a: Card[], b: Card[]) => compareItems(a, b, (c) => c.id, (c) => JSON.stringify([c.front, c.back]));

/** A flashcard set's version history in the shared version browser: the draft beside each published version. */
export default function FlashcardVersionHistory({ setId, title, cards, onRestored, onClose }: { setId: string; title: string; cards: Card[]; onRestored: () => void; onClose: () => void }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(locale, n);
  const id = setId as Id<"flashcardSets">;
  const versions = useQuery(api.flashcards.listVersions, { setId: id });
  const restore = useMutation(api.flashcards.restoreVersion);
  // The draft is "now" for as long as the browser is open.
  const [now] = useState(() => Date.now());
  const current = { key: "draft", number: undefined as number | undefined, name: title || t.draft, at: now, detail: t.cards(fmt(cards.length)), title, cards };
  const past = (versions ?? []).map((v) => ({ key: String(v.number), number: v.number as number | undefined, name: t.version(fmt(v.number)), at: v.publishedAt, detail: t.cards(fmt(v.cards.length)), title: v.title, cards: v.cards }));
  return (
    <VersionBrowser label={t.title} status={versions === undefined ? "loading" : "ready"} current={current} currentLabel={t.draft} past={past} onlyOne={t.onlyOne} onClose={onClose}
      counts={(a, b) => diffOf(a.cards, b.cards).counts}
      sheet={(v, { against, side }) => {
        const diff = against ? (side === "base" ? diffOf(v.cards, against.cards) : diffOf(against.cards, v.cards)) : null;
        return <ItemSheet meta={<strong>{v.title}</strong>} items={v.cards.map((c) => ({ id: c.id, title: c.front, body: c.back, change: diff ? diff.change(c, side) : undefined }))} />;
      }}
      restore={{ label: t.restore, warning: t.restoreWarning, run: async (v) => { if (v.number === undefined) return; await restore({ setId: id, number: v.number }); onRestored(); } }} />
  );
}
