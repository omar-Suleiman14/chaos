import SiteMapView, { type SiteMapDocSection } from "@/components/site/SiteMapView";
import { getDocsCatalog } from "@/lib/docs/server";
import { isLocale } from "@/lib/locale";
import { sitePageMetadata, type SitePageProps } from "@/lib/seo";

/** Lists the published guides too, so it refreshes with the docs. */
export const revalidate = 300;

export async function generateMetadata({ params }: SitePageProps) {
  return sitePageMetadata((await params).lang, {
    en: { title: "Site map", description: "Every page on Chaos in one place: the product, Learn, connections, account, open source, help, legal and all documentation." },
    ar: { title: "خريطة الموقع", description: "كل صفحات Chaos في مكان واحد: المنتج وLearn والاتصالات والحساب والمصدر المفتوح والمساعدة والصفحات القانونية وكل الأدلة." },
  }, "/sitemap");
}

export default async function SiteMapPage({ params }: SitePageProps) {
  const { lang } = await params;
  const rows = await getDocsCatalog(isLocale(lang) ? lang : "en").catch(() => []);
  const sections: SiteMapDocSection[] = [];
  for (const row of rows) {
    let section = sections.find((s) => s.id === row.sectionId);
    if (!section) sections.push(section = { id: row.sectionId, title: row.sectionTitle, articles: [] });
    section.articles.push({ slug: row.slug, title: row.title });
  }
  return <SiteMapView docs={sections} />;
}
