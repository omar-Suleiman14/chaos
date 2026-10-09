import { describe, expect, it } from "vitest";
import { absoluteUrl, canonicalUrl, hostHref, hostRedirect, hostSection, pathSection, sharedCookieDomain } from "@/lib/hosts";

const main = "https://chaos.fail";
const split = { dashboard: "https://app.chaos.fail", learn: "https://learn.chaos.fail", docs: "https://docs.chaos.fail", play: "https://play.chaos.fail" };
const single = { dashboard: null, learn: null, docs: null, play: null };

describe("pathSection", () => {
  it("files each path under its section", () => {
    expect(pathSection("/dashboard/forms")).toBe("dashboard");
    expect(pathSection("/admin")).toBe("dashboard");
    expect(pathSection("/print/abc")).toBe("dashboard");
    expect(pathSection("/learn")).toBe("learn");
    expect(pathSection("/learn/courses/abc")).toBe("learn");
    expect(pathSection("/ar/learn")).toBe("learn");
    expect(pathSection("/docs/first-form")).toBe("docs");
    expect(pathSection("/ar/docs")).toBe("docs");
    expect(pathSection("/play")).toBe("play");
    expect(pathSection("/ar/play")).toBe("play");
    expect(pathSection("/player")).toBe("main");
    expect(pathSection("/")).toBe("main");
    expect(pathSection("/pricing")).toBe("main");
    expect(pathSection("/f/abc")).toBe("main");
    expect(pathSection("/learner/quiz")).toBe("main");
  });

  it("leaves sign-in, OAuth consent and route handlers on every host", () => {
    for (const path of ["/sign-in", "/sign-up/verify", "/auth/consent", "/api/health", "/mcp", "/.well-known/oauth-authorization-server", "/robots.txt", "/sitemap.xml"]) {
      expect(pathSection(path)).toBeNull();
    }
  });
});

describe("hostRedirect", () => {
  it("moves a path to its own host, keeping the query", () => {
    expect(hostRedirect("https://chaos.fail/dashboard/forms?tab=1", split, main)).toBe("https://app.chaos.fail/dashboard/forms?tab=1");
    expect(hostRedirect("https://chaos.fail/ar/docs/first-form", split, main)).toBe("https://docs.chaos.fail/ar/docs/first-form");
    expect(hostRedirect("https://app.chaos.fail/learn/abc", split, main)).toBe("https://learn.chaos.fail/learn/abc");
    expect(hostRedirect("https://learn.chaos.fail/pricing", split, main)).toBe("https://chaos.fail/pricing");
    expect(hostRedirect("https://chaos.fail/play?pin=123456", split, main)).toBe("https://play.chaos.fail/play?pin=123456");
  });

  it("opens a section's home page on a bare subdomain", () => {
    expect(hostRedirect("https://app.chaos.fail/", split, main)).toBe("https://app.chaos.fail/dashboard");
    expect(hostRedirect("https://learn.chaos.fail/", split, main)).toBe("https://learn.chaos.fail/learn");
    expect(hostRedirect("https://docs.chaos.fail/?q=forms", split, main)).toBe("https://docs.chaos.fail/docs?q=forms");
    expect(hostRedirect("https://play.chaos.fail/?pin=123456", split, main)).toBe("https://play.chaos.fail/play?pin=123456");
  });

  it("serves paths already on their host, shared paths, and unknown hosts", () => {
    expect(hostRedirect("https://app.chaos.fail/dashboard", split, main)).toBeNull();
    expect(hostRedirect("https://chaos.fail/", split, main)).toBeNull();
    expect(hostRedirect("https://learn.chaos.fail/sign-in", split, main)).toBeNull();
    expect(hostRedirect("https://chaos-git-e2e.vercel.app/dashboard", split, main)).toBeNull();
  });

  it("does nothing while every section shares the main host", () => {
    expect(hostRedirect("https://chaos.fail/dashboard", single, main)).toBeNull();
    expect(hostRedirect("http://localhost:3000/learn", single, "http://localhost:3000")).toBeNull();
  });

  it("keeps a section without its own host on the main one", () => {
    const partial = { ...single, docs: "https://docs.chaos.fail" };
    expect(hostRedirect("https://chaos.fail/dashboard", partial, main)).toBeNull();
    expect(hostRedirect("https://docs.chaos.fail/dashboard", partial, main)).toBe("https://chaos.fail/dashboard");
  });
});

describe("links", () => {
  it("points root-relative links at their host once hosts are split", () => {
    expect(hostHref("/learn/abc#intro", split, main)).toBe("https://learn.chaos.fail/learn/abc#intro");
    expect(hostHref("/dashboard", split, main)).toBe("https://app.chaos.fail/dashboard");
    expect(hostHref("/pricing", split, main)).toBe("https://chaos.fail/pricing");
    expect(hostHref("/sign-in", split, main)).toBe("/sign-in");
    expect(hostHref("https://example.com/learn", split, main)).toBe("https://example.com/learn");
    expect(hostHref("/learn/abc", single, main)).toBe("/learn/abc");
  });

  it("builds canonical URLs on the section host", () => {
    expect(absoluteUrl("/docs/first-form", split, main)).toBe("https://docs.chaos.fail/docs/first-form");
    expect(absoluteUrl("/pricing", split, main)).toBe("https://chaos.fail/pricing");
    expect(absoluteUrl("/learn/abc", single, main)).toBe("https://chaos.fail/learn/abc");
    expect(absoluteUrl("https://docs.chaos.fail/docs", split, main)).toBe("https://docs.chaos.fail/docs");
    expect(canonicalUrl("/docs", single, main)).toBe("/docs");
    expect(canonicalUrl("/docs", split, main)).toBe("https://docs.chaos.fail/docs");
  });

  it("recognises hosts and the shared cookie domain", () => {
    expect(hostSection("app.chaos.fail", split, main)).toBe("dashboard");
    expect(hostSection("chaos.fail", split, main)).toBe("main");
    expect(hostSection("localhost:3000", split, main)).toBeNull();
    expect(sharedCookieDomain(split, main)).toBe("chaos.fail");
    expect(sharedCookieDomain(single, main)).toBeNull();
    expect(sharedCookieDomain({ ...single, learn: "https://learn.example.org" }, main)).toBeNull();
  });
});
