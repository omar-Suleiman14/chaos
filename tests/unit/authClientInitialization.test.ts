import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(() => ({ configured: true })), convex: vi.fn(), oauth: vi.fn() }));
vi.mock("better-auth/react", () => ({ createAuthClient: mocks.create }));
vi.mock("@convex-dev/better-auth/client/plugins", () => ({ convexClient: mocks.convex }));
vi.mock("@better-auth/oauth-provider/client", () => ({ oauthProviderClient: mocks.oauth }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });
describe("selected authentication client", () => {
  it("does not initialize Better Auth on Clerk deployments", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "clerk");
    const { authClient } = await import("@/lib/auth/better-client");
    expect(authClient).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.convex).not.toHaveBeenCalled();
    expect(mocks.oauth).not.toHaveBeenCalled();
  });
  it("initializes both plugins on Better Auth deployments", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "betterauth");
    const { authClient } = await import("@/lib/auth/better-client");
    expect(authClient).toEqual({ configured: true });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.convex).toHaveBeenCalledOnce();
    expect(mocks.oauth).toHaveBeenCalledOnce();
  });
});
