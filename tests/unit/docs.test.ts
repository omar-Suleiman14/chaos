import { describe, expect, it } from "vitest";
import { routeFolderExists, topLevelRouteFolders } from "../routeFolders";
import { articleHeadings, docEntries, docSections, docSlugs, findArticle, flatArticles } from "@/lib/docs";
import type { DocBlock } from "@/lib/docs";
import { searchDocs } from "@/lib/docs/search";

const blockTexts = (block: DocBlock): string[] =>
  block.type === "steps" || block.type === "list" ? block.items : block.type === "keys" ? block.items.map((i) => i.label) : [block.text];

/** Every [label](/path) link written in the docs, per language. */
function links(locale: "en" | "ar"): string[] {
  return flatArticles(locale).flatMap((a) => [a.summary, ...a.blocks.flatMap(blockTexts)]).flatMap((text) => [...text.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]));
}

/** Top-level app routes that exist on disk, e.g. "pricing", "dashboard". */
const appRoutes = new Set(topLevelRouteFolders());

describe("docs content", () => {
  it("has the same articles and headings in English and Arabic", () => {
    for (const slug of docSlugs) {
      const en = findArticle("en", slug)!;
      const ar = findArticle("ar", slug);
      expect(ar, slug).toBeDefined();
      expect(articleHeadings(ar!).map((h) => h.id), slug).toEqual(articleHeadings(en).map((h) => h.id));
    }
    expect(docSections.ar.map((s) => s.id)).toEqual(docSections.en.map((s) => s.id));
  });

  it("explains Notion import and result-sync permissions in English and Arabic", () => {
    const en = findArticle("en", "notion")!;
    const ar = findArticle("ar", "notion")!;
    expect(articleHeadings(en).map(h => h.id)).toEqual(["connect", "import", "results", "privacy", "troubleshooting"]);
    expect(articleHeadings(ar).map(h => h.id)).toEqual(articleHeadings(en).map(h => h.id));
    expect(en.blocks.flatMap(blockTexts).join(" ")).toContain("individual answers");
    expect(ar.blocks.flatMap(blockTexts).join(" ")).toContain("الخصوصية");
    expect(en.title).toBe("Notion");
    expect(ar.title).toBe("Notion");
  });

  it("has unique slugs and heading ids", () => {
    expect(new Set(docSlugs).size).toBe(docSlugs.length);
    for (const a of flatArticles("en")) {
      const ids = articleHeadings(a).map((h) => h.id);
      expect(new Set(ids).size, a.slug).toBe(ids.length);
    }
  });

  it.each(["en", "ar"] as const)("only links to pages that exist (%s)", (locale) => {
    for (const href of links(locale)) {
      if (!href.startsWith("/")) continue;
      const [path, hash] = href.split("#");
      const parts = path.split("/").filter(Boolean);
      if (parts[0] === "docs" && parts[1]) {
        const article = findArticle(locale, parts[1]);
        expect(article, href).toBeDefined();
        if (hash) expect(articleHeadings(article!).map((h) => h.id), href).toContain(hash);
      } else if (parts.length) {
        expect(appRoutes.has(parts[0]) || routeFolderExists(parts), href).toBe(true);
      }
    }
  });
});

describe("docs search", () => {
  it("finds an article by a word from its body", () => {
    expect(searchDocs(docEntries.en, "access code")[0]?.entry.href).toMatch(/^\/docs\/access-and-limits/);
  });
  it("matches word starts and ignores Arabic spelling variants", () => {
    expect(searchDocs(docEntries.en, "cust lin").length).toBeGreaterThan(0);
    expect(searchDocs(docEntries.ar, "اختبار").length).toBeGreaterThan(0);
    expect(searchDocs(docEntries.ar, "إختبار").length).toBeGreaterThan(0);
  });
});
