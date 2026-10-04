import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { topLevelRouteFolders } from "../routeFolders";
// Next's own compilers for next.config.ts header sources and proxy matchers.
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import * as pageStaticInfo from "next/dist/build/analysis/get-page-static-info";
import {
  APP_SEGMENTS, DENY_FRAMING, EMBED_HEIGHT_MESSAGE, EMBED_PROXY_MATCHER, NOT_EMBEDDABLE_SOURCE,
  decideFraming, embedSnippet, embedTarget, framingHeaders, normalizeEmbedOrigin, normalizeEmbedOrigins,
} from "@/lib/embed";
import type { EmbedPolicy } from "@/lib/embed";

// Exported at runtime but missing from Next's type declarations.
const { getMiddlewareMatchers } = pageStaticInfo as unknown as {
  getMiddlewareMatchers: (matchers: string[], nextConfig: object) => { regexp: string }[];
};

/**
 * A browser's frame-ancestors check for the header values this app sends:
 * 'none', *, 'self', scheme://host[:port] and scheme://*.host[:port].
 */
function frameAllowed(headers: Record<string, string>, ancestor: string, self = "https://chaos.fail"): boolean {
  const xfo = headers["X-Frame-Options"];
  const csp = headers["Content-Security-Policy"];
  const directive = csp?.split(";").map((d) => d.trim()).find((d) => d.startsWith("frame-ancestors"));
  if (!directive) return xfo === undefined;
  const sources = directive.split(/\s+/).slice(1);
  const a = new URL(ancestor);
  return sources.some((source) => {
    if (source === "'none'") return false;
    if (source === "*") return a.protocol === "https:" || a.protocol === "http:";
    if (source === "'self'") return a.origin === self;
    const m = /^(https?):\/\/(\*\.)?([^:/]+)(?::(\d+))?$/.exec(source);
    if (!m) return false;
    const [, scheme, wildcard, host, port] = m;
    if (a.protocol !== `${scheme}:`) return false;
    if ((a.port || "") !== (port ?? "")) return false;
    return wildcard ? a.hostname.endsWith(`.${host}`) : a.hostname === host;
  });
}

const allowed: EmbedPolicy = { origins: ["https://blog.example.com", "https://*.school.org"], anyOrigin: false };

describe("embed origins", () => {
  it("normalises what creators type into origins", () => {
    expect(normalizeEmbedOrigin("Example.COM")).toBe("https://example.com");
    expect(normalizeEmbedOrigin("https://example.com/blog/post?x=1#y")).toBe("https://example.com");
    expect(normalizeEmbedOrigin("https://example.com:8443/")).toBe("https://example.com:8443");
    expect(normalizeEmbedOrigin("https://*.example.com")).toBe("https://*.example.com");
    expect(normalizeEmbedOrigin("http://localhost:4000")).toBe("http://localhost:4000");
    expect(normalizeEmbedOrigin("https://bücher.de")).toBe("https://xn--bcher-kva.de");
  });

  it("rejects anything that is not a plain https origin", () => {
    for (const bad of [
      "http://example.com", "javascript:alert(1)", "data:text/html,x", "*", "https://*", "https://*.com", "'self'",
      "https://a.com 'unsafe-inline'", "https://a.com; script-src *", "https://user:pw@a.com", "ftp://a.com",
      "https://a.com,https://b.com", "localhost", "https://exa_mple.com", "https://*.*.a.com", "",
    ]) expect(normalizeEmbedOrigin(bad), bad).toBeNull();
  });

  it("dedupes and caps the list", () => {
    expect(normalizeEmbedOrigins(["a.com", "https://A.com/", " ", "b.org"])).toEqual({ origins: ["https://a.com", "https://b.org"] });
    expect(normalizeEmbedOrigins(["a.com", "not a site"])).toEqual({ invalid: "not a site" });
    expect(normalizeEmbedOrigins(Array.from({ length: 21 }, (_, i) => `s${i}.com`))).toEqual({ tooMany: true });
  });
});

