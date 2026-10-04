"use client";

import Link from "@/components/site/SiteLink";
import { Fragment, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Lightbulb } from "lucide-react";
import { useCopy, useLocale } from "@/lib/i18n";
import { useDocs } from "@/lib/docs/provider";
import type { DocBlock } from "@/lib/docs";
import DocsSearch from "./DocsSearch";
import { docsCopy } from "./copy";

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

function Block({ block }: { block: DocBlock }) {
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

export function DocsIndex() {
  const t = useCopy(docsCopy);
  const { locale } = useLocale();
  const { sections, loading } = useDocs();
  return (
    <div className="docs-index">
      <h1>{t.indexTitle}</h1>
      <p className="docs-summary">{t.indexLead}</p>
      <DocsSearch inline />
      <div className="docs-cards">
        {loading && <p role="status">{locale === "ar" ? "جارٍ تحميل الأدلة…" : "Loading guides…"}</p>}
        {!loading && sections.length === 0 && <p>{locale === "ar" ? "لا توجد أدلة منشورة بعد." : "No guides have been published yet."}</p>}
        {sections.map((section) => (
          <section key={section.id} className="docs-card">
            <h2>{section.title}</h2>
            <p className="docs-card__count">{t.articlesCount(section.articles.length)}</p>
            <ul>{section.articles.map((article) => <li key={article.slug}><Link href={`/docs/${article.slug}`}>{article.title}</Link><span>{article.summary}</span></li>)}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}
