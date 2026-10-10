import { describe, expect, it } from "vitest";
import { validUrl } from "../../convex/webhookUrlPolicy";

describe("webhook URL policy", () => {
  it("returns the normalized public HTTPS URL", () => {
    expect(validUrl("https://example.com/hooks/chaos")).toBe("https://example.com/hooks/chaos");
  });

  it("preserves the existing HTTPS and embedded-credential errors", () => {
    expect(() => validUrl("http://example.com/hook")).toThrow("INVALID_URL: Use an https:// address.");
    expect(() => validUrl("https://user:pass@example.com/hook")).toThrow("INVALID_URL: Remove the user name or password from the address.");
  });

  it("rejects obvious private destination URLs", () => {
    expect(() => validUrl("https://127.0.0.1/hook")).toThrow();
  });
});
