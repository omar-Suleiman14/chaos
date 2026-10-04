"use client";

import Link from "@/components/site/SiteLink";
import { Check } from "lucide-react";
import { PrimaryCta, SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { useCopy } from "@/lib/i18n";
import { planCatalog } from "@/lib/planCatalog";
import "@/app/landing.css";

/*
 * Mirrors lib/planCatalog.ts: no creation or response caps on either plan. Live rooms are capped at
 * planCatalog.free.livePlayers (convex/liveLogic.ts); that's a limit, not a tested load, so the page
 * doesn't advertise it. Business collaboration is free during the promotion; billing is disabled.
 */
const copy = {
  en: {
    title: "Personal for one. Business for your team. Free for now.",
    lead: "Personal is free for a single user. Business brings shared workspaces and team editing, with a limited-time 100% discount from 50 EGP to 0 per active seat each month.",
    free: {
      name: "Personal", price: "Free", note: "One user. For study, teaching and your own projects.",
      items: [
        "Unlimited forms, quizzes, lessons and courses",
        "Unlimited responses",
        "Live games from any quiz",
        "Every question type, theme and language",
        "Results and exports (CSV, Excel, JSON)",
        "No Chaos branding on your forms",
        "Files up to 10 MiB per answer and 25 MiB per lesson source",
        "A personal workspace for you alone; no team sharing",
      ],
      chatgpt: "Use Chaos from ChatGPT or Claude",
      chatgptTail: "",
      cta: "Get started free",
    },
    pro: {
      name: "Business / Teams", price: `${planCatalog.pro.promotion.priceEgp} EGP`, regularPrice: `${planCatalog.pro.priceEgp} EGP`, per: " / active seat / month", note: "Limited time · 100% off. No checkout or charges.",
      items: [
        "Everything in Personal, plus shared Business workspaces",
        "Create teams and invite members by email or single-use link",
        "Owner, admin and member roles",
        "Edit shared forms, lessons, courses and folders together",
        "Respondents, students and Live players are free",
        "Anyone can create a Business team free during the promotion",
      ],
      cta: "Create a free team",
    },
    fine: "Business is normally 50 EGP per active seat per month, discounted to 0 for a limited time. No checkout, payment details or charges. Respondents, students and Live players are free. Rate limits and security checks apply to every account. Hosted pricing doesn't change your right to self-host under the AGPL.",
  },
  ar: {
    title: "شخصي لك وحدك. أعمال لفريقك. مجانًا الآن.",
    lead: "الخطة الشخصية مجانية لمستخدم واحد. توفر الأعمال مساحات مشتركة وتعديلًا جماعيًا، بخصم ١٠٠٪ لفترة محدودة من 50 جنيهًا إلى 0 لكل مقعد نشط شهريًا.",
    free: {
      name: "شخصي", price: "مجاني", note: "مستخدم واحد. للدراسة والتدريس ومشروعاتك الخاصة.",
      items: [
        "نماذج واختبارات ودروس ودورات بلا حدود",
        "ردود بلا حدود",
        "ألعاب مباشرة من أي اختبار",
        "كل أنواع الأسئلة والمظاهر واللغات",
        "النتائج والتصدير (CSV وExcel وJSON)",
        "بلا علامة Chaos على نماذجك",
        "ملفات حتى 10 MiB لكل إجابة و25 MiB لكل مصدر درس",
        "مساحة شخصية لك وحدك؛ دون مشاركة مع فريق",
      ],
      chatgpt: "استخدم Chaos من ChatGPT أو Claude",
      chatgptTail: "",
      cta: "ابدأ مجانًا",
    },
    pro: {
      name: "الأعمال / الفرق", price: `${planCatalog.pro.promotion.priceEgp} جنيه`, regularPrice: `${planCatalog.pro.priceEgp} جنيهًا`, per: " / مقعد نشط / شهر", note: "لفترة محدودة · خصم ١٠٠٪. لا دفع ولا رسوم.",
      items: [
        "كل ما في الخطة الشخصية، مع مساحات أعمال مشتركة",
        "أنشئ فرقًا وادعُ أعضاء بالبريد أو برابط يُستخدم مرة واحدة",
        "أدوار المالك والمسؤول والعضو",
        "عدّل النماذج والدروس والدورات والمجلدات مع فريقك",
        "المجيبون والطلاب ولاعبو الألعاب المباشرة مجانًا",
        "يمكن لأي شخص إنشاء فريق أعمال مجانًا أثناء العرض",
      ],
      cta: "أنشئ فريقًا مجانًا",
    },
    fine: "سعر الأعمال 50 جنيهًا لكل مقعد نشط شهريًا، مخفّض إلى 0 لفترة محدودة. لا دفع ولا بيانات دفع ولا رسوم. المجيبون والطلاب ولاعبو الألعاب المباشرة مجانًا. تنطبق حدود المعدل وفحوص الأمان على كل الحسابات. أسعار الخدمة المستضافة لا تغيّر حقك في الاستضافة الذاتية وفق AGPL.",
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
            <p className="site-plan__price"><s className="text-muted-foreground text-xl me-3">{t.pro.regularPrice}</s>{t.pro.price}<small>{t.pro.per}</small></p>
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
