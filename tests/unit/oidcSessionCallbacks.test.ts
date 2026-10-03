import { afterEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ config: undefined as (() => { callbacks: { session: (input: unknown) => unknown; redirect: (input: { url: string; baseUrl: string }) => string } }) | undefined }));
vi.mock("next-auth", () => ({ default: (config: typeof captured.config) => { captured.config = config; return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }; } }));
vi.mock("next-auth/providers/keycloak", () => ({ default: (value: unknown) => value }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("OIDC browser session boundary", () => {
  it("exposes access token but never refresh token or client secret", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "oidc");
    vi.stubEnv("AUTH_OIDC_ISSUER", "https://auth.example.test/realms/chaos");
    vi.stubEnv("AUTH_OIDC_CLIENT_ID", "chaos");
    vi.stubEnv("AUTH_OIDC_CLIENT_SECRET", "private-client-secret");
    vi.stubEnv("AUTH_SECRET", "private-session-secret");
    await import("../../lib/auth/server");
    const config = captured.config!();
    const session = config.callbacks.session({ session: { user: { name: "Creator" } }, token: { actorId: "canonical_actor", accessToken: "public-access", refreshToken: "private-refresh" } });
    expect(session).toMatchObject({ user: { id: "canonical_actor" }, accessToken: "public-access" });
    expect(JSON.stringify(session)).not.toContain("private-");
    expect(config.callbacks.session({ session: { user: {} }, token: { actorId: "canonical_actor", accessToken: "expired", authError: "RefreshAccessTokenError" } })).toMatchObject({ accessToken: undefined, authError: "RefreshAccessTokenError" });
    expect(config.callbacks.redirect({ url: "https://attacker.test", baseUrl: "https://app.example.test" })).toBe("https://app.example.test");
  });
});
