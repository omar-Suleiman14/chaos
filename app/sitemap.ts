import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { docSlugs } from "@/lib/docs";
import { listIndexableLessons } from "@/lib/learn/server";

/** Static public pages only; people's forms are never listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lessons = await listIndexableLessons();
  return [
    { url: `${siteUrl}/` },
    { url: `${siteUrl}/pricing` },
    { url: `${siteUrl}/compare` },
    { url: `${siteUrl}/docs` },
    ...docSlugs.map((slug) => ({ url: `${siteUrl}/docs/${slug}` })),
    { url: `${siteUrl}/chatgpt` },
    { url: `${siteUrl}/support` },
    { url: `${siteUrl}/privacy` },
    { url: `${siteUrl}/terms` },
    ...lessons.map(lesson => ({ url: `${siteUrl}/learn/${encodeURIComponent(lesson.id)}`, lastModified: new Date(lesson.publishedAt) })),
  ];
}
