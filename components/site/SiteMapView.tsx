"use client";

import "@/app/landing.css";
import Link from "@/components/site/SiteLink";
import { SiteFooter, SiteNav } from "./SiteChrome";
import { useCopy, useLocale } from "@/lib/i18n";
import { repoIssuesUrl, repoUrl, statusPageUrl } from "@/lib/site";

export type SiteMapDocSection = { id: string; title: string; articles: { slug: string; title: string }[] };
type Item = { label: string; href: string; external?: boolean };
type Column = { title: string; items: Item[] };

const copy = {
  en: {
    title: "Chaos site map",
    explore: "Explore Chaos", account: "Account and help", docs: "Documentation",
    product: "Product", home: "Home", ways: "Ways to answer", themes: "Themes", features: "Features", pricing: "Pricing", compare: "Compare",
    learn: "Learn", courses: "Explore courses", authors: "Discover authors", play: "Join a game",
    connections: "Connections", chatgpt: "Chaos in ChatGPT", connect: "Connect Claude or ChatGPT", api: "API and connections", webhooks: "Webhooks",
    yourAccount: "Your account", signUp: "Create an account", signIn: "Log in", open: "Open Chaos",
    openSource: "Open source", source: "Source code", selfHost: "Self-hosting", issues: "Report an issue",
    help: "Help", support: "Support", allDocs: "All documentation", status: "Service status", security: "Security",
    legal: "Legal", privacy: "Privacy policy", terms: "Terms and conditions", copyright: "Copyright",
  },
  ar: {
    title: "خريطة موقع Chaos",
    explore: "استكشف Chaos", account: "الحساب والمساعدة", docs: "الدليل",
    product: "المنتج", home: "الرئيسية", ways: "طرق الإجابة", themes: "المظاهر", features: "المزايا", pricing: "الأسعار", compare: "المقارنة",
    learn: "Learn", courses: "استكشف الدورات", authors: "اكتشف المؤلفين", play: "انضم إلى لعبة",
    connections: "الاتصالات", chatgpt: "Chaos في ChatGPT", connect: "اربط Claude أو ChatGPT", api: "API والاتصالات", webhooks: "Webhooks",
    yourAccount: "حسابك", signUp: "أنشئ حسابًا", signIn: "تسجيل الدخول", open: "افتح Chaos",
    openSource: "مفتوح المصدر", source: "الشيفرة المصدرية", selfHost: "الاستضافة الذاتية", issues: "أبلغ عن مشكلة",
    help: "المساعدة", support: "الدعم", allDocs: "كل الأدلة", status: "حالة الخدمة", security: "الأمان",
    legal: "قانوني", privacy: "سياسة الخصوصية", terms: "الشروط والأحكام", copyright: "حقوق النشر",
  },
};

function Group({ id, title, columns }: { id: string; title: string; columns: Column[] }) {
  return (
    <section className="site-map__group" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className="site-map__cols">
        {columns.map((column) => (
          <div key={column.title}>
            <h3>{column.title}</h3>
            <ul>
              {column.items.map((item) => (
                <li key={item.href}>{item.external ? <a href={item.href}>{item.label}</a> : <Link href={item.href}>{item.label}</Link>}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** An Apple-style site map: every public page, grouped, with all published guides. */
export default function SiteMapView({ docs }: { docs: SiteMapDocSection[] }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const explore: Column[] = [
    { title: t.product, items: [{ label: t.home, href: "/" }, { label: t.ways, href: "/#modes" }, { label: t.themes, href: "/#themes" }, { label: t.features, href: "/#features" }, { label: t.pricing, href: "/pricing" }, { label: t.compare, href: "/compare" }] },
    { title: t.learn, items: [{ label: t.courses, href: "/learn" }, { label: t.authors, href: "/card" }, { label: t.play, href: "/play" }] },
    { title: t.connections, items: [{ label: t.chatgpt, href: "/chatgpt" }, { label: t.connect, href: "/connect" }, { label: t.api, href: "/docs/integration-api" }, { label: t.webhooks, href: "/docs/webhooks" }] },
  ];
  const account: Column[] = [
    { title: t.yourAccount, items: [{ label: t.signUp, href: "/sign-up" }, { label: t.signIn, href: "/sign-in" }, { label: t.open, href: "/dashboard" }] },
    { title: t.openSource, items: [{ label: t.source, href: repoUrl, external: true }, { label: t.selfHost, href: "/docs/self-hosting" }, { label: t.issues, href: repoIssuesUrl, external: true }] },
    { title: t.help, items: [{ label: t.support, href: "/support" }, { label: t.allDocs, href: "/docs" }, ...(statusPageUrl ? [{ label: t.status, href: statusPageUrl, external: true }] : []), { label: t.security, href: "/support#security" }] },
    { title: t.legal, items: [{ label: t.privacy, href: "/privacy" }, { label: t.terms, href: "/terms" }, { label: t.copyright, href: "/copyright" }] },
  ];
  const guides: Column[] = docs.map((section) => ({ title: section.title, items: section.articles.map((article) => ({ label: article.title, href: `/docs/${article.slug}` })) }));
  return (
    <div className="site-ui">
      <SiteNav links={false} />
      <main id="main-content" tabIndex={-1} className="site-map" dir={locale === "ar" ? "rtl" : "ltr"}>
        <h1 className="site-h2">{t.title}</h1>
        <Group id="map-explore" title={t.explore} columns={explore} />
        <Group id="map-account" title={t.account} columns={account} />
        {guides.length > 0 && <Group id="map-docs" title={t.docs} columns={guides} />}
      </main>
      <SiteFooter />
    </div>
  );
}
