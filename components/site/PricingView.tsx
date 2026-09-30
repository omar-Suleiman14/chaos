"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { PrimaryCta, SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { useCopy } from "@/lib/i18n";
import { planCatalog } from "@/lib/planCatalog";
import "@/app/landing.css";

/*
 * Numbers here mirror convex/plans.ts (5 creations a month on Free), convex/respond.ts
 * (1,000 responses per form on Free), convex/liveLogic.ts (100 players per game on Free, 500 on Pro),
 * convex/quizFunctions.ts (30-day Pro trial for new accounts) and convex/mcp.ts (ChatGPT app needs Pro).
 * There is no payment integration yet, so no buy button.
 */
const copy = {
  en: {
    title: "Free for personal use. Pro for business.",
    lead: "Personal use stays free within the limits below. Business pricing is proposed at 20 EGP per active creator seat each month. Billing is not live yet.",
    free: {
      name: "Free", price: "Free", note: "For personal study and individual projects.",
      items: [
        `${planCatalog.free.creationsPerMonth} new forms or quizzes each month`,
        `Up to ${planCatalog.free.responsesPerForm.toLocaleString("en-US")} responses per form`,
        `Up to ${planCatalog.free.livePlayers} players per quiz`,
        "Every question type, theme and language",
        "Results, and CSV, Excel and JSON export",
        "10 MiB per form upload; 25 MiB per teaching source file",
      ],
      cta: "Get started free",
    },
    pro: {
      name: "Pro / Business", price: `${planCatalog.pro.proposedPriceEgp} EGP`, per: " / active seat / month", note: "Proposed price; no checkout or automatic charges. New accounts get a 30-day Pro trial.",
      itemsIntro: "Everything in Free, and:",
      items: [
        `${planCatalog.pro.creationsPerMonth} new forms or quizzes each month`,
        `${planCatalog.pro.responsesPerForm.toLocaleString("en-US")} responses per form; ${planCatalog.pro.livePlayers} Live players`,
      ],
      chatgpt: "Chaos in ChatGPT",
      chatgptTail: ": make and manage forms from a chat",
      cta: "Start with 30 days of Pro",
    },
    fine: "Checkout is unavailable. Businesses can request seat provisioning through Support; no automatic charges apply. After the trial, accounts return to Free unless Pro is granted. Hosted-service pricing does not change AGPL self-hosting rights.",
  },
  ar: {
    title: "مجاني للاستخدام الشخصي. Pro للأعمال.",
    lead: "الاستخدام الشخصي مجاني ضمن الحدود الموضحة. السعر المقترح للأعمال 20 جنيهًا مصريًا لكل مقعد إنشاء نشط شهريًا. الدفع غير متاح بعد.",
    free: {
      name: "مجانية", price: "مجانية", note: "للدراسة الشخصية والمشروعات الفردية.",
      items: [
        "5 نماذج أو اختبارات جديدة كل شهر",
        "حتى 1,000 إجابة لكل نموذج",
        "حتى 100 لاعب لكل اختبار",
        "كل أنواع الأسئلة والمظاهر واللغات",
        "النتائج وتصدير CSV وExcel وJSON",
        "10 MiB لكل ملف رد؛ و25 MiB لكل ملف مصدر تعليمي",
      ],
      cta: "ابدأ مجانًا",
    },
    pro: {
      name: "Pro / الأعمال", price: `${planCatalog.pro.proposedPriceEgp} جنيهًا`, per: " / مقعد نشط / شهر", note: "سعر مقترح؛ لا دفع ولا رسوم تلقائية. الحسابات الجديدة تحصل على تجربة Pro لمدة 30 يومًا.",
      itemsIntro: "كل ما في المجانية، وأيضًا:",
      items: [
        `${planCatalog.pro.creationsPerMonth} نموذج أو اختبار جديد شهريًا`,
        `${planCatalog.pro.responsesPerForm.toLocaleString("en-US")} رد لكل نموذج؛ و${planCatalog.pro.livePlayers} لاعب مباشر`,
      ],
      chatgpt: "Chaos في ChatGPT",
      chatgptTail: ": أنشئ نماذجك وأدرها من محادثة",
      cta: "ابدأ بـ 30 يومًا من Pro",
    },
    fine: "الدفع غير متاح. يمكن للأعمال طلب تفعيل المقاعد من الدعم؛ لا توجد رسوم تلقائية. بعد التجربة يعود الحساب إلى المجانية ما لم تُمنح له Pro. أسعار الخدمة المستضافة لا تغيّر حقوق الاستضافة الذاتية وفق AGPL.",
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
