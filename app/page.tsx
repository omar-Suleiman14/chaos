"use client";


import Link from "next/link";
import { ArrowRight, Braces, Check, ChevronRight, Radio, Server } from "lucide-react";
import { PrimaryCta, SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { ChatGptMark } from "@/components/site/marks";
import { compareCopy, compareSources, landingRows } from "@/components/site/compareData";
import { useThemeName } from "@/components/ThemePicker";
import { themeClass, themeFromPreset, themePresets, themeStyle } from "@/components/forms/formThemes";
import { emptyDefinition } from "@/convex/formLogic";
import ProductDemo from "@/components/site/ProductDemo";
import { useCopy } from "@/lib/i18n";
import { serializeStructuredData, websiteStructuredData } from "@/lib/seo";
import "@/components/forms/formThemes.css";
import "./landing.css";

/*
 * Every claim here maps to shipped code; see components/site/compareData.ts for the
 * sources behind the comparison and the docs (lib/docs) for each linked feature.
 * Responder controls: convex/formModel.ts settings (access, onePerPerson, responseLimit,
 * opensAt/closesAt/timezone, retentionDays, collectPartial, allowEditAfterSubmit) and
 * convex/respond.ts (file uploads: 1–5 files, 10 MB, listed types).
 */
const copy = {
  en: {
    title: ["Forms, surveys", "and live quizzes."],
    lead: "Create forms, run quizzes and live games, and build courses in one workspace. Explore free public lessons and courses. Open source, in English and Arabic.",
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
    featuresTitle: ["Forms, quizzes and live games.", "One open-source app."],
    featuresLead: "Create and edit manually in Chaos. ChatGPT and external tools are optional connections. Free for personal use within plan limits.",
    main: [
      { title: "Forms, surveys and quizzes", body: "16 question types, including file uploads, with sections, branching and endings. Quiz mode marks answers for you." },
      { title: "Live games", body: "Questions on the big screen, answers on phones, a leaderboard after each round." },
      { title: "Results you can use", body: "Charts, every response, and export to CSV, Excel or JSON.", href: "/docs/export-responses", link: "Export responses" },
      { title: "Agents can run it", body: "The Chaos app in ChatGPT drafts forms and quizzes, publishes when you ask, runs games and reads results. Review drafts before publishing.", href: "/chatgpt", link: "Chaos in ChatGPT" },
      { title: "API and webhooks", body: "Give another app a scoped token to create drafts and read count-only summaries. Webhooks tell your server when responses arrive.", href: "/docs/integration-api", link: "Integration API" },
      { title: "A look for every form", body: "18 themes, including Google Forms and Microsoft Forms looks, or your own colours and logo." },
      { title: "Build with your team", body: "Editors, viewers, comments and approval before publishing." },
      { title: "Open source", body: "AGPL licensed. Read the code, report issues, or host your own copy.", href: "/docs/self-hosting", link: "Self-hosting" },
    ],
    alsoTitle: "Also included",
    also: [
      "English and Arabic in one form, right to left", "21 ready-made templates", "Collaborators with roles", "Version history and undo",
      "Branching logic and custom endings", "Import Typeform and Google Forms files", "Receipts for every response", "Links, custom links, QR codes and embedding",
      "Spam folder", "Max integration", "Keyboard shortcuts", "Step-by-step docs",
    ],
    explore: "Explore", learnTitle: "Chaos Learn. Find something to learn.",
    learn: "Browse free public courses and search community lessons without signing in. Follow a course’s ordered lessons, or find a lesson by topic.",
    learnCards: [{ title: "Free public courses", body: "Published lessons brought together in a clear order. Read at your own pace.", href: "/learn#course-directory", link: "Browse courses" }, { title: "Search community lessons", body: "Search by topic and open a published lesson. Check the author and sources for anything you rely on.", href: "/learn#lesson-search", link: "Find a lesson" }],
    controlsTitle: "Decide who answers, and for how long.", controlsLead: "Every control is set per form, and the server enforces it.",
    controls: [
      { title: "Who can respond", body: "Anyone with the link, people signed in to Chaos, or only people with an access code.", href: "/docs/access-and-limits#who" },
      { title: "One per person", body: "On sign-in forms, allow one response per account.", href: "/docs/access-and-limits#who" },
      { title: "Response limits", body: "The form says it’s full after the number you set.", href: "/docs/access-and-limits#limits" },
      { title: "Opening and closing times", body: "Open and close on a schedule, in the time zone you choose.", href: "/docs/access-and-limits#limits" },
      { title: "Automatic deletion", body: "Delete responses and their files after a number of days.", href: "/docs/access-and-limits#privacy" },
      { title: "Unfinished responses", body: "Off by default. When on, people are told you can see answers they haven’t sent.", href: "/docs/partial-responses" },
      { title: "Edit after submitting", body: "Off by default. A private link lets people change their answers, and earlier versions are kept.", href: "/docs/respondent-experience#edit-later" },
      { title: "File uploads", body: "1 to 5 files per question, up to 10 MB each, visible only to you and your collaborators.", href: "/docs/file-uploads" },
      { title: "Embedding", body: "Off until you turn it on, and only on the sites you list.", href: "/docs/links-and-embed#embed" },
    ],
    controlsLink: "How it works",
    compareTitle: "How Chaos compares",
    compareNote: "Other products change their features and plans. Sources:",
    compareMore: "Full comparison, including what Chaos doesn’t do yet",
    worksTitle: "Connect Chaos.",
    max: { name: "Max", title: "Turn Max pages into forms.", body: "Pick a Max page and get a Chaos draft. Only summaries go back to Max.", link: "Get Max" },
    gpt: { name: "ChatGPT", title: "Run Chaos from a chat.", body: "Ask ChatGPT to draft a quiz, publish it when you’re ready, run a game or check results. Free on every plan.", link: "See how it works" },
    api: { name: "API and webhooks", title: "Connect your own tools.", body: "Scoped tokens for drafts and summaries, and signed webhooks for new responses. Answers stay in Chaos unless you choose otherwise.", link: "Read the API guide" },
    host: { name: "Self-hosting", title: "Run your own copy.", body: "Chaos is open source under the AGPL. There is a Docker setup for the app and its backend. It hasn’t been tested end to end yet.", link: "Self-hosting guide" },
    ctaTitle: "Create your first form.", ctaLead: "Start blank or from a template.",
  },
  ar: {
    title: ["نماذج واستطلاعات", "واختبارات مباشرة."],
    lead: "أنشئ نماذج واختبارات وألعابًا مباشرة ودورات في مساحة عمل واحدة. استكشف دروسًا ودورات عامة مجانية. مفتوح المصدر بالعربية والإنجليزية.",
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
    featuresTitle: ["نماذج واختبارات وألعاب مباشرة.", "في تطبيق واحد مفتوح المصدر."],
    featuresLead: "أنشئ وعدّل يدويًا في Chaos. الربط مع ChatGPT والأدوات الخارجية اختياري. مجاني للاستخدام الشخصي ضمن حدود الخطة.",
    main: [
      { title: "نماذج واستطلاعات واختبارات", body: "16 نوعًا من الأسئلة، منها رفع الملفات، مع أقسام وتفرّع وخواتيم. ويصحح وضع الاختبار الإجابات تلقائيًا." },
      { title: "ألعاب مباشرة", body: "الأسئلة على الشاشة الكبيرة، والإجابات من الهواتف، ولوحة صدارة بعد كل جولة." },
      { title: "نتائج تفيدك", body: "رسوم بيانية وكل ردّ وتصدير إلى CSV وExcel وJSON.", href: "/docs/export-responses", link: "تصدير الردود" },
      { title: "يمكن للوكلاء تشغيله", body: "تطبيق Chaos في ChatGPT يصوغ النماذج والاختبارات، وينشر حين تطلب، ويدير الألعاب، ويقرأ النتائج. راجع المسودات قبل النشر.", href: "/chatgpt", link: "Chaos في ChatGPT" },
      { title: "API وWebhooks", body: "امنح تطبيقًا آخر رمزًا بصلاحيات محددة لإنشاء المسودات وقراءة ملخصات بالأعداد فقط. وتخبر الـ webhooks خادمك حين تصل الردود.", href: "/docs/integration-api", link: "API التكامل" },
      { title: "مظهر لكل نموذج", body: "18 مظهرًا، منها أسلوبا Google Forms وMicrosoft Forms، أو ألوانك وشعارك." },
      { title: "ابنِ مع فريقك", body: "محررون ومشاهدون وتعليقات وموافقة قبل النشر." },
      { title: "مفتوح المصدر", body: "برخصة AGPL. اقرأ الشيفرة، أو أبلغ عن مشكلة، أو استضف نسختك الخاصة.", href: "/docs/self-hosting", link: "الاستضافة الذاتية" },
    ],
    alsoTitle: "وأيضًا",
    also: [
      "العربية والإنجليزية في نموذج واحد، من اليمين إلى اليسار", "21 قالبًا جاهزًا", "متعاونون بأدوار", "سجل الإصدارات والتراجع",
      "منطق التفرّع وخواتيم مخصصة", "استيراد ملفات Typeform وGoogle Forms", "إيصال لكل رد", "روابط وروابط مخصصة ورموز QR وتضمين",
      "مجلد للمزعج", "التكامل مع Max", "اختصارات لوحة المفاتيح", "دليل خطوة بخطوة",
    ],
    explore: "استكشف", learnTitle: "Chaos Learn. اعثر على ما تريد تعلّمه.",
    learn: "تصفّح الدورات العامة المجانية وابحث في دروس المجتمع دون تسجيل الدخول. اتبع دروس الدورة بالترتيب أو ابحث عن درس حسب الموضوع.",
    learnCards: [{ title: "دورات عامة مجانية", body: "دروس منشورة بترتيب واضح. اقرأ بالسرعة المناسبة لك.", href: "/learn#course-directory", link: "تصفّح الدورات" }, { title: "ابحث في دروس المجتمع", body: "ابحث بالموضوع وافتح درسًا منشورًا. تحقّق من الكاتب والمصادر فيما تعتمد عليه.", href: "/learn#lesson-search", link: "اعثر على درس" }],
    controlsTitle: "حدّد من يجيب، وإلى متى.", controlsLead: "كل إعداد خاص بالنموذج، والخادم هو من يطبّقه.",
    controls: [
      { title: "من يستطيع الإجابة", body: "كل من لديه الرابط، أو المسجلون في Chaos، أو من لديهم رمز دخول فقط.", href: "/docs/access-and-limits#who" },
      { title: "رد واحد لكل شخص", body: "في النماذج التي تتطلب تسجيل الدخول، اسمح برد واحد لكل حساب.", href: "/docs/access-and-limits#who" },
      { title: "حدود الردود", body: "يعلن النموذج امتلاءه بعد العدد الذي تحدده.", href: "/docs/access-and-limits#limits" },
      { title: "مواعيد الفتح والإغلاق", body: "افتح وأغلق وفق جدول، بالمنطقة الزمنية التي تختارها.", href: "/docs/access-and-limits#limits" },
      { title: "الحذف التلقائي", body: "احذف الردود وملفاتها بعد عدد من الأيام.", href: "/docs/access-and-limits#privacy" },
      { title: "الردود غير المكتملة", body: "متوقفة افتراضيًا. وعند تفعيلها يُبلَّغ الناس بأنك ترى إجابات لم يرسلوها.", href: "/docs/partial-responses" },
      { title: "التعديل بعد الإرسال", body: "متوقف افتراضيًا. رابط خاص يتيح تعديل الإجابات، وتُحفظ النسخ السابقة.", href: "/docs/respondent-experience#edit-later" },
      { title: "رفع الملفات", body: "من 1 إلى 5 ملفات لكل سؤال، حتى 10 ميغابايت للملف، لا يراها إلا أنت والمتعاونون معك.", href: "/docs/file-uploads" },
      { title: "التضمين", body: "متوقف حتى تفعّله، وعلى المواقع التي تحددها فقط.", href: "/docs/links-and-embed#embed" },
    ],
    controlsLink: "كيف يعمل",
    compareTitle: "مقارنة Chaos بغيره",
    compareNote: "قد تتغير مزايا المنتجات الأخرى وخططها. المصادر:",
    compareMore: "المقارنة الكاملة، ومنها ما لا يفعله Chaos بعد",
    worksTitle: "اربط Chaos بأدواتك.",
    max: { name: "Max", title: "حوّل صفحات Max إلى نماذج.", body: "اختر صفحة من Max واحصل على مسودة في Chaos. لا يعود إلى Max سوى الملخصات.", link: "احصل على Max" },
    gpt: { name: "ChatGPT", title: "أدِر Chaos من محادثة.", body: "اطلب من ChatGPT صياغة اختبار، ونشره حين تكون جاهزًا، أو تشغيل لعبة، أو معرفة النتائج. مجاني في كل الخطط.", link: "اعرف كيف يعمل" },
    api: { name: "API وWebhooks", title: "اربط أدواتك الخاصة.", body: "رموز بصلاحيات محددة للمسودات والملخصات، وwebhooks موقّعة للردود الجديدة. تبقى الإجابات في Chaos ما لم تختر غير ذلك.", link: "اقرأ دليل الـ API" },
    host: { name: "الاستضافة الذاتية", title: "شغّل نسختك الخاصة.", body: "Chaos مفتوح المصدر برخصة AGPL. يتوفر إعداد Docker للتطبيق وخادمه، ولم يُختبر من البداية إلى النهاية بعد.", link: "دليل الاستضافة الذاتية" },
    ctaTitle: "أنشئ نموذجك الأول.", ctaLead: "ابدأ من الصفر أو من قالب.",
  },
};

export default function LandingPage() {
  const t = useCopy(copy);
  const compare = useCopy(compareCopy);
  const themeName = useThemeName();
  return (
    <div className="site-ui">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(websiteStructuredData) }} />
      <SiteNav />
      <main id="main-content" tabIndex={-1}>
        <section className="site-hero">
          <h1 className="site-title">{t.title[0]}<br /><span>{t.title[1]}</span></h1>
          <p className="site-lead">{t.lead}</p>
          <div className="site-hero__actions"><PrimaryCta large label={t.create} /><Link href="/learn" className="site-btn site-btn--game site-btn--lg">{t.explore}</Link></div>
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
            {t.main.map((item, i) => <article key={item.title} className="site-feature">
              {i === 1 && <Radio size={22} aria-hidden="true" />}<h3>{item.title}</h3><p>{item.body}</p>
              {i === 1 && <PrimaryCta href="/dashboard?tab=games" label={t.createGame} />}
              {item.href && <Link href={item.href} className="site-text-link">{item.link} <ArrowRight size={17} className="site-arrow" aria-hidden="true" /></Link>}
            </article>)}
          </div>
          <h3 className="site-also-title">{t.alsoTitle}</h3>
          <ul className="site-also">{t.also.map((item) => <li key={item}><Check size={15} aria-hidden="true" />{item}</li>)}</ul>

        </section>

        <section id="controls" className="site-section" aria-labelledby="controls-title">
          <div className="site-section-heading"><h2 id="controls-title" className="site-h2">{t.controlsTitle}</h2><p>{t.controlsLead}</p></div>
          <div className="site-controls">
            {t.controls.map((item) => <article key={item.title} className="site-control">
              <h3>{item.title}</h3><p>{item.body}</p>
              <Link href={item.href} className="site-text-link" aria-label={`${t.controlsLink}: ${item.title}`}>{t.controlsLink} <ChevronRight size={15} className="site-arrow" aria-hidden="true" /></Link>
            </article>)}
          </div>
        </section>

        <section id="compare" className="site-section" aria-labelledby="compare-title">
          <div className="site-section-heading"><h2 id="compare-title" className="site-h2">{t.compareTitle}</h2></div>
          <div className="site-compare-wrap">
            <table className="site-compare">
              <thead><tr><th scope="col"><span className="sr-only">{t.compareTitle}</span></th>{compare.cols.map((c, i) => <th key={c} scope="col" data-us={i === 0 || undefined}>{c}</th>)}</tr></thead>
              <tbody>{compare.rows.slice(0, landingRows).map(([row, ...cells]) => <tr key={row}><th scope="row">{row}</th>{cells.map((cell, i) => <td key={i} data-us={i === 0 || undefined}>{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="site-compare-note">{t.compareNote}</p>
          <div className="site-compare-sources">{compareSources.map((s) => <a key={s.href} href={s.href}>{s.label}</a>)}</div>
          <Link href="/compare" className="site-text-link site-compare-more">{t.compareMore} <ArrowRight size={17} className="site-arrow" aria-hidden="true" /></Link>
        </section>

        <section id="explore" className="site-section" aria-labelledby="explore-title">
          <div className="site-section-heading"><h2 id="explore-title" className="site-h2">{t.learnTitle}</h2><p>{t.learn}</p></div>
          <div className="site-features">{t.learnCards.map(item => <article key={item.href} className="site-feature"><h3>{item.title}</h3><p>{item.body}</p><Link href={item.href} className="site-text-link">{item.link} <ArrowRight size={17} aria-hidden="true" /></Link></article>)}</div>
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
            <article className="site-partner">
              <div className="site-partner__head">
                <span className="site-partner__mark"><Braces size={24} aria-hidden="true" /></span>
                <span className="site-partner__name">{t.api.name}</span>
              </div>
              <h3>{t.api.title}</h3>
              <p>{t.api.body}</p>
              <Link href="/docs/integration-api" className="site-text-link">{t.api.link} <ArrowRight size={17} className="site-arrow" aria-hidden="true" /></Link>
            </article>
            <article className="site-partner">
              <div className="site-partner__head">
                <span className="site-partner__mark"><Server size={24} aria-hidden="true" /></span>
                <span className="site-partner__name">{t.host.name}</span>
              </div>
              <h3>{t.host.title}</h3>
              <p>{t.host.body}</p>
              <Link href="/docs/self-hosting" className="site-text-link">{t.host.link} <ArrowRight size={17} className="site-arrow" aria-hidden="true" /></Link>
            </article>
          </div>
        </section>

        <section className="site-cta"><h2 className="site-h2">{t.ctaTitle}</h2><p className="site-lead">{t.ctaLead}</p><div className="site-hero__actions"><PrimaryCta large /></div></section>
      </main>
      <SiteFooter />
    </div>
  );
}
