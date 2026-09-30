"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { PrimaryCta, SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { useCopy } from "@/lib/i18n";
import "@/app/landing.css";

/*
 * Numbers here mirror convex/plans.ts (5 creations a month on Free), convex/respond.ts
 * (1,000 responses per form on Free), convex/quizFunctions.ts (100 players per quiz on Free,
 * 30-day Pro trial for new accounts) and convex/mcp.ts (ChatGPT app needs Pro).
 * There is no payment integration yet, so no buy button.
 */
const copy = {
  en: {
    title: "Free while we work out pricing.",
    lead: "Chaos costs nothing right now, and nobody is charged. When Pro is ready to buy it will be 20 EGP a month, about the price of a bag of chips.",
    free: {
      name: "Free", price: "Free for now", note: "Everything you need to make forms and quizzes.",
      items: [
        "5 new forms or quizzes each month",
        "Up to 1,000 responses per form",
        "Up to 100 players per quiz",
        "Every question type, theme and language",
        "Results, CSV and Excel export",
      ],
      cta: "Get started free",
    },
    pro: {
      name: "Pro", price: "20 EGP", per: " a month", note: "Not charged yet. Every new account starts with 30 days of Pro.",
      itemsIntro: "Everything in Free, and:",
      items: [
        "No monthly limit on new forms and quizzes",
        "No cap on responses per form or players per quiz",
      ],
      chatgpt: "Chaos in ChatGPT",
      chatgptTail: ": make and manage forms from a chat",
      cta: "Start with 30 days of Pro",
    },
    fine: "Pro isn’t for sale yet, so there is nothing to buy. After your 30 days you stay on Free.",
  },
  ar: {
    title: "مجاني ريثما نضبط الأسعار.",
    lead: "Chaos لا يكلّفك شيئًا الآن، ولا أحد يُحاسَب. وحين تصبح باقة Pro متاحة للشراء ستكون 20 جنيهًا مصريًا في الشهر، أي ما يقارب ثمن كيس شيبس.",
    free: {
      name: "مجانية", price: "مجانًا حاليًا", note: "كل ما تحتاجه لتصنع نماذج واختبارات.",
      items: [
        "5 نماذج أو اختبارات جديدة كل شهر",
        "حتى 1,000 إجابة لكل نموذج",
        "حتى 100 لاعب لكل اختبار",
        "كل أنواع الأسئلة والمظاهر واللغات",
        "النتائج وتصدير CSV وExcel",
      ],
      cta: "ابدأ مجانًا",
    },
    pro: {
      name: "Pro", price: "20 جنيهًا", per: " في الشهر", note: "لا نحاسب أحدًا بعد. كل حساب جديد يبدأ بـ 30 يومًا من Pro.",
      itemsIntro: "كل ما في المجانية، وأيضًا:",
      items: [
        "بلا حد شهري للنماذج والاختبارات الجديدة",
        "بلا حد لعدد الإجابات في النموذج أو اللاعبين في الاختبار",
      ],
      chatgpt: "Chaos في ChatGPT",
      chatgptTail: ": أنشئ نماذجك وأدرها من محادثة",
      cta: "ابدأ بـ 30 يومًا من Pro",
    },
    fine: "باقة Pro غير معروضة للشراء بعد، فلا شيء تشتريه الآن. بعد الأيام الثلاثين تبقى على الباقة المجانية.",
  },
};

export default function PricingView() {
  const t = useCopy(copy);
  return (
    <div className="site-ui">
      <SiteNav links={false} />
      <main id="main-content" tabIndex={-1}>
        <section className="site-pricing-hero">
          <h1 className="site-title site-title--sm">{t.title}</h1>
          <p className="site-lead">{t.lead}</p>
        </section>

        <div className="site-plans">
          <section className="site-plan" aria-labelledby="plan-free">
            <h2 id="plan-free">{t.free.name}</h2>
            <p className="site-plan__price">{t.free.price}</p>
            <p className="site-plan__note">{t.free.note}</p>
            <ul>{t.free.items.map((item) => <li key={item}><Check size={16} aria-hidden="true" /><span>{item}</span></li>)}</ul>
            <PrimaryCta large label={t.free.cta} />
          </section>

          <section className="site-plan" aria-labelledby="plan-pro">
            <h2 id="plan-pro">{t.pro.name}</h2>
            <p className="site-plan__price">{t.pro.price}<small>{t.pro.per}</small></p>
            <p className="site-plan__note">{t.pro.note}</p>
            <ul>
              <li><Check size={16} aria-hidden="true" /><span>{t.pro.itemsIntro}</span></li>
              {t.pro.items.map((item) => <li key={item}><Check size={16} aria-hidden="true" /><span>{item}</span></li>)}
              <li><Check size={16} aria-hidden="true" /><span><Link href="/chatgpt">{t.pro.chatgpt}</Link>{t.pro.chatgptTail}</span></li>
            </ul>
            <PrimaryCta large label={t.pro.cta} />
          </section>
        </div>
        <p className="site-pricing-fine site-pricing-end">{t.fine}</p>
      </main>
      <SiteFooter />
    </div>
  );
}
