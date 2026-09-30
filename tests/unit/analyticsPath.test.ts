import { describe, expect, it } from "vitest";
import { cleanAnalyticsPath } from "@/lib/analyticsPath";

describe("cleanAnalyticsPath", () => {
  it.each([
    ["https://chaos.fail/", "/"],
    ["https://chaos.fail/pricing?ref=x#top", "/pricing"],
    ["https://chaos.fail/f/abc123?token=secret", "/f/:id"],
    ["https://chaos.fail/f/abcdef", "/f/:id"],
    ["https://chaos.fail/omar/team-lunch", "/:username/:slug"],
    ["https://chaos.fail/omar", "/:id"],
    ["https://chaos.fail/dashboard/forms/jd7abc/responses", "/dashboard/forms/:id/responses"],
    ["https://chaos.fail/dashboard/forms/jd7abc", "/dashboard/forms/:id"],
    ["https://chaos.fail/dashboard/settings", "/dashboard/settings"],
    ["https://chaos.fail/docs/first-quiz", "/docs/first-quiz"],
    ["https://chaos.fail/print/q1", "/print/:id"],
    ["/f/xyz", "/f/:id"],
  ])("%s → %s", (raw, clean) => {
    expect(cleanAnalyticsPath(raw)).toBe(clean);
  });
  it("never returns a query string, token or username", () => {
    for (const raw of ["https://chaos.fail/f/a?resume=tok", "https://chaos.fail/someone/secret-form?x=1"]) {
      const clean = cleanAnalyticsPath(raw)!;
      expect(clean).not.toMatch(/tok|someone|secret|\?/);
    }
  });
  it("drops what it cannot read", () => {
    expect(cleanAnalyticsPath(undefined)).toBeUndefined();
    expect(cleanAnalyticsPath(42)).toBeUndefined();
  });
});
