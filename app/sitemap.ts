import type { MetadataRoute } from "next";
import { sitemapShard, sitemapShards } from "@/lib/sitemap";

/** Refreshed hourly, so newly indexable lessons appear without a redeploy. */
export const revalidate = 3600;

/** Shards of at most 50,000 URLs at /sitemap/<id>.xml; /sitemap.xml is their index (app/api/sitemap/route.ts). */
export const generateSitemaps = sitemapShards;

export default async function sitemap(props?: { id: Promise<string> | string }): Promise<MetadataRoute.Sitemap> {
  return sitemapShard(Number((await props?.id) ?? 0));
}
