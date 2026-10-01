"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCopy, useLocale } from "@/lib/i18n";
import { siteUrl } from "@/lib/site";
import { CARD_THEMES, memberTitle, type MemberCardData } from "@/lib/memberCard";
import MemberCardView from "@/components/card/MemberCardView";
import "@/components/card/card.css";

const copy = {
  en: { loading: "Loading card…", missing: "No Chaos member uses this name.", since: (d: string) => `Member since ${d}`, join: "Get your own card", home: "Go to Chaos", brand: "Chaos" },
  ar: { loading: "جارٍ تحميل البطاقة…", missing: "لا يوجد عضو في Chaos بهذا الاسم.", since: (d: string) => `عضو منذ ${d}`, join: "احصل على بطاقتك", home: "اذهب إلى Chaos", brand: "Chaos" },
};

/** The backdrop glows in the card's own colours, independent of the app theme. */
function glow(style: number): React.CSSProperties {
  const [a, b, c] = CARD_THEMES[((style % CARD_THEMES.length) + CARD_THEMES.length) % CARD_THEMES.length].art;
  return { ["--a" as string]: a, ["--b" as string]: b, ["--c" as string]: c };
}

export default function PublicCard({ username, initialCard }: { username: string; initialCard: Omit<MemberCardData, "url"> }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const liveCard = useQuery(api.memberCards.byUsername, { username });
  const card = liveCard === undefined ? initialCard : liveCard;
  if (!card) return (
    <main className="mc-public">
      <div className="mc-public__inner">
        <div className="mc-public__head"><h1>{t.missing}</h1></div>
        <Link className="mc-cta" href="/">{t.home}<ArrowRight size={18} aria-hidden className="rtl:rotate-180" /></Link>
      </div>
    </main>
  );
  const since = new Date(card.memberSince).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <main className="mc-public" style={glow(card.style)}>
      <div className="mc-public__inner">
        <header className="mc-public__head">
          <h1 id="card-title">{card.name || `@${card.username}`}</h1>
          <p>{memberTitle(card.seed, locale)} · {t.since(since)}</p>
        </header>
        <MemberCardView data={{ ...card, url: `${siteUrl}/card/${card.username}` }} framed={false} />
        <Link className="mc-cta" href="/dashboard/card">{t.join}<ArrowRight size={18} aria-hidden className="rtl:rotate-180" /></Link>
        <Link className="mc-public__brand" href="/">{t.brand}</Link>
      </div>
    </main>
  );
}
