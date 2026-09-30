import type { Locale } from "@/lib/locale";
import { blockText, docSections } from "./content";
export * from "./content";

/**
 * Search contract for the in-app docs at /docs. The docs content fills `docEntries`;
 * the Ctrl+K palette and the docs search both read it through `docSearchEntries`.
 */
export interface DocSearchEntry {
  /** Link to the article or a heading inside it, for example "/docs/sharing#custom-links". */
  href: string;
  /** Article or heading title in the given language. */
  title: string;
  /** The docs section it belongs to, for example "Sharing". */
  section: string;
  /** Plain text of the article or heading's body, used for full-text matching and snippets. */
  text: string;
}

/** One entry per article (its whole text) and one per heading (the text under that heading). */
function buildEntries(locale: Locale): DocSearchEntry[] {
  const entries: DocSearchEntry[] = [];
  for (const section of docSections[locale]) {
    for (const article of section.articles) {
      const base = `/docs/${article.slug}`;
      const intro: string[] = [article.summary];
      let current: { id: string; title: string; parts: string[] } | null = null;
      const flush = () => {
        if (current) entries.push({ href: `${base}#${current.id}`, title: current.title, section: section.title, text: `${article.title}. ${current.parts.join(" ")}` });
      };
      const all: string[] = [];
      for (const block of article.blocks) {
        if (block.type === "heading") {
          flush();
          current = { id: block.id, title: block.text, parts: [] };
          all.push(blockText(block));
          continue;
        }
        const text = blockText(block);
        all.push(text);
        if (current) current.parts.push(text); else intro.push(text);
      }
      flush();
      entries.push({ href: base, title: article.title, section: section.title, text: `${intro[0]} ${all.join(" ")}` });
    }
  }
  return entries;
}

export const docEntries: Record<Locale, DocSearchEntry[]> = { en: buildEntries("en"), ar: buildEntries("ar") };

export function docSearchEntries(locale: Locale): DocSearchEntry[] {
  return docEntries[locale];
}
