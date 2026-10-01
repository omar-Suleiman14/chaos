import { afterEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { docSlugs } from "@/lib/docs";
import { formMetadata, pageMetadata, serializeStructuredData, websiteStructuredData } from "@/lib/seo";
import { siteOrigin, siteUrl } from "@/lib/site";

const fetch = vi.hoisted(() => vi.fn());
vi.mock("convex/nextjs", () => ({ fetchQuery: fetch }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
  createRouteMatcher: () => () => false,
}));
vi.mock("next/server", () => ({ NextResponse: { next: () => ({ headers: new Headers() }) } }));
afterEach(() => { fetch.mockReset(); vi.unstubAllEnvs(); });

describe("public search metadata", () => {
  it("uses the configured origin in structured data and lists every docs page once", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain(`${siteUrl}/`);
    for (const slug of docSlugs) expect(urls).toContain(`${siteUrl}/docs/${slug}`);
    for (const url of urls) {
      const parsed = new URL(url);
      expect(parsed.origin).toBe(siteUrl);
      expect(parsed.search).toBe("");
      expect(parsed.pathname).not.toMatch(/^\/(dashboard|admin|api|mcp|print|play|f)(\/|$)/);
    }
    expect(websiteStructuredData.url).toBe(siteUrl);
  });

  it("accepts deployment origins and rejects misleading canonical configuration", () => {
    expect(siteOrigin(" https://forms.example.com/ ")).toBe("https://forms.example.com");
    expect(siteOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    for (const invalid of ["https://example.com/app", "https://user:pass@example.com", "https://example.com?x=1", "https://example.com#x", "javascript:alert(1)"]) {
      expect(() => siteOrigin(invalid)).toThrow();
    }
  });

  it("does not advertise the hosted product from a self-hosted instance", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://forms.example.com/");
    vi.resetModules();
    const [{ websiteStructuredData: data }, { default: ownSitemap }, { default: ownRobots }] = await Promise.all([
      import("@/lib/seo"), import("@/app/sitemap"), import("@/app/robots"),
    ]);
    expect(data.url).toBe("https://forms.example.com");
    expect((await ownSitemap()).every((entry) => new URL(entry.url).origin === "https://forms.example.com")).toBe(true);
    expect(ownRobots().sitemap).toBe("https://forms.example.com/sitemap.xml");
  });

  it("keeps canonical, Open Graph and Twitter descriptions specific to each page", () => {
    const metadata = pageMetadata("Documentation", "Read the guides.", "/docs");
    expect(metadata.alternates).toEqual({ canonical: "/docs" });
    expect(metadata.openGraph).toMatchObject({ title: "Documentation", description: "Read the guides.", url: "/docs" });
    expect(metadata.twitter).toMatchObject({ title: "Documentation", description: "Read the guides." });
    const serialized = serializeStructuredData({ name: "</script><script>alert(1)</script>" });
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized).name).toContain("</script>");
  });

  it("only indexes an open form with explicit creator consent", () => {
    expect(formMetadata({ state: "open", title: "Survey", allowIndexing: true, definition: { description: "Tell us about lunch." } }, "share")).toMatchObject({
      title: "Survey", description: "Tell us about lunch.", alternates: { canonical: "/f/share" }, robots: { index: true, follow: false },
    });
    for (const state of ["open", "code", "sign_in", "closed", "not_open", "full", "unavailable"]) {
      expect(formMetadata({ state, allowIndexing: state !== "open" }, "share").robots).toEqual({ index: false, follow: false });
    }
  });

  it("canonicalizes custom form links to the shared form and keeps classic or failed links noindex", async () => {
    const { generateMetadata } = await import("@/app/[username]/[quizname]/layout");
    fetch.mockImplementation(async (ref) => getFunctionName(ref) === "links:resolveLink"
      ? { shareId: "shared-form" }
      : { state: "open", title: "Survey", allowIndexing: true });
    const params = Promise.resolve({ username: "creator", quizname: "survey" });
    expect(await generateMetadata({ params })).toMatchObject({ alternates: { canonical: "/f/shared-form" }, robots: { index: true } });
    fetch.mockResolvedValue(null);
    expect(await generateMetadata({ params })).toMatchObject({ robots: { index: false, follow: false } });
    fetch.mockRejectedValue(new Error("offline"));
    expect(await generateMetadata({ params })).toMatchObject({ robots: { index: false, follow: false } });
  });

  it("keeps failed shared-form metadata noindex", async () => {
    const { generateMetadata } = await import("@/app/f/[shareId]/layout");
    fetch.mockRejectedValue(new Error("offline"));
    expect(await generateMetadata({ params: Promise.resolve({ shareId: "share" }) })).toMatchObject({ title: "Form unavailable", robots: { index: false } });
  });

  it("lets crawlers read form noindex tags while excluding internal route segments", () => {
    const policy = robots();
    expect(policy.sitemap).toBe(`${siteUrl}/sitemap.xml`);
    const rules = policy.rules as { disallow: string[] };
    const blocked = (path: string) => rules.disallow.some((rule) => new RegExp(`^${rule.replace(/[.*+?^{}()|[\]\\]/g, "\\$&")}`).test(path));
    for (const path of ["/dashboard", "/dashboard?id=1", "/dashboard/forms/id", "/admin", "/mcp", "/print/id", "/api/health"]) expect(blocked(path), path).toBe(true);
    for (const path of ["/", "/docs/forms", "/f/share", "/administrator/survey"]) expect(blocked(path), path).toBe(false);
  });

  it("marks response-capability and embed URLs noindex without changing normal links", async () => {
    const { default: proxy } = await import("@/proxy");
    const invoke = proxy as unknown as (auth: object, request: object) => Promise<{ headers: Headers }>;
    for (const query of ["edit=private", "resume=private", "embed=1", "lang=ar", ""]) {
      const result = await invoke({}, { nextUrl: new URL(`https://example.com/f/share?${query}`), headers: new Headers({ "sec-fetch-dest": "document" }) });
      expect(result.headers.get("X-Robots-Tag")).toBe(query && query !== "lang=ar" ? "noindex, nofollow" : null);
    }
  });
});
