"use client";

import { productDefinition } from "@/lib/product";
import Link from "@/components/site/SiteLink";
import { ArrowRight, BookOpen, Braces, Download, FileText, GitFork, GraduationCap, ListChecks, Radio, Server, Webhook } from "lucide-react";
import { PrimaryCta, SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { ChatGptMark, NotionMark } from "@/components/site/marks";
import AudienceJourneys from "@/components/site/AudienceJourneys";
import OpenTrust from "@/components/site/OpenTrust";
import ProductDemo from "@/components/site/ProductDemo";
import { useCopy, useLocale } from "@/lib/i18n";
import { serializeStructuredData, websiteStructuredData } from "@/lib/seo";
import "@/app/landing.css";

/*
 * Every claim maps to shipped code (lib/docs explains each linked feature). Deliberately absent:
 * player counts and scale claims (the Live cap in convex/liveLogic.ts is a limit, not a tested load),
 * and any suggestion that Chaos runs AI. It doesn't; ChatGPT and Claude reach it through MCP.
 */
const copy = {
  en: {
    title: ["Turn what you know", "into something people can use."],
    lead: "Create lessons, courses, quizzes and forms. Teach live, let students study, and connect the AI tools you already use.",
    start: "Start free", explore: "See how it works", trust: ["Open source", "Self-hostable", "English + Arabic", "MCP connected"],
    flow: { label: "How it fits together", source: "Notes, a PDF or an idea", lesson: "Lesson", outputs: ["Quiz", "Flashcards", "Course"], practice: "Practice or a live game" },
    create: {
      title: "Create", lead: "Write, edit and arrange your content in one place.",
      items: [
        { icon: FileText, title: "Forms", body: "Surveys, sign-ups and feedback. Sections, branching, file uploads and custom endings.", href: "/docs/first-form", link: "Build a form" },
        { icon: ListChecks, title: "Quizzes", body: "Marked for you, with explanations, hints and attempt limits. Any quiz can become a live game.", href: "/docs/first-quiz", link: "Make a quiz" },
        { icon: BookOpen, title: "Lessons", body: "A page like a document: headings, images, video, equations, tables, sources and citations.", href: "/docs/lessons", link: "Write a lesson" },
      ],
    },
    learn: {
      title: "Learn", lead: "Put lessons in order, share them, and see what people still find hard.",
      items: [
        { icon: GraduationCap, title: "Courses", body: "Lessons in a clear order, free for anyone to take when public.", href: "/learn", link: "Browse courses" },
        { icon: GitFork, title: "Community courses", body: "Browse public courses, save lessons that help, and keep the original author credited.", href: "/learn", link: "Browse courses" },
        { icon: ListChecks, title: "Practice and progress", body: "Quizzes and flashcards attached to lessons, with progress and weak areas for each learner.", href: "/docs/progress", link: "How progress works" },
      ],
    },
    play: {
      title: "Play", lead: "Put any quiz on the big screen. People join on their phones with a PIN, answer, and see the leaderboard after each round.",
      link: "Host a live game", href: "/docs/live-games",
    },
    connect: {
      title: "Connect", lead: "Chaos works on its own and connects to the tools you already use.",
      max: { name: "Max", title: "Turn Max pages into drafts.", body: "Pick a Max page and get a Chaos draft to review. Only summaries go back to Max.", link: "Get Max" },
      ai: { name: "ChatGPT and Claude", title: "Use Chaos from your assistant.", body: "Ask ChatGPT or Claude to make a quiz, write a lesson, build a course or check results. Chaos itself runs no AI.", link: "See how it works" },
      notion: { name: "Notion", soon: "Coming soon" },
    },
    understand: { title: "Understand", lead: "Use responses and analytics to decide what comes next.", items: [
      { icon: ListChecks, title: "Responses and analytics", body: "Read aggregate summaries or individual responses when you need them. Keep learner answers private.", href: "/docs/responses", link: "Understand results" },
      { icon: Download, title: "Exports", body: "Take response data with you as CSV, Excel or JSON.", href: "/docs/export-responses", link: "Export your data" },
      { icon: Webhook, title: "API and webhooks", body: "Connect results to your own tools through permissioned API access and events.", href: "/docs/integration-api", link: "Connect results" },
    ] },
    secondary: ["Branching", "Access codes", "Scheduling", "QR codes", "Embeds", "Versions", "Collaboration", "Themes", "Sounds", "RTL"],
    open: {
      title: "Open", lead: "Your work isn't locked in.",
      items: [
        { icon: Server, title: "Open source and self-hostable", body: "AGPL licensed. Read the code, or run your own copy with Docker.", href: "/docs/self-hosting", link: "Self-hosting" },
        { icon: Download, title: "Exports", body: "Download responses as CSV, Excel or JSON whenever you like.", href: "/docs/export-responses", link: "Export responses" },
        { icon: Braces, title: "API and MCP", body: "Let your own apps and assistants create drafts and read summaries, with scoped permissions.", href: "/docs/integration-api", link: "Integration API" },
        { icon: Webhook, title: "Webhooks", body: "Chaos tells another app when something happens, like a new response.", href: "/docs/webhooks", link: "Webhooks" },
      ],
    },
    ctaTitle: "Create something to share.", ctaLead: "A form, a quiz, a lesson or a course. Free for personal use.",
  },
  ar: {
    title: ["حوّل ما تعرفه", "إلى شيء يستفيد منه الناس."],
    lead: "أنشئ دروسًا ودورات واختبارات ونماذج. درّس مباشرةً واترك الطلاب يذاكرون واربط أدوات الذكاء الاصطناعي التي تستخدمها.",
    start: "ابدأ مجانًا", explore: "شاهد كيف يعمل", trust: ["مفتوح المصدر", "استضافة ذاتية", "العربية والإنجليزية", "متصل بـ MCP"],
    flow: { label: "كيف يترابط كل شيء", source: "ملاحظات أو ملف PDF أو فكرة", lesson: "درس", outputs: ["اختبار", "بطاقات", "دورة"], practice: "تدريب أو لعبة مباشرة" },
    create: {
      title: "أنشئ", lead: "اكتب محتواك وعدّله ورتّبه في مكان واحد.",
      items: [
        { icon: FileText, title: "النماذج", body: "استطلاعات وتسجيل وآراء. أقسام وتفرّع ورفع ملفات ورسائل ختامية مخصصة.", href: "/docs/first-form", link: "أنشئ نموذجًا" },
        { icon: ListChecks, title: "الاختبارات", body: "تُصحَّح تلقائيًا، مع شروح وتلميحات وحدود للمحاولات. ويمكن أن يصبح أي اختبار لعبة مباشرة.", href: "/docs/first-quiz", link: "أنشئ اختبارًا" },
        { icon: BookOpen, title: "الدروس", body: "صفحة كالمستند: عناوين وصور وفيديو ومعادلات وجداول ومصادر واستشهادات.", href: "/docs/lessons", link: "اكتب درسًا" },
      ],
    },
    learn: {
      title: "تعلّم", lead: "رتّب الدروس وشاركها واعرف ما يصعب على الناس.",
      items: [
        { icon: GraduationCap, title: "الدورات", body: "دروس بترتيب واضح، مجانية لأي أحد حين تكون عامة.", href: "/learn", link: "تصفّح الدورات" },
        { icon: GitFork, title: "دورات المجتمع", body: "تصفّح الدورات العامة واحفظ الدروس التي تفيدك. يبقى اسم المؤلف الأصلي.", href: "/learn", link: "تصفّح الدورات" },
        { icon: ListChecks, title: "التدريب والتقدّم", body: "اختبارات وبطاقات مرتبطة بالدروس، مع التقدّم ونقاط الضعف لكل متعلم.", href: "/docs/progress", link: "كيف يعمل التقدّم" },
      ],
    },
    play: {
      title: "العب", lead: "اعرض أي اختبار على الشاشة الكبيرة. ينضم الناس من هواتفهم برمز، ويجيبون، ويرون لوحة الصدارة بعد كل جولة.",
      link: "استضف لعبة مباشرة", href: "/docs/live-games",
    },
    connect: {
      title: "اربط", lead: "يعمل Chaos وحده، ويتصل بالأدوات التي تستخدمها.",
      max: { name: "Max", title: "حوّل صفحات Max إلى مسودات.", body: "اختر صفحة من Max واحصل على مسودة في Chaos لتراجعها. لا يعود إلى Max سوى الملخصات.", link: "احصل على Max" },
      ai: { name: "ChatGPT وClaude", title: "استخدم Chaos من مساعدك.", body: "اطلب من ChatGPT أو Claude إنشاء اختبار أو كتابة درس أو بناء دورة أو معرفة النتائج. Chaos نفسه لا يشغّل أي ذكاء اصطناعي.", link: "اعرف كيف يعمل" },
      notion: { name: "Notion", soon: "قريبًا" },
    },
    understand: { title: "افهم", lead: "استخدم الإجابات والتحليلات لتختار الخطوة التالية.", items: [
      { icon: ListChecks, title: "الإجابات والتحليلات", body: "اقرأ الملخصات أو الإجابات الفردية عند الحاجة مع الحفاظ على خصوصية المتعلّمين.", href: "/docs/responses", link: "افهم النتائج" },
      { icon: Download, title: "التصدير", body: "خذ بيانات الإجابات معك بصيغة CSV أو Excel أو JSON.", href: "/docs/export-responses", link: "صدّر بياناتك" },
      { icon: Webhook, title: "API وWebhooks", body: "اربط النتائج بأدواتك عبر صلاحيات API والأحداث.", href: "/docs/integration-api", link: "اربط النتائج" },
    ] },
    secondary: ["التفرّع", "رموز الوصول", "الجدولة", "رموز QR", "التضمين", "الإصدارات", "التعاون", "المظاهر", "الأصوات", "RTL"],
    open: {
      title: "مفتوح", lead: "عملك ليس محبوسًا.",
      items: [
        { icon: Server, title: "مفتوح المصدر وقابل للاستضافة الذاتية", body: "برخصة AGPL. اقرأ الشيفرة أو شغّل نسختك بـ Docker.", href: "/docs/self-hosting", link: "الاستضافة الذاتية" },
        { icon: Download, title: "التصدير", body: "نزّل الردود بصيغة CSV أو Excel أو JSON متى شئت.", href: "/docs/export-responses", link: "تصدير الردود" },
        { icon: Braces, title: "API وMCP", body: "دع تطبيقاتك ومساعديك ينشئون المسودات ويقرؤون الملخصات بصلاحيات محددة.", href: "/docs/integration-api", link: "API التكامل" },
        { icon: Webhook, title: "Webhooks", body: "يخبر Chaos تطبيقًا آخر حين يحدث شيء، مثل وصول رد جديد.", href: "/docs/webhooks", link: "Webhooks" },
      ],
    },
    ctaTitle: "أنشئ محتوى وشاركه.", ctaLead: "نموذج أو اختبار أو درس أو دورة. مجاني للاستخدام الشخصي.",
  },
};

type Card = { icon: typeof FileText; title: string; body: string; href: string; link: string };
function Cards({ items }: { items: Card[] }) {
  return (
    <div className="site-features">
      {items.map(({ icon: Icon, ...item }) => (
        <article key={item.title} className="site-feature">
          <Icon size={22} aria-hidden="true" />
          <h3>{item.title}</h3>
          <p>{item.body}</p>
          <Link href={item.href} className="site-text-link">{item.link} <ArrowRight size={17} className="site-arrow" aria-hidden="true" /></Link>
        </article>
      ))}
    </div>
  );
}

export default function HomeView() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  return (
    <div className="site-ui">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(websiteStructuredData) }} />
      <SiteNav />
      <main id="main-content" tabIndex={-1}>
        <section className="site-hero">
          <h1 className="site-title">{t.title[0]}<br /><span>{t.title[1]}</span></h1>
          <p className="site-lead">{t.lead}</p>
          <div className="site-hero__actions"><PrimaryCta large label={t.start} /><Link href="#demo" className="site-btn site-btn--game site-btn--lg">{t.explore}</Link></div>
          <ul className="site-trust-strip" aria-label={locale === "ar" ? "حول المنصة" : "Platform details"}>{t.trust.map(item => <li key={item}>{item}</li>)}</ul>
          <figure className="site-flow" aria-label={t.flow.label}>
            <span className="site-flow__node site-flow__node--muted">{t.flow.source}</span>
            <span className="site-flow__arrow" aria-hidden="true" />
            <span className="site-flow__node site-flow__node--main">{t.flow.lesson}</span>
            <span className="site-flow__arrow" aria-hidden="true" />
            <span className="site-flow__row">{t.flow.outputs.map((o) => <span key={o} className="site-flow__node">{o}</span>)}</span>
            <span className="site-flow__arrow" aria-hidden="true" />
            <span className="site-flow__node site-flow__node--muted">{t.flow.practice}</span>
          </figure>
          <p className="site-product-definition">{productDefinition[locale === "ar" ? "ar" : "en"]}</p>
        </section>

        <AudienceJourneys />
        <section id="create" className="site-section" aria-labelledby="create-title">
          <div className="site-section-heading"><h2 id="create-title" className="site-h2">{t.create.title}</h2><p>{t.create.lead}</p></div>
          <Cards items={t.create.items} />
        </section>
        <div id="demo" className="site-demo-wrap site-demo-wrap--section"><ProductDemo /></div>

        <section id="learn" className="site-section" aria-labelledby="learn-title">
          <div className="site-section-heading"><h2 id="learn-title" className="site-h2">{t.learn.title}</h2><p>{t.learn.lead}</p></div>
          <Cards items={t.learn.items} />
        </section>

        <section id="play" className="site-section" aria-labelledby="play-title">
          <div className="site-section-heading">
            <h2 id="play-title" className="site-h2"><Radio size={30} aria-hidden="true" className="site-h2-icon" />{t.play.title}</h2>
            <p>{t.play.lead}</p>
            <Link href={t.play.href} className="site-text-link">{t.play.link} <ArrowRight size={17} className="site-arrow" aria-hidden="true" /></Link>
          </div>
        </section>

        <section id="connect" className="site-section" aria-labelledby="connect-title">
          <div className="site-section-heading"><h2 id="connect-title" className="site-h2">{t.connect.title}</h2><p>{t.connect.lead}</p></div>
          <div className="site-partners">
            <article className="site-partner">
              <div className="site-partner__head">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <span className="site-partner__mark site-partner__mark--max"><img src="/max-mark.png" alt="" width={30} height={30} /></span>
                <span className="site-partner__name">{t.connect.max.name}</span>
              </div>
              <h3>{t.connect.max.title}</h3>
              <p>{t.connect.max.body}</p>
              <a href="https://trymaxnow.vercel.app" className="site-text-link" target="_blank" rel="noreferrer">{t.connect.max.link} <ArrowRight size={17} className="site-arrow" aria-hidden="true" /></a>
            </article>
            <article className="site-partner">
              <div className="site-partner__head">
                <span className="site-partner__mark"><ChatGptMark size={26} /></span>
                <span className="site-partner__name">{t.connect.ai.name}</span>
              </div>
              <h3>{t.connect.ai.title}</h3>
              <p>{t.connect.ai.body}</p>
              <Link href="/chatgpt" className="site-text-link">{t.connect.ai.link} <ArrowRight size={17} className="site-arrow" aria-hidden="true" /></Link>
            </article>
            <article className="site-partner site-partner--soon" aria-label={`${t.connect.notion.name}: ${t.connect.notion.soon}`}>
              <div className="site-partner__head">
                <span className="site-partner__mark" aria-hidden="true"><NotionMark size={26} /></span>
                <span className="site-partner__name">{t.connect.notion.name}</span>
              </div>
              <p className="site-soon">{t.connect.notion.soon}</p>
            </article>
          </div>
        </section>

        <section id="understand" className="site-section" aria-labelledby="understand-title"><div className="site-section-heading"><h2 id="understand-title" className="site-h2">{t.understand.title}</h2><p>{t.understand.lead}</p></div><Cards items={t.understand.items} /></section>
        <section className="site-section" aria-label={locale === "ar" ? "المزيد من الإمكانات" : "More capabilities"}><ul className="site-capability-grid">{t.secondary.map(item => <li key={item}>{item}</li>)}</ul><Link href="/docs" className="site-text-link">{locale === "ar" ? "استكشف كل الإمكانات" : "Explore all capabilities"}</Link></section>
        <section id="open" className="site-section" aria-labelledby="open-title">
          <div className="site-section-heading"><h2 id="open-title" className="site-h2">{t.open.title}</h2><p>{t.open.lead}</p></div>
          <Cards items={t.open.items} />
        </section>

        <OpenTrust />
        <section className="site-cta"><h2 className="site-h2">{t.ctaTitle}</h2><p className="site-lead">{t.ctaLead}</p><div className="site-hero__actions"><PrimaryCta large label={t.start} /></div></section>
      </main>
      <SiteFooter />
    </div>
  );
}
