"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { PrimaryCta, SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { useCopy } from "@/lib/i18n";
import { planCatalog } from "@/lib/planCatalog";
import "@/app/landing.css";

/*
 * Mirrors lib/planCatalog.ts: no creation or response caps on either plan. Live rooms are capped at
 * planCatalog.free.livePlayers (convex/liveLogic.ts); that's a limit, not a tested load, so the page
 * doesn't advertise it. There's no payment integration, so there's no buy button.
 */
const copy = {
  en: {
    title: "Free for personal use. 50 EGP per person for business.",
    lead: "Personal use is free, with no monthly caps. Business use is planned at 50 EGP per person each month, for the same product. Checkout isn't live yet.",
    free: {
      name: "Personal", price: "Free", note: "For study, teaching and your own projects.",
      items: [
        "Unlimited forms, quizzes, lessons and courses",
        "Unlimited responses",
        "Live games from any quiz",
        "Every question type, theme and language",
        "Results and exports (CSV, Excel, JSON)",
        "No Chaos branding on your forms",
        "Files up to 10 MiB per answer and 25 MiB per lesson source",
      ],
      chatgpt: "Use Chaos from ChatGPT or Claude",
      chatgptTail: "",
      cta: "Get started free",
    },
    pro: {
      name: "Business", price: `${planCatalog.pro.proposedPriceEgp} EGP`, per: " / person / month", note: "Planned price. Checkout isn't live and nothing is charged.",
      items: [
        "Everything in Personal, licensed for business use",
        "Only people who create or manage content need a paid account",
        "Respondents, students and Live players are free",
        "Contact Support to set up your team",
      ],
      cta: "Get started",
    },
    fine: "Checkout isn't available yet. Businesses can contact Support to set up their team; nothing is charged automatically. Rate limits and security checks apply to every account. Hosted pricing doesn't change your right to self-host under the AGPL.",
  },
  ar: {
    title: "مجاني للاستخدام الشخصي. 50 جنيهًا لكل مستخدم للأعمال.",
    lead: "الاستخدام الشخصي مجاني ودون حدود شهرية. السعر المخطط لاستخدام الأعمال 50 جنيهًا لكل مستخدم شهريًا، للمنتج نفسه. الدفع غير متاح بعد.",
    free: {
      name: "شخصي", price: "مجاني", note: "للدراسة والتدريس ومشروعاتك الخاصة.",
      items: [
        "نماذج واختبارات ودروس ودورات بلا حدود",
        "ردود بلا حدود",
        "ألعاب مباشرة من أي اختبار",
        "كل أنواع الأسئلة والمظاهر واللغات",
        "النتائج والتصدير (CSV وExcel وJSON)",
        "بلا علامة Chaos على نماذجك",
        "ملفات حتى 10 MiB لكل إجابة و25 MiB لكل مصدر درس",
      ],
      chatgpt: "استخدم Chaos من ChatGPT أو Claude",
      chatgptTail: "",
      cta: "ابدأ مجانًا",
    },
    pro: {
      name: "الأعمال", price: `${planCatalog.pro.proposedPriceEgp} جنيهًا`, per: " / مستخدم / شهر", note: "سعر مخطط. الدفع غير متاح ولا تُفرض أي رسوم.",
      items: [
        "كل ما في الخطة الشخصية، مرخّصًا للاستخدام التجاري",
        "الدفع فقط لمن ينشئ المحتوى أو يديره",
        "المجيبون والطلاب ولاعبو الألعاب المباشرة مجانًا",
        "تواصل مع الدعم لإعداد حسابات فريقك",
      ],
      cta: "ابدأ الآن",
    },
    fine: "الدفع غير متاح بعد. يمكن للأعمال التواصل مع الدعم لإعداد حسابات فريقها، ولا تُفرض أي رسوم تلقائيًا. تنطبق حدود المعدل وفحوص الأمان على كل الحسابات. أسعار الخدمة المستضافة لا تغيّر حقك في الاستضافة الذاتية وفق AGPL.",
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
            <ul>
              {t.free.items.map((item) => <li key={item}><Check size={16} aria-hidden="true" /><span>{item}</span></li>)}
              <li><Check size={16} aria-hidden="true" /><span><Link href="/chatgpt">{t.free.chatgpt}</Link>{t.free.chatgptTail}</span></li>
            </ul>
            <PrimaryCta large label={t.free.cta} />
          </section>

          <section className="site-plan" aria-labelledby="plan-pro">
            <h2 id="plan-pro">{t.pro.name}</h2>
            <p className="site-plan__price">{t.pro.price}<small>{t.pro.per}</small></p>
            <p className="site-plan__note">{t.pro.note}</p>
            <ul>
              {t.pro.items.map((item) => <li key={item}><Check size={16} aria-hidden="true" /><span>{item}</span></li>)}
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
