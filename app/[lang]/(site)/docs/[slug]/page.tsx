import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicDoc, listPublicDocs } from "@/lib/docs/server";
import { isLocale, type Locale } from "@/lib/locale";
import { sitePageMetadata } from "@/lib/seo";
import { DocsArticle } from "../DocsViews";

type Props = { params: Promise<{ lang: string; slug: string }> };

export const revalidate = 300;

/** Every published guide prerenders in both languages; a guide published later renders on its first visit. */
export async function generateStaticParams() {
  return (await listPublicDocs().catch(() => [])).map(doc => ({ slug: doc.slug }));
}

/** The guide in the page's language, or the other language's copy while a translation is missing. */
async function article(slug: string, lang: string) {
  const locale: Locale = isLocale(lang) ? lang : "en";
  return await getPublicDoc(slug, locale).catch(() => null) ?? await getPublicDoc(slug, locale === "ar" ? "en" : "ar").catch(() => null);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  const [en, ar] = await Promise.all([article(slug, "en"), article(slug, "ar")]);
  if (!en || !ar) return {};
  return sitePageMetadata(lang, { en: { title: en.title, description: en.summary }, ar: { title: ar.title, description: ar.summary } }, `/docs/${en.slug}`);
}

export default async function DocsArticlePage({ params }: Props) {
  const { lang, slug } = await params;
  if (!(await article(slug, lang))) notFound();
  return <DocsArticle slug={slug} />;
}
