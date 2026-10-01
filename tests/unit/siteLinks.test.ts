import { afterEach, describe, expect, it, vi } from "vitest";
import sitemap from "@/app/sitemap";
import { optionalHttpsOrigin, optionalHttpsUrl, shortHostRedirect, shortShareUrl, siteUrl } from "@/lib/site";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("short share links", () => {
  it("accepts only a bare https origin", () => {
    expect(optionalHttpsOrigin(" https://chs.example/ ")).toBe("https://chs.example");
    expect(optionalHttpsOrigin("https://chs.example:8443")).toBe("https://chs.example:8443");
    for (const invalid of [
      undefined, "", "   ", "chs.example", "http://chs.example", "https://chs.example/f", "https://chs.example/?x=1",
      "https://chs.example/#x", "https://user:pass@chs.example", "javascript:alert(1)", "ftp://chs.example", "https://",
    ]) {
      expect(optionalHttpsOrigin(invalid), String(invalid)).toBeNull();
    }
  });

  it("builds a short link on the configured origin and nowhere else", () => {
    expect(shortShareUrl("/f/abc123", "https://chs.example")).toBe("https://chs.example/f/abc123");
    expect(shortShareUrl("/name/team-lunch?lang=ar", "https://chs.example")).toBe("https://chs.example/name/team-lunch?lang=ar");
    for (const path of ["f/abc", "//evil.example/f/abc", "/\\evil.example", "https://evil.example/f/abc", "/f/a b"]) {
      expect(shortShareUrl(path, "https://chs.example"), path).toBeNull();
    }
  });

  it("returns null when no short origin is configured, so callers keep the usual link", () => {
    expect(shortShareUrl("/f/abc123", null)).toBeNull();
  });

  it("reads NEXT_PUBLIC_SHORT_SHARE_ORIGIN and ignores invalid values", async () => {
    vi.stubEnv("NEXT_PUBLIC_SHORT_SHARE_ORIGIN", "https://chs.example");
    expect((await import("@/lib/site")).shortShareUrl("/f/abc")).toBe("https://chs.example/f/abc");
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SHORT_SHARE_ORIGIN", "https://chs.example/path");
    expect((await import("@/lib/site")).shortShareUrl("/f/abc")).toBeNull();
  });
});

describe("status page link", () => {
  it("accepts https URLs with a path and rejects everything else", () => {
    expect(optionalHttpsUrl("https://status.example.com/chaos")).toBe("https://status.example.com/chaos");
    for (const invalid of [undefined, "", "http://status.example.com", "javascript:alert(1)", "https://u:p@status.example.com", "not a url"]) {
      expect(optionalHttpsUrl(invalid), String(invalid)).toBeNull();
    }
  });

  it("is hidden when NEXT_PUBLIC_STATUS_PAGE_URL is unset or invalid", async () => {
    vi.stubEnv("NEXT_PUBLIC_STATUS_PAGE_URL", "");
    expect((await import("@/lib/site")).statusPageUrl).toBeNull();
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_STATUS_PAGE_URL", "http://status.example.com");
    expect((await import("@/lib/site")).statusPageUrl).toBeNull();
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_STATUS_PAGE_URL", "https://status.example.com");
    expect((await import("@/lib/site")).statusPageUrl).toBe("https://status.example.com/");
  });
});

describe("public pages", () => {
  it("lists the comparison and support pages in the sitemap", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain(`${siteUrl}/compare`);
    expect(urls).toContain(`${siteUrl}/support`);
  });
});

describe("comparison table", () => {
  it("has a full row per feature in both languages and a dated note", async () => {
    const { compareAsOf, compareCopy, landingRows } = await import("@/components/site/compareData");
    for (const locale of ["en", "ar"] as const) {
      const { cols, rows } = compareCopy[locale];
      expect(rows.length).toBe(compareCopy.en.rows.length);
      expect(landingRows).toBeLessThanOrEqual(rows.length);
      for (const row of rows) expect(row.length, row[0]).toBe(cols.length + 1);
    }
    expect(compareAsOf.iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("short host redirect", () => {
  const site = "https://chaos.example";
  it("sends the short host to the same path and query on the site", () => {
    expect(shortHostRedirect("https://chs.example/f/abc?lang=ar", "https://chs.example", site)).toBe("https://chaos.example/f/abc?lang=ar");
    expect(shortHostRedirect("https://chs.example/", "https://chs.example", site)).toBe("https://chaos.example/");
  });
  it("leaves other hosts, an unset origin and a same-origin setting alone", () => {
    expect(shortHostRedirect("https://chaos.example/f/abc", "https://chs.example", site)).toBeNull();
    expect(shortHostRedirect("https://chs.example/f/abc", null, site)).toBeNull();
    expect(shortHostRedirect("https://chaos.example/f/abc", site, site)).toBeNull();
  });
});
