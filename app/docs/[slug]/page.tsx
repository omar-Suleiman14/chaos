import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicDoc } from "@/lib/docs/server";
import { DocsArticle } from "../DocsViews";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = (await params).slug;
  const article = await getPublicDoc(slug) ?? await getPublicDoc(slug, "ar");
  if (!article) return {};
  return pageMetadata(article.title, article.summary, `/docs/${article.slug}`);
}

export default async function DocsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await getPublicDoc(slug)) && !(await getPublicDoc(slug, "ar"))) notFound();
  return <DocsArticle slug={slug} />;
}
