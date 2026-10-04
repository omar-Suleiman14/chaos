import { describe, expect, it } from "vitest";
import { isSitePath, localePath, splitLocale } from "@/lib/locale";
import { routeLocale } from "@/lib/localeRouting";
import { languageAlternates, sitePageMetadata } from "@/lib/seo";

describe("language addresses", () => {
  it("knows which pages have an address per language", () => {
    for (const path of ["/", "/pricing", "/compare", "/docs", "/docs/first-form", "/learn", "/chatgpt", "/connect", "/support", "/privacy", "/terms", "/copyright", "/sitemap"]) expect(isSitePath(path), path).toBe(true);
    for (const path of ["/dashboard", "/learn/abc", "/learn/courses/c1", "/f/share", "/creator/quiz", "/docs/Bad_Slug", "/play", "/card"]) expect(isSitePath(path), path).toBe(false);
  });

  it("prefixes marketing pages in Arabic and leaves everything else alone", () => {
    expect(localePath("/", "ar")).toBe("/ar");
    expect(localePath("/pricing", "ar")).toBe("/ar/pricing");
    expect(localePath("/docs/first-form#steps", "ar")).toBe("/ar/docs/first-form#steps");
    expect(localePath("/learn?q=math", "ar")).toBe("/ar/learn?q=math");
    expect(localePath("/pricing", "en")).toBe("/pricing");
    expect(localePath("/dashboard", "ar")).toBe("/dashboard");
    expect(localePath("https://example.com/pricing", "ar")).toBe("https://example.com/pricing");
    expect(localePath("//example.com/pricing", "ar")).toBe("//example.com/pricing");
  });

  it("splits a language prefix off a path", () => {
    expect(splitLocale("/ar")).toEqual({ locale: "ar", path: "/" });
    expect(splitLocale("/ar/docs/x")).toEqual({ locale: "ar", path: "/docs/x" });
    expect(splitLocale("/en/pricing")).toEqual({ locale: "en", path: "/pricing" });
    expect(splitLocale("/arabic")).toEqual({ locale: null, path: "/arabic" });
    expect(splitLocale("/pricing")).toEqual({ locale: null, path: "/pricing" });
  });
});

describe("proxy language routing", () => {
  it("serves English marketing pages statically from the /en segment", () => {
    expect(routeLocale("/", "", undefined)).toEqual({ action: "rewrite", pathname: "/en" });
    expect(routeLocale("/pricing", "", "en")).toEqual({ action: "rewrite", pathname: "/en/pricing" });
  });

  it("serves Arabic marketing pages at /ar and remembers the choice", () => {
    expect(routeLocale("/ar/pricing", "", undefined)).toEqual({ action: "pass", setLocale: "ar" });
    expect(routeLocale("/ar", "", "ar")).toEqual({ action: "pass", setLocale: undefined });
  });

  it("sends Arabic readers from English marketing URLs to the Arabic ones", () => {
    expect(routeLocale("/pricing", "?plan=team", "ar")).toEqual({ action: "redirect", location: "/ar/pricing?plan=team", status: 307 });
    expect(routeLocale("/", "", "ar")).toEqual({ action: "redirect", location: "/ar", status: 307 });
  });

  it("drops /en permanently and keeps single-address pages unprefixed", () => {
    expect(routeLocale("/en/docs", "", "ar")).toEqual({ action: "redirect", location: "/docs", status: 308, setLocale: "en" });
    expect(routeLocale("/ar/dashboard", "?tab=1", "en")).toEqual({ action: "redirect", location: "/dashboard?tab=1", status: 307, setLocale: "ar" });
  });

  it("renders single-address pages in the cookie's language", () => {
    expect(routeLocale("/dashboard/forms", "", "ar")).toEqual({ action: "rewrite", pathname: "/ar/dashboard/forms" });
    expect(routeLocale("/learn/abc", "", undefined)).toEqual({ action: "rewrite", pathname: "/en/learn/abc" });
    expect(routeLocale("/creator/quiz", "", "nonsense")).toEqual({ action: "rewrite", pathname: "/en/creator/quiz" });
  });

  it("leaves route handlers outside the language segment", () => {
    for (const path of ["/api/health", "/mcp", "/.well-known/oauth-protected-resource", "/opengraph-image", "/robots.txt", "/sitemap.xml"]) {
      expect(routeLocale(path, "", "ar"), path).toEqual({ action: "pass" });
    }
  });
});

describe("marketing page metadata", () => {
  const copy = { en: { title: "Pricing", description: "Plans." }, ar: { title: "الأسعار", description: "الخطط." } };

  it("links both languages with hreflang and x-default", () => {
    expect(languageAlternates("/")).toEqual({ en: "/", ar: "/ar", "x-default": "/" });
    const en = sitePageMetadata("en", copy, "/pricing");
    expect(en.alternates).toEqual({ canonical: "/pricing", languages: { en: "/pricing", ar: "/ar/pricing", "x-default": "/pricing" } });
    expect(en.title).toBe("Pricing");
  });

  it("uses the Arabic copy and canonical on /ar pages", () => {
    const ar = sitePageMetadata("ar", copy, "/pricing", { absoluteTitle: true });
    expect(ar.title).toEqual({ absolute: "الأسعار" });
    expect(ar.alternates?.canonical).toBe("/ar/pricing");
    expect(ar.openGraph).toMatchObject({ url: "/ar/pricing", locale: "ar_EG", title: "الأسعار" });
  });
});

describe("proxy matcher", () => {
  it("runs the proxy for every page, including paths that contain file-like words or dotted usernames", async () => {
    const { readFileSync } = await import("node:fs");
    const { getPathMatch } = await import("next/dist/shared/lib/router/utils/path-match");
    const source = readFileSync("proxy.ts", "utf8");
    const matchers = [...source.matchAll(/^\s+"(\/[^"]*)",$/gm)].map((m) => getPathMatch(JSON.parse(`"${m[1]}"`) as string, { removeUnnamedParams: true, strict: true }));
    const runs = (path: string) => matchers.some((match) => match(path) !== false);
    for (const path of ["/", "/docs", "/en/docs", "/ar/docs/first-form", "/learn/abcpngx", "/learn/courses/kcss2", "/card/ahmed.js", "/john.doe/quiz", "/dashboard/forms/xdocs"]) expect(runs(path), path).toBe(true);
    for (const path of ["/icon.svg", "/_next/static/chunk.js", "/mcp", "/.well-known/oauth-protected-resource", "/0123456789abcdef.txt"]) expect(runs(path), path).toBe(false);
  });
});
