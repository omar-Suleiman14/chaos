"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { PrimaryCta, SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { useCopy } from "@/lib/i18n";
import { planCatalog } from "@/lib/planCatalog";
import "@/app/landing.css";

/*
 * Mirrors lib/planCatalog.ts: both plans have every feature and no creation or response caps;
 * Live games stop at 500 players (convex/liveLogic.ts). No payment integration yet, so no buy button.
 */
const copy = {
  en: {
    title: "Free for personal use. 20 EGP a seat for business.",
    lead: "Personal use is free, with every feature and no monthly caps. Businesses pay 20 EGP per active creator seat each month for the same product. Billing is not live yet.",
    free: {
      name: "Personal", price: "Free", note: "For study, teaching and your own projects.",
      items: [
        "Unlimited forms, surveys and quizzes",
        "Unlimited responses",
        `Live games with up to ${planCatalog.free.livePlayers} players`,
        "Every question type, theme and language",
        "Results, and CSV, Excel and JSON export",
        "Remove Chaos branding from your forms",
        "10 MiB per form upload; 25 MiB per teaching source file",
      ],
      chatgpt: "Chaos in ChatGPT",
      chatgptTail: ": make and manage forms from a chat",
      cta: "Get started free",
    },
    pro: {
      name: "Business", price: `${planCatalog.pro.proposedPriceEgp} EGP`, per: " / active seat / month", note: "Planned price; no checkout or automatic charges yet.",
      items: [
        "Everything in Personal, licensed for business use",
        "Pay only for people who create or manage content",
        "Respondents, students and Live players are always free",
        "Seats set up through Support",
      ],
      cta: "Get started",
    },
    fine: "Checkout is unavailable; businesses can request seats through Support, and nothing is charged automatically. Rate limits and security checks apply to every account. Hosted-service pricing does not change AGPL self-hosting rights.",
  },
  ar: {
    title: "مجاني للاستخدام الشخصي. 20 جنيهًا للمقعد للأعمال.",
    lead: "الاستخدام الشخصي مجاني بكل الميزات ودون حدود شهرية. تدفع الأعمال 20 جنيهًا مصريًا لكل مقعد إنشاء نشط شهريًا مقابل المنتج نفسه. الدفع غير متاح بعد.",
    free: {
      name: "شخصي", price: "مجاني", note: "للدراسة والتدريس ومشروعاتك الخاصة.",
      items: [
        "نماذج واستبيانات واختبارات بلا حدود",
        "ردود بلا حدود",
        `ألعاب مباشرة حتى ${planCatalog.free.livePlayers} لاعب`,
        "كل أنواع الأسئلة والمظاهر واللغات",
        "النتائج وتصدير CSV وExcel وJSON",
        "إخفاء علامة Chaos من نماذجك",
        "10 MiB لكل ملف رد؛ و25 MiB لكل ملف مصدر تعليمي",
      ],
      chatgpt: "Chaos في ChatGPT",
      chatgptTail: ": أنشئ نماذجك وأدرها من محادثة",
      cta: "ابدأ مجانًا",
    },
    pro: {
      name: "الأعمال", price: `${planCatalog.pro.proposedPriceEgp} جنيهًا`, per: " / مقعد نشط / شهر", note: "سعر مخطط؛ لا دفع ولا رسوم تلقائية بعد.",
      items: [
        "كل ما في الخطة الشخصية، مرخّصًا للاستخدام التجاري",
        "تدفع فقط عن من ينشئ المحتوى أو يديره",
        "المجيبون والطلاب ولاعبو الألعاب المباشرة مجانًا دائمًا",
        "تفعيل المقاعد عن طريق الدعم",
      ],
      cta: "ابدأ الآن",
    },
    fine: "الدفع غير متاح؛ يمكن للأعمال طلب المقاعد من الدعم، ولا تُفرض أي رسوم تلقائيًا. تنطبق حدود المعدل وفحوص الأمان على كل الحسابات. أسعار الخدمة المستضافة لا تغيّر حقوق الاستضافة الذاتية وفق AGPL.",
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
