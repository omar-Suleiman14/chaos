import { cache } from "react";
import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/hosts";
import { listPublicDocs } from "@/lib/docs/server";
import { listIndexableLessons, listPublicCourses } from "@/lib/learn/server";
import { localePath } from "@/lib/locale";
import { languageAlternates } from "@/lib/seo";

/** The sitemap protocol's limit for one file. Larger sites are split into shards under one index. */
const SITEMAP_URL_LIMIT = 50_000;

/** Both language addresses of a marketing page, each listing the other as its hreflang alternate. */
function sitePage(path: string, lastModified?: Date): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(Object.entries(languageAlternates(path)).map(([lang, href]) => [lang, absoluteUrl(href)]));
  return [path, localePath(path, "ar")].map(href => ({ url: absoluteUrl(href), ...(lastModified ? { lastModified } : {}), alternates: { languages } }));
}

/**
 * Every sitemap URL: public pages and opted-in lessons; people's forms are never listed. Each URL is on
 * its own host (lib/hosts.ts). Deduplicated within a render; each regenerated shard or index (hourly)
 * runs its own discovery pass.
 */
const sitemapEntries = cache(async (): Promise<MetadataRoute.Sitemap> => {
  // A backend outage (or a build without one) keeps the static pages instead of failing.
  const [lessons, courses, docs] = await Promise.all([listIndexableLessons().catch(() => []), listPublicCourses().catch(() => []), listPublicDocs().catch(() => [])]);
  const entries: MetadataRoute.Sitemap = [
    ...["/", "/pricing", "/compare", "/docs", "/faq"].flatMap(path => sitePage(path)),
    ...docs.flatMap(doc => sitePage(`/docs/${doc.slug}`, new Date(doc.updatedAt))),
    ...["/chatgpt", "/claude", "/connect", "/learn", "/forms-quizzes", "/live-games", "/ai", "/teams", "/open-source"].flatMap(path => sitePage(path)),
    { url: absoluteUrl("/card") },
    ...["/status", "/changelog", "/support", "/privacy", "/cookies", "/terms", "/sitemap"].flatMap(path => sitePage(path)),
    ...courses.map(course => ({ url: absoluteUrl(`/learn/courses/${encodeURIComponent(course.id)}`), lastModified: new Date(course.updatedAt) })),
    ...lessons.map(lesson => ({ url: absoluteUrl(`/learn/${encodeURIComponent(lesson.id)}`), lastModified: new Date(lesson.publishedAt) })),
  ];
  return [...new Map(entries.map(entry => [entry.url, entry])).values()];
});

/** One shard per 50,000 URLs, always at least one; ids are 0, 1, 2… (served at /sitemap/<id>.xml). */
export async function sitemapShards(): Promise<{ id: number }[]> {
  const count = Math.max(1, Math.ceil((await sitemapEntries()).length / SITEMAP_URL_LIMIT));
  return Array.from({ length: count }, (_, id) => ({ id }));
}

export async function sitemapShard(id: number): Promise<MetadataRoute.Sitemap> {
  return (await sitemapEntries()).slice(id * SITEMAP_URL_LIMIT, (id + 1) * SITEMAP_URL_LIMIT);
}
