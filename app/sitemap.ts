import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/hosts";
import { listPublicDocs } from "@/lib/docs/server";
import { listIndexableLessons, listPublicCourses } from "@/lib/learn/server";
import { localePath } from "@/lib/locale";
import { languageAlternates } from "@/lib/seo";

/** Refreshed hourly, so newly indexable lessons appear without a redeploy. */
export const revalidate = 3600;

/** Both language addresses of a marketing page, each listing the other as its hreflang alternate. */
function sitePage(path: string, lastModified?: Date): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(Object.entries(languageAlternates(path)).map(([lang, href]) => [lang, absoluteUrl(href)]));
  return [path, localePath(path, "ar")].map(href => ({ url: absoluteUrl(href), ...(lastModified ? { lastModified } : {}), alternates: { languages } }));
}

/** Public pages and opted-in lessons; people's forms are never listed. Each URL is on its own host (lib/hosts.ts). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
}
