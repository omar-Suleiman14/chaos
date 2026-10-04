import { isLocale, isSitePath, localePath, splitLocale, type Locale } from "./locale";

/**
 * What proxy.ts does with a request so every page renders under app/[lang]:
 * - "pass": the URL already names its language segment (/ar/pricing);
 * - "rewrite": serve the internal /en or /ar path while the address bar keeps the public URL;
 * - "redirect": move to the page's public URL for the visitor's language.
 * `setLocale` updates the chaos-lang cookie, so a visitor who opens /ar keeps Arabic on pages
 * that have a single address (dashboard, forms, lessons).
 */
export type LocaleRoute =
  | { action: "pass"; setLocale?: Locale }
  | { action: "rewrite"; pathname: string }
  | { action: "redirect"; location: string; status: 307 | 308; setLocale?: Locale };

/** Route handlers and files outside app/[lang]. */
const OUTSIDE_LANG = /^\/(?:api|trpc|mcp|_next|\.well-known|opengraph-image)(?:\/|$)|^\/(?:robots\.txt|sitemap\.xml|favicon\.ico)$/;

export function routeLocale(pathname: string, search: string, cookie: string | undefined): LocaleRoute {
  if (OUTSIDE_LANG.test(pathname)) return { action: "pass" };
  const preferred: Locale = isLocale(cookie) ? cookie : "en";
  const { locale, path } = splitLocale(pathname);
  const setLocale = locale && locale !== preferred ? locale : undefined;
  // English pages have no prefix, so /en/... permanently moves to the unprefixed address.
  if (locale === "en") return { action: "redirect", location: path + search, status: 308, setLocale };
  if (locale === "ar") {
    if (isSitePath(path)) return { action: "pass", setLocale };
    // Single-address pages: drop the prefix and remember the choice in the cookie.
    return { action: "redirect", location: path + search, status: 307, setLocale };
  }
  if (isSitePath(path)) {
    if (preferred === "ar") return { action: "redirect", location: localePath(path + search, "ar"), status: 307 };
    return { action: "rewrite", pathname: `/en${path === "/" ? "" : path}` };
  }
  return { action: "rewrite", pathname: `/${preferred}${path}` };
}
