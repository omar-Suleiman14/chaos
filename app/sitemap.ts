import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { listPublicDocs } from "@/lib/docs/server";
import { listIndexableLessons, listPublicCourses } from "@/lib/learn/server";

/** Refreshed hourly, so newly indexable lessons appear without a redeploy. */
export const revalidate = 3600;

/** Public pages and opted-in lessons; people's forms are never listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // A backend outage (or a build without one) keeps the static pages instead of failing.
  const [lessons, courses, docs] = await Promise.all([listIndexableLessons().catch(() => []), listPublicCourses().catch(() => []), listPublicDocs().catch(() => [])]);
  return [
    { url: `${siteUrl}/` },
    { url: `${siteUrl}/pricing` },
    { url: `${siteUrl}/compare` },
    { url: `${siteUrl}/docs` },
    ...docs.map(doc => ({ url: `${siteUrl}/docs/${doc.slug}`, lastModified: new Date(doc.updatedAt) })),
    { url: `${siteUrl}/chatgpt` },
    { url: `${siteUrl}/learn` },
    { url: `${siteUrl}/card` },
    { url: `${siteUrl}/support` },
    { url: `${siteUrl}/privacy` },
    { url: `${siteUrl}/terms` },
    ...courses.map(course => ({ url: `${siteUrl}/learn/courses/${encodeURIComponent(course.id)}`, lastModified: new Date(course.updatedAt) })),
    ...lessons.map(lesson => ({ url: `${siteUrl}/learn/${encodeURIComponent(lesson.id)}`, lastModified: new Date(lesson.publishedAt) })),
  ];
}