describe("framing header decision", () => {
  const lookup = vi.fn(async (): Promise<EmbedPolicy> => allowed);

  it("denies creator, admin and other app routes without asking Convex", async () => {
    lookup.mockClear();
    for (const path of [
      "/", "/dashboard", "/dashboard/forms", "/dashboard/forms/abc", "/admin", "/admin/users", "/docs", "/docs/links-and-embed",
      "/api/integrations", "/api/x", "/mcp/x", "/sign-in", "/sign-in/factor-one", "/print/abc", "/pricing", "/privacy/x", "/chatgpt/x",
      "/Dashboard/x", "/DASHBOARD/forms", "/ADMIN/x", "/Docs/x", "/.well-known/x", "/_next/data",
      "/play", "/play/123456", "/Play/x", "/dashboard/live/abc",
    ]) {
      const headers = await decideFraming(path, "iframe", lookup);
      expect(headers, path).toMatchObject(DENY_FRAMING);
      expect(frameAllowed(headers, "https://blog.example.com"), path).toBe(false);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("denies look-alike form paths: trailing slash, extra segments, encoding, case of /f", async () => {
    lookup.mockClear();
    for (const path of ["/f/abc123/", "/f/abc123/x", "/f/", "/f", "/f/%61bc", "/F/abc123", "/f/abc.123", "/omar/apply/", "/omar/apply/x", "/omar/app%6Cy", "//apply", "/omar/ap.ply"]) {
      expect(await decideFraming(path, "iframe", lookup), path).toMatchObject(DENY_FRAMING);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("names the form for /f/<shareId> and custom links, lowercasing links like the page does", () => {
    expect(embedTarget("/f/abc123")).toEqual({ shareId: "abc123" });
    expect(embedTarget("/Omar.S/Team-Lunch")).toEqual({ username: "omar.s", slug: "team-lunch" });
    expect(embedTarget("/abc.js/apply")).toEqual({ username: "abc.js", slug: "apply" });
  });

  it("denies drafts and forms without embedding (Convex returns no policy)", async () => {
    const headers = await decideFraming("/f/draft1", "iframe", async () => null);
    expect(headers).toMatchObject(DENY_FRAMING);
    expect(frameAllowed(headers, "https://blog.example.com")).toBe(false);
    expect(await decideFraming("/omar/draft", "iframe", async () => null)).toMatchObject(DENY_FRAMING);
  });

  it("lets an allowed origin frame a published form and nobody else", async () => {
    for (const path of ["/f/abc123", "/omar/apply"]) {
      const headers = await decideFraming(path, "iframe", async () => allowed);
      expect(headers["X-Frame-Options"]).toBeUndefined();
      expect(headers["Content-Security-Policy"]).toBe("frame-ancestors 'self' https://blog.example.com https://*.school.org");
      expect(frameAllowed(headers, "https://blog.example.com")).toBe(true);
      expect(frameAllowed(headers, "https://www.school.org")).toBe(true);
      expect(frameAllowed(headers, "https://evil.example")).toBe(false);
      expect(frameAllowed(headers, "https://example.com")).toBe(false);
      expect(frameAllowed(headers, "http://blog.example.com")).toBe(false);
      expect(frameAllowed(headers, "https://blog.example.com.evil.example")).toBe(false);
      expect(frameAllowed(headers, "https://school.org.evil.example")).toBe(false);
    }
  });

  it("fails closed when Convex is down or slow", async () => {
    const headers = await decideFraming("/f/abc123", "iframe", async () => { throw new Error("offline"); });
    expect(headers).toMatchObject(DENY_FRAMING);
  });

  it("skips the lookup for top-level loads and fetches, which never need framing", async () => {
    lookup.mockClear();
    expect(await decideFraming("/f/abc123", "document", lookup)).toMatchObject(DENY_FRAMING);
    expect(await decideFraming("/f/abc123", "empty", lookup)).toMatchObject(DENY_FRAMING);
    expect(lookup).not.toHaveBeenCalled();
    // Browsers without Sec-Fetch-Dest still get the real answer.
    expect((await decideFraming("/f/abc123", null, lookup))["Content-Security-Policy"]).toContain("https://blog.example.com");
  });

  it("never writes a stored value into the header unless it is a clean origin", () => {
    const headers = framingHeaders({ origins: ["https://ok.com", "https://x.com; script-src *", "'unsafe-inline'", "*"], anyOrigin: false });
    expect(headers["Content-Security-Policy"]).toBe("frame-ancestors 'self' https://ok.com");
    expect(framingHeaders({ origins: ["nope"], anyOrigin: false })).toMatchObject(DENY_FRAMING);
    expect(framingHeaders({ origins: [], anyOrigin: true })["Content-Security-Policy"]).toBe("frame-ancestors *");
  });
});

describe("route coverage (next.config.ts and proxy.ts)", () => {
  // How Next compiles next.config.ts header sources (case-insensitive by default).
  const configDenies = getPathMatch(NOT_EMBEDDABLE_SOURCE, { strict: true, removeUnnamedParams: true, sensitive: false });
  // How Next compiles the proxy matcher entry for form candidates.
  const [candidateMatcher] = getMiddlewareMatchers([EMBED_PROXY_MATCHER], {});
  const proxyRuns = (path: string) => new RegExp(candidateMatcher.regexp).test(path);

  const paths = [
    "/", "/dashboard", "/dashboard/forms", "/dashboard/forms/abc", "/Dashboard/forms", "/DASHBOARD/x", "/admin", "/admin/x", "/Admin/x",
    "/docs/links-and-embed", "/api/x", "/api/integrations/v1", "/mcp/x", "/sign-in/x", "/print/abc", "/chatgpt/x", "/pricing/x",
    "/f/abc123", "/f/abc123/", "/f/abc123/x", "/F/abc123", "/omar/apply", "/Omar/Apply", "/omar/apply/", "/abc.js/apply", "/abc.css/apply",
    "/a.b/c", "/images/logo.png", "/_next/static/x.js", "/.well-known/x", "/f/%61bc", "/omar/app%6Cy", "/x/y/z",
  ];

  it("sends DENY from next.config.ts on every creator and app route", () => {
    for (const path of ["/", "/dashboard", "/dashboard/forms", "/dashboard/forms/abc", "/Dashboard/forms", "/admin", "/admin/x", "/Admin/x", "/docs/links-and-embed", "/api/x", "/mcp/x", "/sign-in/x", "/print/abc", "/chatgpt/x", "/f/abc123/", "/f/abc123/x", "/x/y/z", "/images/logo.png", "/play", "/play/123456", "/dashboard/live/abc"]) {
      expect(configDenies(path), path).toBeTruthy();
    }
  });

  it("leaves only form candidates to the proxy, and the proxy runs on every one of them", () => {
    for (const path of paths) {
      if (!configDenies(path)) expect(proxyRuns(path), `${path} escapes next.config.ts DENY but the proxy would not run`).toBe(true);
    }
    expect(configDenies("/f/abc123")).toBe(false);
    expect(configDenies("/omar/apply")).toBe(false);
    // Looks like a file, so the proxy's first matcher skips it; the candidate matcher must catch it.
    expect(configDenies("/abc.js/apply")).toBe(false);
    expect(proxyRuns("/abc.js/apply")).toBe(true);
  });

  it("keeps proxy.ts's matcher in sync with lib/embed.ts", () => {
    const source = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    expect(source).toContain(JSON.stringify(EMBED_PROXY_MATCHER));
  });

  it("reserves every top-level app folder except the form routes", () => {
    const names = topLevelRouteFolders().filter((n) => n !== "f" && !n.startsWith("["));
    for (const name of names) expect(APP_SEGMENTS, name).toContain(name);
  });
});

describe("embed snippet", () => {
  it("is an iframe plus an inline resize script that trusts only the app origin", () => {
    const snippet = embedSnippet({ src: "https://chaos.fail/f/abc?embed=1", title: 'Team "lunch"', appOrigin: "https://chaos.fail", autoResize: true });
    expect(snippet).toContain('<iframe src="https://chaos.fail/f/abc?embed=1" title="Team &quot;lunch&quot;"');
    expect(snippet).toContain('e.origin!=="https://chaos.fail"');
    expect(snippet).toContain(EMBED_HEIGHT_MESSAGE);
    expect(snippet).not.toMatch(/<script[^>]+src=/);
    expect(embedSnippet({ src: "https://chaos.fail/f/abc?embed=1", title: "x", appOrigin: "https://chaos.fail", autoResize: false })).not.toContain("<script");
  });
});
