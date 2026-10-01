"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCopy } from "@/lib/i18n";
import { siteUrl } from "@/lib/site";
import { PageSkeleton } from "@/components/workspace/Skeletons";
import MemberCardView from "@/components/card/MemberCardView";
import "@/components/card/card.css";

const copy = {
  en: {
    loading: "Loading your card…", missing: "Your card appears once your account finishes setting up. Refresh in a moment.",
    welcome: (n: string) => `Welcome to Chaos, ${n}`,
    lead: "Build forms and quizzes, run live games, and study with Learn.",
    card: "Here's your Chaos card. Flip it to find a QR code anyone can scan, or keep it for yourself.",
    go: "Go explore",
  },
  ar: {
    loading: "جارٍ تحميل بطاقتك…", missing: "تظهر بطاقتك بعد إكمال إعداد حسابك. حدّث الصفحة بعد قليل.",
    welcome: (n: string) => `أهلًا بك في Chaos يا ${n}`,
    lead: "أنشئ النماذج والاختبارات، وشغّل الألعاب المباشرة، وذاكر مع Learn.",
    card: "هذه بطاقتك في Chaos. اقلبها لتجد رمز QR يمكن لأي أحد مسحه، أو احتفظ بها لنفسك.",
    go: "ابدأ الاستكشاف",
  },
};

export default function MyCardPage() {
  const t = useCopy(copy);
  const card = useQuery(api.memberCards.mine);
  const setStyle = useMutation(api.memberCards.setStyle).withOptimisticUpdate((store, { style }) => {
    const current = store.getQuery(api.memberCards.mine, {});
    if (current) store.setQuery(api.memberCards.mine, {}, { ...current, style });
  });
  if (card === undefined) return <PageSkeleton label={t.loading} />;
  if (card === null) return <p className="ws-empty p-8">{t.missing}</p>;
  const first = card.name.split(/\s+/)[0] || card.username;
  return (
    <div className="mc-page">
      <section className="mc-panel" aria-labelledby="card-title">
        <MemberCardView data={{ ...card, url: `${siteUrl}/card/${card.username}` }} onStyle={(style) => setStyle({ style })} />
        <div>
          <h1 id="card-title">{t.welcome(first)}</h1>
          <p>{t.lead}</p>
          <p>{t.card}</p>
          <Link className="mc-cta" href="/dashboard">{t.go}<ArrowRight size={20} aria-hidden /></Link>
        </div>
      </section>
    </div>
  );
}
