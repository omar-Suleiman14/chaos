"use client";

import { productDefinition } from "@/lib/product";
import Link from "@/components/site/SiteLink";
import { ArrowRight, BookOpen, Braces, Download, FileText, GraduationCap, ListChecks, Radio, Server, Target, Users, Webhook } from "lucide-react";
import { PrimaryCta, SiteFooter, SiteNav } from "@/components/site/SiteChrome";
import { ChatGptMark, NotionMark } from "@/components/site/marks";
import { AiMark } from "@/components/site/aiMarks";
import HeroAvatars from "@/components/site/HeroAvatars";
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
    lead: "Write lessons and courses, then make them stick with quizzes, flashcards and live games. Build it yourself, or ask ChatGPT or Claude to draft it for you.",
    start: "Start free", explore: "Explore courses", trust: ["Open source (AGPL)", "Self-host with Docker", "English + Arabic", "Works with ChatGPT and Claude"],
    flow: { label: "How it fits together", source: "Notes, a PDF or an idea", lesson: "Lesson", outputs: ["Quiz", "Flashcards", "Course"], practice: "Practice or a live game" },
    teach: {
      title: "Teach", lead: "Write it once, put it in order, and see what people still find hard.",
      items: [
        { icon: BookOpen, title: "Lessons", body: "A page like a document: headings, images, video, equations, tables, sources and citations.", href: "/docs/lessons", link: "Write a lesson" },
        { icon: GraduationCap, title: "Courses", body: "Lessons in a clear order, free for anyone to take when public.", href: "/learn", link: "Browse courses" },
        { icon: ListChecks, title: "Quizzes and flashcards", body: "Marked for you, with explanations and hints. Attach them to lessons and each learner sees their progress and weak areas.", href: "/docs/first-quiz", link: "Make a quiz" },
      ],
    },
    play: {
      title: "Play", lead: "Put any quiz on the big screen. People join on their phones with a PIN, answer, and see the leaderboard after each round.",
      link: "Host a live game", href: "/docs/live-games",
    },
    ai: {
      title: "Build it with ChatGPT or Claude",
      lead: "Connect your account once, then ask your assistant to do the work in Chaos. New content arrives as a draft for you to review. Chaos itself runs no AI.",
      prompts: [
        { icon: GraduationCap, title: "Make a course from your notes", body: "“Use my notes to create a course draft with three lessons, flashcards and a quiz for each lesson.”" },
        { icon: ListChecks, title: "Build a quiz that teaches", body: "“Write 10 questions from this chapter with plausible wrong answers and short explanations.”" },
        { icon: Radio, title: "Prepare a live class", body: "“Open a live game for my Chapter 3 quiz and give me the join PIN.”" },
        { icon: Target, title: "Review what needs practice", body: "“Read my weak areas and tell me which lesson and flashcards to review.”" },
      ],
      link: "Connect ChatGPT or Claude", href: "/connect",
    },
    forms: {
      title: "Forms and surveys too", lead: "The same editor builds sign-ups, feedback and surveys, with sections, branching, file uploads and custom endings. Results come with live charts and exports.",
      link: "Build a form", href: "/docs/first-form",
    },
    teams: {
      title: "Work as a team", lead: "Business teams edit forms, lessons and courses together, and publish quizzes, courses, flashcards and live games only your team can open. Free for a limited time.",
      link: "See Business teams", href: "/teams",
    },
    connect: {
      title: "Connect", lead: "Bring in work from the other tools you use.",
      max: { name: "Max", title: "Turn Max pages into drafts.", body: "Pick a Max page and get a Chaos draft to review. Only summaries go back to Max.", link: "Get Max" },
      notion: { name: "Notion", soon: "Coming soon" },
    },
    open: {
      title: "Open", lead: "Your work isn't locked in.",
      items: [
        { icon: Server, title: "Open source and self-hostable", body: "AGPL licensed. Read the code, or run your own copy with Docker.", href: "/docs/self-hosting", link: "Self-hosting" },
        { icon: Download, title: "Exports", body: "Download responses as CSV, Excel or JSON whenever you like.", href: "/docs/export-responses", link: "Export responses" },
        { icon: Braces, title: "API and MCP", body: "Let your own apps and assistants create drafts and read summaries, with scoped permissions.", href: "/docs/integration-api", link: "Integration API" },
        { icon: Webhook, title: "Webhooks", body: "Chaos tells another app when something happens, like a new response.", href: "/docs/webhooks", link: "Webhooks" },
      ],
    },
    ctaTitle: "Write your first lesson.", ctaLead: "Then turn it into a quiz, flashcards or a live game. Free for personal use.",
  },
  ar: {
    title: ["حوّل ما تعرفه", "إلى شيء يستفيد منه الناس."],
    lead: "اكتب دروسًا ودورات، ثم ثبّتها في الأذهان باختبارات وبطاقات وألعاب مباشرة. ابنِها بنفسك أو اطلب من ChatGPT أو Claude أن يكتب لك مسودتها.",
    start: "ابدأ مجانًا", explore: "استكشف الدورات", trust: ["مفتوح المصدر (AGPL)", "استضافة ذاتية بـ Docker", "العربية والإنجليزية", "يعمل مع ChatGPT وClaude"],
    flow: { label: "كيف يترابط كل شيء", source: "ملاحظات أو ملف PDF أو فكرة", lesson: "درس", outputs: ["اختبار", "بطاقات", "دورة"], practice: "تدريب أو لعبة مباشرة" },
    teach: {
      title: "درّس", lead: "اكتبه مرة واحدة ورتّبه واعرف ما يصعب على الناس.",
      items: [
        { icon: BookOpen, title: "الدروس", body: "صفحة كالمستند: عناوين وصور وفيديو ومعادلات وجداول ومصادر واستشهادات.", href: "/docs/lessons", link: "اكتب درسًا" },
        { icon: GraduationCap, title: "الدورات", body: "دروس بترتيب واضح، مجانية لأي أحد حين تكون عامة.", href: "/learn", link: "تصفّح الدورات" },
        { icon: ListChecks, title: "الاختبارات والبطاقات", body: "تُصحَّح تلقائيًا مع شروح وتلميحات. أرفقها بالدروس ليرى كل متعلم تقدّمه ونقاط ضعفه.", href: "/docs/first-quiz", link: "أنشئ اختبارًا" },
      ],
    },
    play: {
      title: "العب", lead: "اعرض أي اختبار على الشاشة الكبيرة. ينضم الناس من هواتفهم برمز، ويجيبون، ويرون لوحة الصدارة بعد كل جولة.",
      link: "استضف لعبة مباشرة", href: "/docs/live-games",
    },
    ai: {
      title: "ابنِه مع ChatGPT أو Claude",
      lead: "اربط حسابك مرة واحدة، ثم اطلب من مساعدك أن ينجز العمل في Chaos. يصلك المحتوى الجديد مسودةً لتراجعها. Chaos نفسه لا يشغّل أي ذكاء اصطناعي.",
      prompts: [
        { icon: GraduationCap, title: "حوّل ملاحظاتك إلى دورة", body: "«استخدم ملاحظاتي لإنشاء مسودة دورة من ثلاثة دروس مع بطاقات واختبار لكل درس.»" },
        { icon: ListChecks, title: "أنشئ اختبارًا يساعد على التعلّم", body: "«اكتب عشرة أسئلة من هذا الفصل مع بدائل معقولة وتفسيرات قصيرة.»" },
        { icon: Radio, title: "جهّز حصة مباشرة", body: "«افتح لعبة مباشرة لاختبار الفصل الثالث وأعطني رمز الانضمام.»" },
        { icon: Target, title: "راجع ما يحتاج تدريبًا", body: "«اقرأ نقاط ضعفي وأخبرني أي درس وأي بطاقات أراجع.»" },
      ],
      link: "اربط ChatGPT أو Claude", href: "/connect",
    },
    forms: {
      title: "ونماذج واستطلاعات أيضًا", lead: "المحرّر نفسه يبني نماذج التسجيل والآراء والاستطلاعات، مع أقسام وتفرّع ورفع ملفات ورسائل ختامية مخصصة. وتأتي النتائج مع رسوم مباشرة وتصدير.",
      link: "أنشئ نموذجًا", href: "/docs/first-form",
    },
    teams: {
      title: "اعملوا كفريق", lead: "تعدّل فرق الأعمال النماذج والدروس والدورات معًا، وتنشر اختبارات ودورات وبطاقات وألعابًا مباشرة لا يفتحها إلا فريقك. مجانًا لفترة محدودة.",
      link: "تعرّف على فرق الأعمال", href: "/teams",
    },
    connect: {
      title: "اربط", lead: "أحضر عملك من الأدوات الأخرى التي تستخدمها.",
      max: { name: "Max", title: "حوّل صفحات Max إلى مسودات.", body: "اختر صفحة من Max واحصل على مسودة في Chaos لتراجعها. لا يعود إلى Max سوى الملخصات.", link: "احصل على Max" },
      notion: { name: "Notion", soon: "قريبًا" },
    },
    open: {
      title: "مفتوح", lead: "عملك ليس محبوسًا.",
      items: [
        { icon: Server, title: "مفتوح المصدر وقابل للاستضافة الذاتية", body: "برخصة AGPL. اقرأ الشيفرة أو شغّل نسختك بـ Docker.", href: "/docs/self-hosting", link: "الاستضافة الذاتية" },
        { icon: Download, title: "التصدير", body: "نزّل الردود بصيغة CSV أو Excel أو JSON متى شئت.", href: "/docs/export-responses", link: "تصدير الردود" },
        { icon: Braces, title: "API وMCP", body: "دع تطبيقاتك ومساعديك ينشئون المسودات ويقرؤون الملخصات بصلاحيات محددة.", href: "/docs/integration-api", link: "API التكامل" },
        { icon: Webhook, title: "Webhooks", body: "يخبر Chaos تطبيقًا آخر حين يحدث شيء، مثل وصول رد جديد.", href: "/docs/webhooks", link: "Webhooks" },
      ],
    },
    ctaTitle: "اكتب درسك الأول.", ctaLead: "ثم حوّله إلى اختبار أو بطاقات أو لعبة مباشرة. مجاني للاستخدام الشخصي.",
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
        <section className="site-hero site-hero--home">
          <HeroAvatars />
          <h1 className="site-title">{t.title[0]}<span>{t.title[1]}</span></h1>
          <p className="site-lead">{t.lead}</p>
          <div className="site-hero__actions"><PrimaryCta large label={t.start} /><Link href="/learn" className="site-btn site-btn--game site-btn--lg">{t.explore}</Link></div>
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

        <section id="teach" className="site-section" aria-labelledby="teach-title">
          <div className="site-section-heading"><h2 id="teach-title" className="site-h2">{t.teach.title}</h2><p>{t.teach.lead}</p></div>
          <Cards items={t.teach.items} />
        </section>

        <section id="play" className="site-section" aria-labelledby="play-title">
          <div className="site-section-heading">
            <h2 id="play-title" className="site-h2"><Radio size={30} aria-hidden="true" className="site-h2-icon" />{t.play.title}</h2>
            <p>{t.play.lead}</p>
            <Link href={t.play.href} className="site-text-link">{t.play.link} <ArrowRight size={17} className="site-arrow" aria-hidden="true" /></Link>
          </div>
        </section>

        <section id="ai" className="site-section" aria-labelledby="ai-title">
          <div className="site-section-heading">
            <span className="site-partner__marks" aria-hidden="true">
              <span className="site-partner__mark"><ChatGptMark size={26} /></span>
              <span className="site-partner__mark"><AiMark client="claude" size={26} /></span>
            </span>
            <h2 id="ai-title" className="site-h2">{t.ai.title}</h2>
            <p>{t.ai.lead}</p>
            <Link href={t.ai.href} className="site-text-link">{t.ai.link} <ArrowRight size={17} className="site-arrow" aria-hidden="true" /></Link>
          </div>
          <div className="site-features">
            {t.ai.prompts.map(({ icon: Icon, title, body }) => (
              <article key={title} className="site-feature">
                <Icon size={22} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="forms" className="site-section" aria-labelledby="forms-title">
          <div className="site-section-heading">
            <h2 id="forms-title" className="site-h2"><FileText size={30} aria-hidden="true" className="site-h2-icon" />{t.forms.title}</h2>
            <p>{t.forms.lead}</p>
            <Link href={t.forms.href} className="site-text-link">{t.forms.link} <ArrowRight size={17} className="site-arrow" aria-hidden="true" /></Link>
          </div>
        </section>

        <section id="teams" className="site-section" aria-labelledby="teams-title">
          <div className="site-section-heading">
            <h2 id="teams-title" className="site-h2"><Users size={30} aria-hidden="true" className="site-h2-icon" />{t.teams.title}</h2>
            <p>{t.teams.lead}</p>
            <Link href={t.teams.href} className="site-text-link">{t.teams.link} <ArrowRight size={17} className="site-arrow" aria-hidden="true" /></Link>
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
            <article className="site-partner site-partner--soon" aria-label={`${t.connect.notion.name}: ${t.connect.notion.soon}`}>
              <div className="site-partner__head">
                <span className="site-partner__mark" aria-hidden="true"><NotionMark size={26} /></span>
                <span className="site-partner__name">{t.connect.notion.name}</span>
              </div>
              <p className="site-soon">{t.connect.notion.soon}</p>
            </article>
          </div>
        </section>

        <section id="open" className="site-section" aria-labelledby="open-title">
          <div className="site-section-heading"><h2 id="open-title" className="site-h2">{t.open.title}</h2><p>{t.open.lead}</p></div>
          <Cards items={t.open.items} />
        </section>

        <section className="site-cta"><h2 className="site-h2">{t.ctaTitle}</h2><p className="site-lead">{t.ctaLead}</p><div className="site-hero__actions"><PrimaryCta large label={t.start} /></div></section>
      </main>
      <SiteFooter />
    </div>
  );
}
