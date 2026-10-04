"use client";

import { SiteNav, SiteFooter } from "./SiteChrome";
import { useLocale } from "@/lib/i18n";
import Link from "./SiteLink";
import ExploreBrowser from "@/components/learn/ExploreBrowser";
import "@/app/landing.css";

export default function PublicExplore() {
  const { locale } = useLocale();
  return <div className="site-ui">
    <SiteNav />
    <main id="main-content" tabIndex={-1} className="workspace-ui site-explore">
      <section className="site-section"><h1 className="site-h2">{locale === "ar" ? "تعلّم داخل الدرس" : "Learn inside the lesson"}</h1><p>{locale === "ar" ? "دروس تفاعلية وبطاقات واختبارات قصيرة وتقدم خاص، في دورات مرتبة." : "Interactive lessons, flashcards, checkpoints and private progress, arranged into courses."}</p><Link className="site-text-link" href="/docs/lessons">{locale === "ar" ? "كيف يعمل Learn" : "How Learn works"}</Link></section>
      <ExploreBrowser />
    </main>
    <SiteFooter />
  </div>;
}
