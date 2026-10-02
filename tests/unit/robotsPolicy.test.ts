import { afterEach, expect, it, vi } from "vitest";
import robots from "../../app/robots";

afterEach(() => vi.unstubAllEnvs());
it("excludes Vercel development and preview deployments from crawling", () => {
  for (const environment of ["preview", "development"]) {
    vi.stubEnv("VERCEL_ENV", environment);
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  }
});
it("allows public production pages and excludes exact private route segments", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  const result = robots();
  expect(result.sitemap).toContain("/sitemap.xml");
  expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" });
  expect(result.rules).toMatchObject({ disallow: expect.arrayContaining(["/dashboard/", "/api/", "/print/"]) });
});
