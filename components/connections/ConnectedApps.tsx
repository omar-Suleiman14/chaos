"use client";

import { ArrowUpRight } from "lucide-react";
import { NotionMark } from "@/components/site/marks";
import { useCopy } from "@/lib/i18n";

/* The apps most people connect, in plain words. Developer tools (API tokens, MCP, webhooks) sit below on
   the Connections page. Notion is only announced: there is no Notion setup, token or route yet. */

const copy = {
  en: {
    title: "Apps", lead: "Use Chaos with the tools you already have.",
    max: { name: "Max", body: "Turn a Max page into a Chaos draft to review. Only summaries go back to Max.", action: "Get Max" },
    notion: { name: "Notion", soon: "Coming soon" },
  },
  ar: {
    title: "التطبيقات", lead: "استخدم Chaos مع الأدوات التي لديك.",
    max: { name: "Max", body: "حوّل صفحة من Max إلى مسودة في Chaos لتراجعها. لا يعود إلى Max سوى الملخصات.", action: "احصل على Max" },
    notion: { name: "Notion", soon: "قريبًا" },
  },
};

export default function ConnectedApps() {
  const t = useCopy(copy);
  return (
    <section aria-labelledby="apps-title" className="cx-apps">
      <h2 id="apps-title" className="cx-apps__title">{t.title}</h2>
      <p className="cx-apps__lead">{t.lead}</p>
      <div className="cx-apps__grid">
        <article className="cx-app">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="cx-app__mark cx-app__mark--max"><img src="/max-mark.png" alt="" width={22} height={22} /></span>
          <h3>{t.max.name}</h3>
          <p>{t.max.body}</p>
          <a className="ws-btn ws-btn--sm" href="https://trymaxnow.vercel.app" target="_blank" rel="noreferrer">{t.max.action} <ArrowUpRight size={14} aria-hidden /></a>
        </article>
        <article className="cx-app cx-app--soon" aria-label={`${t.notion.name}: ${t.notion.soon}`}>
          <span className="cx-app__mark" aria-hidden><NotionMark size={20} /></span>
          <h3>{t.notion.name}</h3>
          <span className="ws-pill">{t.notion.soon}</span>
        </article>
      </div>
    </section>
  );
}
