import { cache } from "react";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
export const getPublicDoc = cache(async (slug: string, locale: "en" | "ar" = "en") => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url).query(api.docs.getPublished, { slug, locale }) : null;
});
export async function listPublicDocs() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url).query(api.docs.listPublished, { locale: "en" }) : [];
}
