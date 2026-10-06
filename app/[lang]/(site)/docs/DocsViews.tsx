"use client";

import Link from "@/components/site/SiteLink";
import { Fragment, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Lightbulb, Search } from "lucide-react";
import { useCopy, useLocale } from "@/lib/i18n";
import { useDocs } from "@/lib/docs/provider";
import type { DocBlock } from "@/lib/docs";
import { docsCopy, OPEN_DOCS_SEARCH } from "./copy";

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

/** Renders the docs' inline markup: **bold**, `code` and [label](/path). */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(INLINE).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`")) return <code key={i} dir="ltr">{part.slice(1, -1)}</code>;
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          const [, label, href] = link;
          return href.startsWith("/")
            ? <Link key={i} href={href}>{label}</Link>
            : <a key={i} href={href} target="_blank" rel="noreferrer">{label}</a>;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export function Block({ block }: { block: DocBlock }) {
  switch (block.type) {
    case "p": return <p><Rich text={block.text} /></p>;
    case "heading": return <h2 id={block.id}><a href={`#${block.id}`}><Rich text={block.text} /></a></h2>;
    case "steps": return <ol className="docs-steps">{block.items.map((item, i) => <li key={i}><Rich text={item} /></li>)}</ol>;
    case "list": return <ul className="docs-list">{block.items.map((item, i) => <li key={i}><Rich text={item} /></li>)}</ul>;
    case "tip": return <aside className="docs-tip"><Lightbulb size={17} aria-hidden="true" /><p><Rich text={block.text} /></p></aside>;
    case "keys":
      return (
        <table className="docs-keys">
          <tbody>
            {block.items.map((row, i) => (
              <tr key={i}>
                <td dir="ltr">{row.keys.map((key, k) => <Fragment key={k}>{k > 0 && <span aria-hidden="true">+</span>}<kbd>{key}</kbd></Fragment>)}</td>
                <td><Rich text={row.label} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

/** Marks the heading currently at the top of the screen in "On this page". */
function useActiveHeading(ids: string[]) {
  const [active, setActive] = useState<string | undefined>(ids[0]);
  useEffect(() => {
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!elements.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: "-80px 0px -65% 0px" });
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

export function DocsArticle({ slug }: { slug: string }) {
  const t = useCopy(docsCopy);
  const { locale, dir } = useLocale();
  const { articles, loading } = useDocs();
  const article = articles.find(article => article.slug === slug);
  const headings = article?.blocks.flatMap(block => block.type === "heading" ? [{ id: block.id, text: block.text }] : []) ?? [];
  const ids = headings.map((h) => h.id).join(" ");
  const active = useActiveHeading(ids ? ids.split(" ") : []);
  const index = articles.findIndex(article => article.slug === slug);
  const previous = articles[index - 1], next = articles[index + 1];
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const Forward = dir === "rtl" ? ArrowLeft : ArrowRight;
  if (!article) return <p role="status">{loading ? (locale === "ar" ? "جارٍ تحميل الدليل…" : "Loading guide…") : (locale === "ar" ? "الدليل غير متاح." : "This guide is unavailable.")}</p>;

  return (
    <div className="docs-article-wrap">
      <article className="docs-article">
        <p className="docs-eyebrow">{article.sectionTitle}</p>
        <h1>{article.title}</h1>
        <p className="docs-summary">{article.summary}</p>
        {article.blocks.map((block, i) => <Block key={i} block={block} />)}
        <nav className="docs-pager" aria-label={`${t.previous} / ${t.next}`}>
          {previous ? <Link href={`/docs/${previous.slug}`} className="docs-pager__prev"><small><Back size={14} aria-hidden="true" />{t.previous}</small><span>{previous.title}</span></Link> : <span />}
          {next && <Link href={`/docs/${next.slug}`} className="docs-pager__next"><small>{t.next}<Forward size={14} aria-hidden="true" /></small><span>{next.title}</span></Link>}
        </nav>
      </article>
      {headings.length > 1 && (
        <nav className="docs-toc" aria-label={t.onThisPage}>
          <h2>{t.onThisPage}</h2>
          <ul>{headings.map((h) => <li key={h.id}><a href={`#${h.id}`} aria-current={active === h.id ? "location" : undefined}>{h.text}</a></li>)}</ul>
        </nav>
      )}
    </div>
  );
}

const home = {
  en: {
    eyebrow: "Chaos documentation",
    title: "Make things people answer, read and play.",
    lead: "Chaos is an open workspace for forms, quizzes, lessons, courses and live games. These guides show you how to build each one, share it and see how it went.",
    start: "Get started", what: "What is Chaos?", search: "Search the docs",
    forms: { title: "Forms and quizzes that feel like yours", body: "Ask one question at a time or show them all. Pick a theme, add logic, mark quizzes for you and publish when you're ready. Try the one on the right; nothing you choose is sent.", link: "Make your first form", href: "/docs/first-form" },
    learn: { title: "Lessons and courses for real teaching", body: "Write lessons like a document, with images, equations, flashcards and checkpoint quizzes. Put them in order as a course and share one link.", link: "Write a lesson", href: "/docs/lessons", lesson: "Lecture 1: The nervous system", course: "CNS · Lesson 1 of 7", h1: "1. How the nervous system is divided", h2: "2. Neurons and myelin", check: "Checkpoint: Foundations", checkBody: "4 questions" },
    live: { title: "Run any quiz live", body: "Share a PIN, let everyone join from their phone and reveal the answers together. Games run themselves or wait for you.", link: "Host a live game", href: "/docs/live-games", pin: "GAME PIN", players: "24 players" },
    ai: { title: "Or ask your assistant", body: "Connect Claude or ChatGPT and ask in plain words. Your assistant does the writing; Chaos keeps your content, permissions and links.", link: "Connect Claude", href: "/docs/claude", link2: "Connect ChatGPT", href2: "/docs/chatgpt", you: "Make a 10-question quiz from this PDF and publish it.", them: "Published “Cell biology check” with 10 questions." },
    ready: "Ready to make something?", readyBody: "Chaos is free for personal use. No AI required.", open: "Open Chaos",
  },
  ar: {
    eyebrow: "دليل Chaos",
    title: "اصنع ما يجيب عنه الناس ويقرؤونه ويلعبونه.",
    lead: "Chaos مساحة عمل مفتوحة للنماذج والاختبارات والدروس والدورات والألعاب المباشرة. تشرح هذه الأدلة كيف تبني كلًّا منها وتشاركه وترى نتيجته.",
    start: "ابدأ", what: "ما هو Chaos؟", search: "ابحث في الدليل",
    forms: { title: "نماذج واختبارات تشبهك", body: "اسأل سؤالًا في كل مرة أو اعرضها كلها. اختر مظهرًا، وأضف منطقًا، ودع الاختبارات تُصحَّح وحدها، وانشر حين تكون جاهزًا. جرّب النموذج المجاور؛ لا يُرسل شيء مما تختاره.", link: "اصنع أول نموذج", href: "/docs/first-form" },
    learn: { title: "دروس ودورات لتعليم حقيقي", body: "اكتب الدروس كأنها مستند، بالصور والمعادلات والبطاقات والاختبارات القصيرة. رتّبها في دورة وشاركها برابط واحد.", link: "اكتب درسًا", href: "/docs/lessons", lesson: "المحاضرة 1: الجهاز العصبي", course: "CNS · الدرس 1 من 7", h1: "1. كيف ينقسم الجهاز العصبي", h2: "2. العصبونات والميالين", check: "اختبار قصير: الأساسيات", checkBody: "4 أسئلة" },
    live: { title: "شغّل أي اختبار مباشرةً", body: "شارك الرمز، ودع الجميع ينضمون من هواتفهم، واكشفوا الإجابات معًا. تسير اللعبة وحدها أو تنتظرك.", link: "استضف لعبة مباشرة", href: "/docs/live-games", pin: "رمز اللعبة", players: "24 لاعبًا" },
    ai: { title: "أو اطلب من مساعدك", body: "اربط Claude أو ChatGPT واطلب بكلماتك. مساعدك يكتب، وChaos يحفظ محتواك وصلاحياتك وروابطك.", link: "اربط Claude", href: "/docs/claude", link2: "اربط ChatGPT", href2: "/docs/chatgpt", you: "أنشئ اختبارًا من 10 أسئلة من ملف PDF هذا وانشره.", them: "نُشر «مراجعة بيولوجيا الخلية» بعشرة أسئلة." },
    ready: "مستعد لتصنع شيئًا؟", readyBody: "Chaos مجاني للاستخدام الشخصي. ولا يحتاج إلى ذكاء اصطناعي.", open: "افتح Chaos",
  },
};

const ProductDemo = dynamic(() => import("@/components/site/ProductDemo"), { ssr: false, loading: () => <div className="docs-home__demo-placeholder" aria-hidden="true" /> });

/** The docs home, in the spirit of react.dev: what Chaos is, each part shown working, then every guide. */
export function DocsIndex() {
  const { locale } = useLocale();
  const h = home[locale === "ar" ? "ar" : "en"];
  const more = (href: string, label: string) => <Link href={href} className="docs-home__more">{label}<ArrowRight size={16} className="site-arrow" aria-hidden="true" /></Link>;
  return (
    <div className="docs-home">
      <header className="docs-home__hero">
        {/* eslint-disable-next-line @next/next/no-img-element -- the static Chaos mark */}
        <img src="/icon.svg" alt="" width={72} height={72} className="docs-home__mark" />
        <p className="docs-home__eyebrow">{h.eyebrow}</p>
        <h1>{h.title}</h1>
        <p className="docs-home__lead">{h.lead}</p>
        <button type="button" className="docs-search__field docs-home__search" onClick={() => window.dispatchEvent(new Event(OPEN_DOCS_SEARCH))} aria-keyshortcuts="Control+K Meta+K /">
          <Search size={18} aria-hidden="true" /><span>{h.search}</span><kbd className="docs-search__hint" aria-hidden="true" dir="ltr">Ctrl K</kbd>
        </button>
        <div className="docs-home__actions">
          <Link href="/docs/first-form" className="site-btn site-btn--primary site-btn--lg">{h.start}<ArrowRight size={17} className="site-arrow" aria-hidden="true" /></Link>
          <Link href="/docs/what-is-chaos" className="site-btn site-btn--outline site-btn--lg">{h.what}</Link>
        </div>
      </header>

      <section className="docs-home__row docs-home__row--demo">
        <div className="docs-home__copy"><h2>{h.forms.title}</h2><p>{h.forms.body}</p>{more(h.forms.href, h.forms.link)}</div>
        <div className="docs-home__visual"><ProductDemo /></div>
      </section>

      <section className="docs-home__row">
        <div className="docs-home__copy"><h2>{h.learn.title}</h2><p>{h.learn.body}</p>{more(h.learn.href, h.learn.link)}</div>
        <div className="docs-home__visual">
          <div className="docs-shot docs-shot--lesson" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- a bundled gallery cover */}
            <img src="/covers/japanese/the-great-wave-off-kanagawa.jpg" alt="" />
            <div className="docs-shot__page">
              <small>{h.learn.course}</small>
              <strong>{h.learn.lesson}</strong>
              <span className="docs-shot__line" /><span className="docs-shot__line docs-shot__line--short" />
              <b>{h.learn.h1}</b>
              <span className="docs-shot__line" /><span className="docs-shot__line" /><span className="docs-shot__line docs-shot__line--short" />
              <div className="docs-shot__check"><strong>{h.learn.check}</strong><small>{h.learn.checkBody}</small></div>
              <b>{h.learn.h2}</b>
              <span className="docs-shot__line" /><span className="docs-shot__line docs-shot__line--short" />
            </div>
          </div>
        </div>
      </section>

      <section className="docs-home__row">
        <div className="docs-home__copy"><h2>{h.live.title}</h2><p>{h.live.body}</p>{more(h.live.href, h.live.link)}</div>
        <div className="docs-home__visual">
          <div className="docs-shot docs-shot--game" aria-hidden="true">
            <div className="docs-shot__game-top"><span>{h.live.pin} <b dir="ltr">482 913</b></span><span>{h.live.players}</span></div>
            <div className="docs-shot__tiles">{["#e21b3c", "#1368ce", "#d89e00", "#26890c"].map((c) => <span key={c} style={{ background: c }} />)}</div>
          </div>
        </div>
      </section>

      <section className="docs-home__row">
        <div className="docs-home__copy"><h2>{h.ai.title}</h2><p>{h.ai.body}</p><div className="docs-home__links">{more(h.ai.href, h.ai.link)}{more(h.ai.href2, h.ai.link2)}</div></div>
        <div className="docs-home__visual">
          <div className="docs-shot docs-shot--chat" aria-hidden="true">
            <p className="docs-shot__you">{h.ai.you}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- the static Chaos mark */}
            <p className="docs-shot__them"><img src="/icon.svg" alt="" width={18} height={18} />{h.ai.them}</p>
          </div>
        </div>
      </section>

      <section className="docs-home__cta">
        <h2>{h.ready}</h2>
        <p>{h.readyBody}</p>
        <Link href="/dashboard" className="site-btn site-btn--primary site-btn--lg">{h.open}</Link>
      </section>
    </div>
  );
}
