import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // Public forms and custom links stay crawlable; each page's own robots
      // meta decides indexing (forms are noindex unless the creator opts in).
      allow: "/",
      // Exact segments, so custom links like /administrator/... stay crawlable.
      disallow: [
        "/dashboard$", "/dashboard?", "/dashboard/",
        "/admin$", "/admin?", "/admin/",
        "/api$", "/api/", "/mcp$", "/mcp?", "/mcp/",
        "/print$", "/print/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
