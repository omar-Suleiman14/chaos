import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("installation authentication configuration", () => {
  it.each([undefined, "", "   "])("requires an explicit issuer (%s)", async (issuer) => {
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", issuer);
    vi.resetModules();
    await expect(import("../../convex/auth.config")).rejects.toThrow("CLERK_JWT_ISSUER_DOMAIN is required");
  });

  it.each(["http://auth.example.com", "https://user:pass@auth.example.com", "https://auth.example.com?issuer=other", "https://auth.example.com#other"])("refuses an invalid issuer (%s)", async (issuer) => {
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", issuer);
    vi.resetModules();
    await expect(import("../../convex/auth.config")).rejects.toThrow("must be an HTTPS issuer URL");
  });

  it("trusts only the configured installation issuer and convex audience", async () => {
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", " https://self-host.clerk.accounts.dev ");
    vi.resetModules();
    const { default: config } = await import("../../convex/auth.config");
    expect(config.providers).toEqual([{ domain: "https://self-host.clerk.accounts.dev", applicationID: "convex" }]);
  });
});
