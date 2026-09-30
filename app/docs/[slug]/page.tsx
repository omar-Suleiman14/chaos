import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { docSlugs, findArticle } from "@/lib/docs";
import { DocsArticle } from "../DocsViews";
import { pageMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return docSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const article = findArticle("en", (await params).slug);
  if (!article) return {};
  return pageMetadata(article.title, article.summary, `/docs/${article.slug}`);
}

export default async function DocsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!findArticle("en", slug)) notFound();
  return <DocsArticle slug={slug} />;
}
