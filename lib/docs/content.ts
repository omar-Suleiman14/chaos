import type { Locale } from "../locale";
import { sectionsAr } from "./content-ar";
import { sectionsEn } from "./content-en";
import { extraArticles } from "./articles-extra";
import { docStructure } from "./structure";
import type { DocArticle, DocBlock, DocSection } from "./types";

export type { DocArticle, DocBlock, DocSection } from "./types";

/** Articles from every source, grouped by lib/docs/structure.ts. Anything unplaced is appended so it stays reachable. */
function grouped(locale: Locale, sections: DocSection[]): DocSection[] {
  const all = [...sections.flatMap((section) => section.articles), ...extraArticles[locale]];
  const bySlug = new Map(all.map((article) => [article.slug, article]));
  const placed = new Set<string>();
  const result = docStructure.map((group) => ({
    id: group.id,
    title: group.title[locale],
    articles: group.slugs.flatMap((slug) => { const article = bySlug.get(slug); if (!article) return []; placed.add(slug); return [article]; }),
  }));
  const rest = all.filter((article) => !placed.has(article.slug));
  return rest.length ? [...result, { id: "more", title: locale === "ar" ? "المزيد" : "More", articles: rest }] : result;
}

export const docSections: Record<Locale, DocSection[]> = { en: grouped("en", sectionsEn), ar: grouped("ar", sectionsAr) };

export interface FlatArticle extends DocArticle {
  sectionId: string;
  sectionTitle: string;
}

/** Every article in reading order, with the section it belongs to. */
export function flatArticles(locale: Locale): FlatArticle[] {
  return docSections[locale].flatMap((section) => section.articles.map((article) => ({ ...article, sectionId: section.id, sectionTitle: section.title })));
}

export function findArticle(locale: Locale, slug: string): FlatArticle | undefined {
  return flatArticles(locale).find((article) => article.slug === slug);
}

/** Slugs are the same in both languages, so English is the source of truth. */
export const docSlugs: string[] = flatArticles("en").map((article) => article.slug);

/** The article before and after this one in reading order. */
export function neighbours(locale: Locale, slug: string): { previous?: FlatArticle; next?: FlatArticle } {
  const all = flatArticles(locale);
  const index = all.findIndex((article) => article.slug === slug);
  return index < 0 ? {} : { previous: all[index - 1], next: all[index + 1] };
}

export function articleHeadings(article: DocArticle): { id: string; text: string }[] {
  return article.blocks.flatMap((block) => (block.type === "heading" ? [{ id: block.id, text: block.text }] : []));
}

/** Removes the inline markup (bold, code, links) so text can be searched and shown as a snippet. */
export function plainText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

export function blockText(block: DocBlock): string {
  switch (block.type) {
    case "p":
    case "tip":
    case "heading":
      return plainText(block.text);
    case "steps":
    case "list":
      return block.items.map(plainText).join(". ");
    case "keys":
      return block.items.map((item) => `${item.keys.join("+")} ${item.label}`).join(". ");
  }
}
