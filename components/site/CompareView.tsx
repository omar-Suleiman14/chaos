"use client";

import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { PrimaryCta, SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { compareAsOf, compareCopy, compareSources } from "@/components/site/compareData";
import { useCopy } from "@/lib/i18n";
import "@/app/landing.css";

/*
 * "Why" items describe shipped features (see compareData.ts for the code behind each claim).
 * "Gaps" are things Chaos does not do today, checked against the code on the "as of" date:
 * no custom domains (docs links-and-embed), no payment collection, no email sending,
 * no native Sheets/Slack/Zapier connectors, no CAPTCHA (honeypot + timing in convex/respond.ts),
 * no URL prefill, two languages (convex/formLogic.ts `languages`), live games play choice
 * questions with 2–4 options, the integration API cannot publish or read responses,
 * sign-in requires Clerk, and the Docker setup is untested end to end.
 */
const copy = {
  en: {
    title: "Chaos compared.",
    lead: "What Chaos does well, where it falls short, and how it lines up with Google Forms, Microsoft Forms, Typeform and Kahoot!.",
    whyTitle: "What makes Chaos different",
    why: [
      { title: "Agents can run it", body: "Connect the Chaos app in ChatGPT to draft forms and quizzes, publish when you ask, run a live game and read results. Other apps work through a scoped API.", href: "/chatgpt", link: "Chaos in ChatGPT" },
      { title: "Answering that fits the moment", body: "The same form works as one page, sections, one question at a time or swipeable cards, with 18 themes, sounds and English or Arabic.", href: "/docs/answer-modes", link: "Ways to answer" },
      { title: "Live games built in", body: "Turn a quiz into a game: a PIN, questions on the big screen, answers on phones and a leaderboard. Results land with your other responses.", href: "/docs/live-games", link: "Live games" },
      { title: "Open source", body: "The code is public under the AGPL. Read it, report issues or run your own copy.", href: "/docs/self-hosting", link: "Open source and self-hosting" },
      { title: "Learn, in progress", body: "We are building Learn: lessons and courses that use Chaos quizzes and live games for practice. It is not available yet.", href: "", link: "" },
    ],
    tableTitle: "Side by side",
    asOf: `As of ${compareAsOf.en}. Other products change their features and plans often, so check their sites before you decide. Sources:`,
    gapsTitle: "What Chaos doesn’t do yet",
    gaps: [
      "No custom domains. Share the Chaos link or embed the form.",
      "No payments or e-signatures in forms.",
      "Chaos sends no email: no invitations, no email receipts. Notifications are in the app.",
      "No ready-made Google Sheets, Slack or Zapier connectors. Use webhooks or the API.",
      "No CAPTCHA. Spam is caught with a hidden field and timing, and kept in a Spam folder.",
      "No pre-filling answers from the link.",
      "Two languages: English and Arabic.",
      "Live games play choice questions with 2 to 4 options, for up to 100 players on Free and 500 on Pro.",
      "The integration API can’t publish forms or read individual responses, by design.",
      "The ChatGPT app needs Pro and can’t add file upload questions.",
      "Sign-in needs Clerk, also when you host Chaos yourself, and the Docker setup hasn’t been tested end to end yet.",
    ],
    fitTitle: "When another tool may fit better",
    fit: [
      "Your team lives in Google Workspace or Microsoft 365 and wants answers straight in Sheets or Excel.",
      "You need payments, e-signatures or a large catalogue of ready-made integrations.",
      "You want a big library of ready-made public games for a classroom.",
    ],
    ctaTitle: "Try it with your next form.", ctaLead: "Free for personal use within plan limits. Start blank or from a template.",
  },
  ar: {
    title: "Chaos في مقارنة.",
    lead: "ما يُحسنه Chaos، وأين يقصر، وكيف يقارَن بـ Google Forms وMicrosoft Forms وTypeform وKahoot!.",
    whyTitle: "ما يميّز Chaos",
    why: [
      { title: "يمكن للوكلاء تشغيله", body: "اربط تطبيق Chaos في ChatGPT لصياغة المسودات، والنشر حين تطلب، وتشغيل لعبة مباشرة، وقراءة النتائج. وتعمل التطبيقات الأخرى عبر API بصلاحيات محددة.", href: "/chatgpt", link: "Chaos في ChatGPT" },
      { title: "إجابة تناسب الموقف", body: "النموذج نفسه يعمل صفحةً واحدة أو أقسامًا أو سؤالًا في كل مرة أو بطاقات تسحبها، مع 18 مظهرًا وأصوات وبالعربية أو الإنجليزية.", href: "/docs/answer-modes", link: "طرق الإجابة" },
      { title: "ألعاب مباشرة مدمجة", body: "حوّل الاختبار إلى لعبة: رمز دخول، والأسئلة على الشاشة الكبيرة، والإجابات من الهواتف، ولوحة صدارة. وتُحفظ النتائج مع بقية ردودك.", href: "/docs/live-games", link: "الألعاب المباشرة" },
      { title: "مفتوح المصدر", body: "الشيفرة منشورة برخصة AGPL. اقرأها أو أبلغ عن مشكلة أو شغّل نسختك الخاصة.", href: "/docs/self-hosting", link: "المصدر المفتوح والاستضافة الذاتية" },
      { title: "Learn، قيد الإنشاء", body: "نبني Learn: دروسًا ومقررات تستخدم اختبارات Chaos وألعابه المباشرة للتدريب. لم يُتح بعد.", href: "", link: "" },
    ],
    tableTitle: "جنبًا إلى جنب",
    asOf: `حتى ${compareAsOf.ar}. تتغير مزايا المنتجات الأخرى وخططها كثيرًا، فراجع مواقعها قبل أن تقرر. المصادر:`,
    gapsTitle: "ما لا يفعله Chaos بعد",
    gaps: [
      "لا نطاقات مخصصة. شارك رابط Chaos أو ضمّن النموذج.",
      "لا مدفوعات ولا توقيعات إلكترونية في النماذج.",
      "لا يرسل Chaos أي بريد: لا دعوات ولا إيصالات بالبريد. الإشعارات داخل التطبيق.",
      "لا روابط جاهزة مع Google Sheets أو Slack أو Zapier. استخدم الـ webhooks أو الـ API.",
      "لا CAPTCHA. يُكشف المزعج بحقل مخفي وبالتوقيت، ويُحفظ في مجلد المزعج.",
      "لا تعبئة مسبقة للإجابات من الرابط.",
      "لغتان: العربية والإنجليزية.",
      "الألعاب المباشرة تلعب أسئلة الاختيار ذات 2 إلى 4 خيارات، حتى 100 لاعب في المجانية و500 في Pro.",
      "لا يستطيع API التكامل نشر النماذج أو قراءة الردود الفردية، عن قصد.",
      "تطبيق ChatGPT يحتاج إلى Pro ولا يستطيع إضافة أسئلة رفع الملفات.",
      "تسجيل الدخول يحتاج إلى Clerk حتى عند الاستضافة الذاتية، ولم يُختبر إعداد Docker من البداية إلى النهاية بعد.",
    ],
    fitTitle: "متى قد تناسبك أداة أخرى",
    fit: [
      "فريقك يعمل في Google Workspace أو Microsoft 365 ويريد الإجابات مباشرة في Sheets أو Excel.",
      "تحتاج إلى مدفوعات أو توقيعات إلكترونية أو مكتبة كبيرة من التكاملات الجاهزة.",
      "تريد مكتبة كبيرة من الألعاب العامة الجاهزة للصف.",
    ],
    ctaTitle: "جرّبه في نموذجك القادم.", ctaLead: "مجاني حاليًا. ابدأ من الصفر أو من قالب.",
  },
};

export default function CompareView() {
  const t = useCopy(copy);
  const c = useCopy(compareCopy);
  return (
    <div className="site-ui">
      <SiteNav links={false} />
      <main id="main-content" tabIndex={-1}>
        <section className="site-pricing-hero">
          <h1 className="site-title site-title--sm">{t.title}</h1>
          <p className="site-lead">{t.lead}</p>
        </section>

        <section className="site-section" aria-labelledby="why-title">
          <div className="site-section-heading"><h2 id="why-title" className="site-h2">{t.whyTitle}</h2></div>
          <div className="site-features">
            {t.why.map((item) => (
              <article key={item.title} className="site-feature">
                <h3>{item.title}</h3><p>{item.body}</p>
                {item.href && <Link href={item.href} className="site-text-link">{item.link}</Link>}
              </article>
            ))}
          </div>
        </section>

        <section className="site-section" aria-labelledby="table-title">
          <div className="site-section-heading"><h2 id="table-title" className="site-h2">{t.tableTitle}</h2></div>
          <div className="site-compare-wrap">
            <table className="site-compare">
              <thead><tr><th scope="col"><span className="sr-only">{t.tableTitle}</span></th>{c.cols.map((col, i) => <th key={col} scope="col" data-us={i === 0 || undefined}>{col}</th>)}</tr></thead>
              <tbody>{c.rows.map(([row, ...cells]) => <tr key={row}><th scope="row">{row}</th>{cells.map((cell, i) => <td key={i} data-us={i === 0 || undefined}>{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="site-compare-note">{c.notCompared}</p>
          <p className="site-compare-note"><time dateTime={compareAsOf.iso}>{t.asOf}</time></p>
          <div className="site-compare-sources">{compareSources.map((s) => <a key={s.href} href={s.href}>{s.label}</a>)}</div>
        </section>

        <section className="site-section" aria-labelledby="gaps-title">
          <div className="site-section-heading"><h2 id="gaps-title" className="site-h2">{t.gapsTitle}</h2></div>
          <ul className="site-also site-also--wide">{t.gaps.map((item) => <li key={item}><Minus size={15} aria-hidden="true" />{item}</li>)}</ul>
          <h3 className="site-also-title">{t.fitTitle}</h3>
          <ul className="site-also site-also--wide">{t.fit.map((item) => <li key={item}><Check size={15} aria-hidden="true" />{item}</li>)}</ul>
        </section>

        <section className="site-cta"><h2 className="site-h2">{t.ctaTitle}</h2><p className="site-lead">{t.ctaLead}</p><div className="site-hero__actions"><PrimaryCta large /></div></section>
      </main>
      <SiteFooter />
    </div>
  );
}
