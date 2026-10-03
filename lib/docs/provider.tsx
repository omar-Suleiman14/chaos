"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";
import type { DocSection, DocBlock } from "./types";
import type { DocSearchEntry } from "./index";
import type { Locale } from "@/lib/locale";

const DocsContext = createContext<{ sections: DocSection[]; loading: boolean }>({ sections: [], loading: true });
type Rows = FunctionReturnType<typeof api.docs.listPublished>;
function LiveDocs({ children, seed }: { children: ReactNode; seed?: { locale: Locale; rows: Rows } }) {
  const { locale } = useLocale();
  const live = useQuery(api.docs.listPublished, { locale });
  // The server's cached catalog paints first; the live query replaces it once connected.
  const rows = live ?? (seed?.locale === locale ? seed.rows : undefined);
  const sections = useMemo(() => {
    const groups = new Map<string, DocSection>();
    for (const row of rows ?? []) {
      let section = groups.get(row.sectionId);
      if (!section) { section = { id: row.sectionId, title: row.sectionTitle, articles: [] }; groups.set(row.sectionId, section); }
      section.articles.push({ slug: row.slug, title: row.title, summary: row.summary, blocks: row.blocks });
    }
    return [...groups.values()];
  }, [rows]);
  return <DocsContext.Provider value={{ sections, loading: rows === undefined }}>{children}</DocsContext.Provider>;
}
/** Docs pages pass the catalog the server already fetched, so guides render without waiting for the socket. */
export function SeededDocs({ seed, children }: { seed: { locale: Locale; rows: Rows }; children: ReactNode }) {
  return process.env.NEXT_PUBLIC_CONVEX_URL ? <LiveDocs seed={seed}>{children}</LiveDocs> : <>{children}</>;
}
/** One live public catalog subscription persists across app navigation. No bundled article fallback. */
export function DocsProvider({ children }: { children: ReactNode }) {
  return process.env.NEXT_PUBLIC_CONVEX_URL ? <LiveDocs>{children}</LiveDocs> : <DocsContext.Provider value={{ sections: [], loading: false }}>{children}</DocsContext.Provider>;
}
const plain = (text: string) => text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
function text(block: DocBlock) { return block.type === "steps" || block.type === "list" ? block.items.map(plain).join(". ") : block.type === "keys" ? block.items.map(item => `${item.keys.join("+")} ${item.label}`).join(". ") : plain(block.text); }
export function useDocs() {
  const { sections, loading } = useContext(DocsContext);
  return useMemo(() => {
    const articles = sections.flatMap(section => section.articles.map(article => ({ ...article, sectionId: section.id, sectionTitle: section.title })));
    const entries: DocSearchEntry[] = [];
    for (const article of articles) {
      const href = `/docs/${article.slug}`;
      entries.push({ href, title: article.title, section: article.sectionTitle, text: `${article.summary} ${article.blocks.map(text).join(" ")}` });
      let heading: { id: string; title: string; parts: string[] } | null = null;
      const flush = () => { if (heading) entries.push({ href: `${href}#${heading.id}`, title: heading.title, section: article.sectionTitle, text: `${article.title} ${heading.parts.join(" ")}` }); };
      for (const block of article.blocks) { if (block.type === "heading") { flush(); heading = { id: block.id, title: block.text, parts: [] }; } else heading?.parts.push(text(block)); }
      flush();
    }
    return { sections, articles, entries, loading };
  }, [sections, loading]);
}
