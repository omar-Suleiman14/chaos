"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCopy, useLocale } from "@/lib/i18n";
import { siteUrl } from "@/lib/site";
import { memberTitle, type MemberCardData } from "@/lib/memberCard";
import MemberCardView from "@/components/card/MemberCardView";
import "@/components/card/card.css";

const copy = {
  en: { loading: "Loading card…", missing: "No Chaos member uses this name.", member: (n: string) => `${n} is on Chaos`, since: (d: string) => `Member since ${d}.`, join: "Get your own card", home: "Go to Chaos" },
  ar: { loading: "جارٍ تحميل البطاقة…", missing: "لا يوجد عضو في Chaos بهذا الاسم.", member: (n: string) => `${n} عضو في Chaos`, since: (d: string) => `عضو منذ ${d}.`, join: "احصل على بطاقتك", home: "اذهب إلى Chaos" },
};

export default function PublicCard({ username, initialCard }: { username: string; initialCard: Omit<MemberCardData, "url"> }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const liveCard = useQuery(api.memberCards.byUsername, { username });
  const card = liveCard === undefined ? initialCard : liveCard;
  return (
    <main className="mc-page mc-page--public">
      {card === undefined ? <p role="status">{t.loading}</p> : card === null ? (
        <section className="mc-panel" style={{ gridTemplateColumns: "1fr" }}><h1>{t.missing}</h1><Link className="mc-cta" href="/">{t.home}<ArrowRight size={20} aria-hidden /></Link></section>
      ) : (
        <section className="mc-panel" aria-labelledby="card-title">
          <MemberCardView data={{ ...card, url: `${siteUrl}/card/${card.username}` }} framed={false} />
          <div>
            <h1 id="card-title">{t.member(card.name || `@${card.username}`)}</h1>
            <p>{memberTitle(card.seed, locale)}. {t.since(new Date(card.memberSince).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }))}</p>
            <Link className="mc-cta" href="/dashboard/card">{t.join}<ArrowRight size={20} aria-hidden /></Link>
          </div>
        </section>
      )}
    </main>
  );
}
