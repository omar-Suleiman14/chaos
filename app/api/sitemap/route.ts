import { absoluteUrl } from "@/lib/hosts";
import { sitemapShards } from "@/lib/sitemap";

/** Refreshed hourly, like the shards it lists. */
export const revalidate = 3600;

/** The sitemap index robots.txt points to (served at /sitemap.xml by a rewrite): one entry per 50,000-URL shard from app/sitemap.ts. */
export async function GET() {
  const shards = await sitemapShards();
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${shards.map(({ id }) => `<sitemap><loc>${absoluteUrl(`/sitemap/${id}.xml`)}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
}
