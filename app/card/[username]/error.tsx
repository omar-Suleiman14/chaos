"use client";
import { useLocale } from "@/lib/i18n";
import "@/components/card/card.css";

export default function CardError({ reset }: { reset: () => void }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  return <main className="mc-public">
    <section className="mc-public__inner">
      <div className="mc-public__head"><h1>{ar ? "البطاقة غير متاحة مؤقتًا" : "Card temporarily unavailable"}</h1>
        <p>{ar ? "تعذر تحميل البطاقة. حاول مرة أخرى." : "We couldn't load this card. Please try again."}</p></div>
      <button type="button" className="mc-btn" onClick={reset}>{ar ? "حاول مجددًا" : "Try again"}</button>
    </section>
  </main>;
}
