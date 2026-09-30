import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { docSlugs } from "@/lib/docs";

/** Static public pages only; people's forms are never listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${siteUrl}/` },
    { url: `${siteUrl}/pricing` },
    { url: `${siteUrl}/docs` },
    ...docSlugs.map((slug) => ({ url: `${siteUrl}/docs/${slug}` })),
    { url: `${siteUrl}/chatgpt` },
    { url: `${siteUrl}/privacy` },
    { url: `${siteUrl}/terms` },
  ];
}
