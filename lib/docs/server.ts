import { cache } from "react";
import { unstable_cache } from "next/cache";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

/**
 * The published catalog for one language, cached across requests for a few minutes. Pages render
 * from it straight away; the live subscription in DocsProvider picks up edits after that.
 */
const fetchCatalog = unstable_cache(async (locale: "en" | "ar") => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url).query(api.docs.listPublished, { locale }) : [];
}, ["docs-catalog"], { revalidate: 300 });

export const getDocsCatalog = cache((locale: "en" | "ar" = "en") => fetchCatalog(locale));
export const getPublicDoc = cache(async (slug: string, locale: "en" | "ar" = "en") => (await getDocsCatalog(locale)).find(doc => doc.slug === slug) ?? null);
export const listPublicDocs = () => getDocsCatalog("en");
