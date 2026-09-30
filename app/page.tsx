"use client";


import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Radio } from "lucide-react";
import { PrimaryCta, SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { ChatGptMark } from "@/components/site/marks";
import { useThemeName } from "@/components/ThemePicker";
import { themeClass, themeFromPreset, themePresets, themeStyle } from "@/components/forms/formThemes";
import { emptyDefinition } from "@/convex/formLogic";
import ProductDemo from "@/components/site/ProductDemo";
import { useCopy } from "@/lib/i18n";
import { serializeStructuredData, websiteStructuredData } from "@/lib/seo";
import "@/components/forms/formThemes.css";
import "./landing.css";

const copy = {
  en: {
    title: ["Forms, surveys", "and live quizzes."],
    lead: "Build a form, collect responses or host a quiz with friends.",
    create: "Create a form", createGame: "Create a game",
    modesTitle: "Choose how people answer.", modesLead: "A whole page, or one question at a time.",
    modes: [
      { n: "01", title: "All together", body: "Everything on one page. Good for sign-ups and long surveys.", label: "Classic and sections", style: "page" },
      { n: "02", title: "One at a time", body: "One question on screen, with keyboard shortcuts.", label: "Focused", style: "focus" },
      { n: "03", title: "Made for your thumb", body: "Full-screen cards you swipe through.", label: "Swipe", style: "swipe" },
    ],
    themesTitle: "Choose a theme.",
    themesLead: (n: number) => `${n} themes. Change any colour, font or sound.`,
    themesLink: "Explore themes in the example", sampleTitle: "Hello.", sampleBody: "Make yourself at home.", galleryLabel: "A selection of form themes",
    featuresTitle: ["Forms, quizzes and live games.", "One app."],
    featuresLead: "Google Forms, Typeform and Kahoot in one place. Free for now.",
    main: [
      { title: "Forms, surveys and quizzes", body: "16 question types, sections and branching. Quiz mode marks answers for you." },
      { title: "Live games", body: "Questions on the big screen, answers on phones, a leaderboard after each round." },
      { title: "Results you can use", body: "Charts, every response, and export to CSV, Excel or JSON. API and webhooks too." },
      { title: "A look for every form", body: "18 themes, including Google Forms and Microsoft Forms looks, or your own colours and logo." },
      { title: "Build with your team", body: "Editors, viewers, comments and approval before publishing." },
      { title: "Logic and endings", body: "Skip questions that don't apply and end with a message that fits." },
      { title: "One form, two languages", body: "English and Arabic in the same form, with right-to-left built in." },
      { title: "A history you can return to", body: "Every published version is kept. Restore any of them." },
    ],
    alsoTitle: "Also included",
    also: [
      "English and Arabic, right to left", "21 ready-made templates", "Collaborators with roles", "Version history and undo",
      "Opening and closing times with time zones", "Response limits and access codes", "Respondents can edit their answers", "Links, QR codes and embedding",
      "Chaos in ChatGPT", "Max integration", "Open source, self-hostable", "Step-by-step docs",
    ],
    compareTitle: "How Chaos compares",
    compareNote: "Other products change their features and plans. Sources:",
    compareCols: ["Chaos", "Google Forms", "Microsoft Forms", "Typeform", "Kahoot!"],
    compareRows: [
      ["Main use", "Forms, surveys, quizzes + live games", "Forms + quizzes", "Forms + quizzes", "Conversational forms + quizzes", "Live quizzes + learning games"],
      ["Ways to answer", "Page, sections, focused + swipe", "Page + sections", "Page + sections", "One question at a time", "Hosted rounds + self-paced play"],
      ["Live game with PIN and leaderboard", "Yes", "Not a live-game host", "Presentation mode", "Not a live-game host", "Yes"],
      ["Design controls", "18 presets, colours, type + backdrops", "Colours, fonts + header", "Themes + backgrounds", "Themes, media + question layouts", "Game themes + branding by plan"],
      ["Motion and feedback", "Question transitions, sounds + live reveals", "Page flow", "Page flow", "Conversational question flow", "Timers, reveals + podium"],
      ["Open source and self-hostable", "Yes", "No", "No", "No", "No"],
    ],
    worksTitle: "Connect Chaos.",
    max: { name: "Max", title: "Turn Max pages into forms.", body: "Pick a Max page and get a Chaos draft. Only summaries go back to Max.", link: "Get Max" },
    gpt: { name: "ChatGPT", title: "Make forms from a chat.", body: "Ask ChatGPT to turn a chat into a quiz or a game. Included with Pro.", link: "See how it works" },
    ctaTitle: "Create your first form.", ctaLead: "Start blank or from a template.",
  },
  ar: {
    title: ["نماذج واستطلاعات", "واختبارات مباشرة."],
    lead: "أنشئ نموذجًا أو اجمع الردود أو استضف اختبارًا مع أصدقائك.",
    create: "أنشئ نموذجًا", createGame: "أنشئ لعبة",
    modesTitle: "اختر طريقة الإجابة.", modesLead: "صفحة كاملة، أو سؤال واحد في كل مرة.",
    modes: [
      { n: "01", title: "كل شيء معًا", body: "كل شيء في صفحة واحدة. مناسب للتسجيل والاستطلاعات الطويلة.", label: "كلاسيكي وأقسام", style: "page" },
      { n: "02", title: "سؤال في كل مرة", body: "سؤال واحد على الشاشة، مع اختصارات لوحة المفاتيح.", label: "تركيز", style: "focus" },
      { n: "03", title: "مصمَّم لإبهامك", body: "بطاقات بملء الشاشة تسحبها بإصبعك.", label: "سحب", style: "swipe" },
    ],
    themesTitle: "اختر مظهرًا.",
    themesLead: (n: number) => `${n} مظهرًا. غيّر أي لون أو خط أو صوت.`,
    themesLink: "استكشف المظاهر في المثال", sampleTitle: "مرحبًا.", sampleBody: "تفضّل، البيت بيتك.", galleryLabel: "مجموعة من مظاهر النماذج",
    featuresTitle: ["نماذج واختبارات وألعاب مباشرة.", "في تطبيق واحد."],
    featuresLead: "Google Forms وTypeform وKahoot في مكان واحد. مجانًا حاليًا.",
    main: [
      { title: "نماذج واستطلاعات واختبارات", body: "16 نوعًا من الأسئلة وأقسام وتفرّع. ويصحح وضع الاختبار الإجابات تلقائيًا." },
      { title: "ألعاب مباشرة", body: "الأسئلة على الشاشة الكبيرة، والإجابات من الهواتف، ولوحة صدارة بعد كل جولة." },
      { title: "نتائج تفيدك", body: "رسوم بيانية وكل ردّ وتصدير إلى CSV وExcel وJSON، مع API وWebhooks." },
      { title: "مظهر لكل نموذج", body: "18 مظهرًا، منها أسلوبا Google Forms وMicrosoft Forms، أو ألوانك وشعارك." },
      { title: "ابنِ مع فريقك", body: "محررون ومشاهدون وتعليقات وموافقة قبل النشر." },
      { title: "المنطق والنهايات", body: "تخطَّ الأسئلة غير المناسبة، واختم برسالة تناسب المجيب." },
      { title: "نموذج واحد بلغتين", body: "العربية والإنجليزية في النموذج نفسه، مع دعم الكتابة من اليمين." },
      { title: "سجل يمكنك الرجوع إليه", body: "كل نسخة منشورة محفوظة، ويمكنك استعادة أي منها." },
    ],
    alsoTitle: "وأيضًا",
    also: [
      "العربية والإنجليزية، من اليمين إلى اليسار", "21 قالبًا جاهزًا", "متعاونون بأدوار", "سجل الإصدارات والتراجع",
      "مواعيد فتح وإغلاق بالمنطقة الزمنية", "حدود للردود ورموز دخول", "يستطيع المجيب تعديل إجابته", "روابط ورموز QR وتضمين",
      "Chaos في ChatGPT", "التكامل مع Max", "مفتوح المصدر ويمكن استضافته بنفسك", "دليل خطوة بخطوة",
    ],
    compareTitle: "مقارنة Chaos بغيره",
    compareNote: "قد تتغير مزايا المنتجات الأخرى وخططها. المصادر:",
    compareCols: ["Chaos", "Google Forms", "Microsoft Forms", "Typeform", "Kahoot!"],
    compareRows: [
      ["الاستخدام الأساسي", "نماذج واستطلاعات واختبارات وألعاب", "نماذج واختبارات", "نماذج واختبارات", "نماذج محادثة واختبارات", "اختبارات وألعاب تعليمية مباشرة"],
      ["طرق الإجابة", "صفحة وأقسام وتركيز وسحب", "صفحة وأقسام", "صفحة وأقسام", "سؤال في كل مرة", "جولات مباشرة ولعب فردي"],
      ["لعبة مباشرة برمز ولوحة متصدرين", "نعم", "ليس مضيف ألعاب", "وضع عرض تقديمي", "ليس مضيف ألعاب", "نعم"],
      ["خيارات التصميم", "18 مظهرًا وألوان وخطوط وخلفيات", "ألوان وخطوط وترويسة", "مظاهر وخلفيات", "مظاهر ووسائط وتخطيطات", "مظاهر وهوية حسب الخطة"],
      ["الحركة والتفاعل", "انتقالات وأصوات وكشف الإجابات", "صفحات", "صفحات", "تدفق أسئلة المحادثة", "مؤقت وكشف النتائج ومنصة"],
      ["مفتوح المصدر ويمكن استضافته", "نعم", "لا", "لا", "لا", "لا"],
    ],
    worksTitle: "اربط Chaos بأدواتك.",
    max: { name: "Max", title: "حوّل صفحات Max إلى نماذج.", body: "اختر صفحة من Max واحصل على مسودة في Chaos. لا يعود إلى Max سوى الملخصات.", link: "احصل على Max" },
    gpt: { name: "ChatGPT", title: "اصنع نموذجًا من محادثة.", body: "اطلب من ChatGPT تحويل محادثة إلى اختبار أو لعبة. متاح مع Pro.", link: "اعرف كيف يعمل" },
    ctaTitle: "أنشئ نموذجك الأول.", ctaLead: "ابدأ من الصفر أو من قالب.",
  },
};

export default function LandingPage() {
  const t = useCopy(copy);
  const themeName = useThemeName();
  return (
    <div className="site-ui">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(websiteStructuredData) }} />
      <SiteNav />
      <main id="main-content" tabIndex={-1}>
        <section className="site-hero">
          <h1 className="site-title">{t.title[0]}<br /><span>{t.title[1]}</span></h1>
          <p className="site-lead">{t.lead}</p>
          <div className="site-hero__actions"><PrimaryCta large label={t.create} /><PrimaryCta large href="/dashboard/games" label={t.createGame} className="site-btn--game" /></div>
        </section>
        <div id="demo" className="site-demo-wrap"><ProductDemo /></div>

        <section id="modes" className="site-section">
          <div className="site-section-heading"><h2 className="site-h2">{t.modesTitle}</h2><p>{t.modesLead}</p></div>
          <div className="site-modes-grid">
            {t.modes.map((mode) => <article key={mode.n} className="site-mode-article">
              <div className={`site-mode-art site-mode-art--${mode.style}`} aria-hidden="true"><div><span /><i /><i /><b /></div></div>
              <p className="site-mode-label">{mode.n} / {mode.label}</p><h3>{mode.title}</h3><p>{mode.body}</p>
            </article>)}
          </div>
        </section>

        <section id="themes" className="site-section site-themes-section">
          <div className="site-section-heading"><h2 className="site-h2">{t.themesTitle}</h2><p>{t.themesLead(themePresets.length)}</p><a href="#demo" className="site-text-link">{t.themesLink} <ChevronRight size={17} className="site-arrow" aria-hidden="true" /></a></div>
          <div className="site-theme-gallery" aria-label={t.galleryLabel}>
            {(["google-forms", "microsoft-forms", "midnight", "terracotta", "terminal", "candy"] as const).map((id) => {
              const def = { ...emptyDefinition(""), theme: themeFromPreset(id) };
              return <div key={id} className="site-theme-sample"><div className={themeClass(def)} style={themeStyle(def)}><span className="form-heading">{t.sampleTitle}</span><span className="form-muted">{t.sampleBody}</span></div><p>{themeName(id)}</p></div>;
            })}
          </div>
        </section>

        <section id="features" className="site-section" aria-labelledby="features-title">
          <div className="site-section-heading"><h2 id="features-title" className="site-h2">{t.featuresTitle[0]}<br />{t.featuresTitle[1]}</h2><p>{t.featuresLead}</p></div>
          <div className="site-features">
            {t.main.map((item, i) => <article key={item.title} className="site-feature">{i === 1 && <Radio size={22} aria-hidden="true" />}<h3>{item.title}</h3><p>{item.body}</p>{i === 1 && <PrimaryCta href="/dashboard/games" label={t.createGame} />}</article>)}
          </div>
          <h3 className="site-also-title">{t.alsoTitle}</h3>
          <ul className="site-also">{t.also.map((item) => <li key={item}><Check size={15} aria-hidden="true" />{item}</li>)}</ul>
        </section>

        <section id="compare" className="site-section" aria-labelledby="compare-title">
          <div className="site-section-heading"><h2 id="compare-title" className="site-h2">{t.compareTitle}</h2></div>
          <div className="site-compare-wrap">
            <table className="site-compare">
              <thead><tr><th scope="col"><span className="sr-only">{t.compareTitle}</span></th>{t.compareCols.map((c, i) => <th key={c} scope="col" data-us={i === 0 || undefined}>{c}</th>)}</tr></thead>
              <tbody>{t.compareRows.map(([row, ...cells]) => <tr key={row}><th scope="row">{row}</th>{cells.map((cell, i) => <td key={i} data-us={i === 0 || undefined}>{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="site-compare-note">{t.compareNote}</p>
          <div className="site-compare-sources"><a href="https://support.google.com/docs/answer/145737">Google Forms</a><a href="https://support.microsoft.com/en-us/forms/change-a-form-theme">Microsoft Forms</a><a href="https://help.typeform.com/hc/en-us/articles/41381686182292--Your-complete-guide-to-designing-a-typeform">Typeform</a><a href="https://support.kahoot.com/hc/en-us/articles/4433531677715-How-to-use-themes">Kahoot!</a></div>
        </section>

        <section id="works-with" className="site-section" aria-labelledby="works-with-title">
          <div className="site-section-heading"><h2 id="works-with-title" className="site-h2">{t.worksTitle}</h2></div>
          <div className="site-partners">
            <article className="site-partner">
              <div className="site-partner__head">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <span className="site-partner__mark site-partner__mark--max"><img src="/max-mark.png" alt="" width={30} height={30} /></span>
                <span className="site-partner__name">{t.max.name}</span>
              </div>
              <h3>{t.max.title}</h3>
              <p>{t.max.body}</p>
              <a href="https://trymaxnow.vercel.app" className="site-text-link" target="_blank" rel="noreferrer">{t.max.link} <ArrowRight size={17} className="site-arrow" aria-hidden="true" /></a>
            </article>
            <article className="site-partner">
              <div className="site-partner__head">
                <span className="site-partner__mark"><ChatGptMark size={26} /></span>
                <span className="site-partner__name">{t.gpt.name}</span>
              </div>
              <h3>{t.gpt.title}</h3>
              <p>{t.gpt.body}</p>
              <Link href="/chatgpt" className="site-text-link">{t.gpt.link} <ArrowRight size={17} className="site-arrow" aria-hidden="true" /></Link>
            </article>
          </div>
        </section>

        <section className="site-cta"><h2 className="site-h2">{t.ctaTitle}</h2><p className="site-lead">{t.ctaLead}</p><div className="site-hero__actions"><PrimaryCta large /></div></section>
      </main>
      <SiteFooter />
    </div>
  );
}
