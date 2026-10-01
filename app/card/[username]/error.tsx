"use client";
import { useLocale } from "@/lib/i18n";

export default function CardError({ reset }: { reset: () => void }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  return <main className="mc-page mc-page--public">
    <section><h1>{ar ? "البطاقة غير متاحة مؤقتًا" : "Card temporarily unavailable"}</h1>
      <p>{ar ? "تعذر تحميل البطاقة. حاول مرة أخرى." : "We couldn't load this card. Please try again."}</p>
      <button type="button" className="mc-btn" onClick={reset}>{ar ? "حاول مجددًا" : "Try again"}</button>
    </section>
  </main>;
}
