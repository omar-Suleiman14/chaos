// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

const mocks = vi.hoisted(() => ({ keys: undefined as unknown, clerkMetadata: vi.fn(() => ({ resource: "clerk-resource" })) }));
vi.mock("jose", async (original) => ({ ...await original<typeof import("jose")>(), createRemoteJWKSet: vi.fn(() => mocks.keys) }));
vi.mock("@clerk/mcp-tools/server", () => ({ generateClerkProtectedResourceMetadata: mocks.clerkMetadata }));
// OAuth verification is independent of server/tool registration.
vi.mock("@/lib/mcp/server", () => ({ MCP_SCOPES: ["profile", "email"], MCP_REQUESTED_SCOPES: ["profile", "email"] }));

const issuer = "https://chaos.example";
let key: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  key = pair.privateKey;
  mocks.keys = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: "test" }] });
});
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "betterauth");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", issuer);
  vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", issuer);
  vi.stubEnv("CHAOS_MCP_CLIENT_IDS", "chat-client");
  vi.stubEnv("AUTH_ALLOW_HTTP", "false");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ issuer, jwks_uri: `${issuer}/api/auth/jwks` })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

async function token(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ sub: "same-person", iss: issuer, aud: `${issuer}/mcp`, exp: Math.floor(Date.now() / 1000) + 300, iat: Math.floor(Date.now() / 1000), scope: "profile email", azp: "chat-client", name: "Creator", email: "creator@example.com", email_verified: true, ...overrides }).setProtectedHeader({ alg: "RS256", kid: "test" }).sign(key);
}

describe("self-hosted MCP OAuth", () => {
  it("verifies the resource audience and derives an issuer-scoped actor from verified claims", async () => {
    const { verifyBetterAuthMcpToken } = await import("@/lib/mcp/oauth");
    const user = await verifyBetterAuthMcpToken(await token());
    expect(user).toEqual({ userId: `oidc_${createHash("sha256").update(`${issuer}|same-person`).digest("hex")}`, clientId: "chat-client", profile: { name: "Creator", email: "creator@example.com", emailVerified: true } });
    expect(fetch).toHaveBeenCalledWith(`${issuer}/.well-known/oauth-authorization-server`, expect.objectContaining({ redirect: "error" }));
    expect(mocks.clerkMetadata).not.toHaveBeenCalled();
  });

  it.each([
    ["another issuer", { iss: "https://attacker.example" }],
    ["the web login audience", { aud: "convex" }],
    ["multiple audiences", { aud: [`${issuer}/mcp`, `${issuer}/other`] }],
    ["an expired token", { exp: 1 }],
    ["an unapproved client", { azp: "another-client" }],
    ["an ID token", { scope: undefined }],
    ["an absent subject", { sub: undefined }],
  ])("rejects %s", async (_label, overrides) => {
    const { verifyBetterAuthMcpToken } = await import("@/lib/mcp/oauth");
    await expect(verifyBetterAuthMcpToken(await token(overrides))).rejects.toThrow();
  });

  it("requires explicit audience and client configuration", async () => {
    vi.stubEnv("CHAOS_MCP_CLIENT_IDS", "");
    const { verifyBetterAuthMcpToken } = await import("@/lib/mcp/oauth");
    await expect(verifyBetterAuthMcpToken(await token())).rejects.toThrow("allow-list");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects altered signatures and symmetric algorithms", async () => {
    const { verifyBetterAuthMcpToken } = await import("@/lib/mcp/oauth");
    const valid = await token();
    const parts = valid.split(".");
    parts[2] = `${parts[2][0] === "a" ? "b" : "a"}${parts[2].slice(1)}`;
    await expect(verifyBetterAuthMcpToken(parts.join("."))).rejects.toThrow();
    const symmetric = await new SignJWT({ sub: "same-person", iss: issuer, aud: `${issuer}/mcp`, scope: "profile email", azp: "chat-client" }).setIssuedAt().setExpirationTime("5m").setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("test-only-not-a-signing-credential"));
    await expect(verifyBetterAuthMcpToken(symmetric)).rejects.toThrow();
  });

  it("does not forward unverified email or unsafe picture claims", async () => {
    const { verifyBetterAuthMcpToken } = await import("@/lib/mcp/oauth");
    expect((await verifyBetterAuthMcpToken(await token({ email_verified: false, picture: "javascript:bad" }))).profile).toEqual({ name: "Creator", email: "", emailVerified: false });
  });

  it("rejects mismatched discovery metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ issuer: "https://other.example", jwks_uri: "https://other.example/keys" })));
    const { verifyBetterAuthMcpToken } = await import("@/lib/mcp/oauth");
    await expect(verifyBetterAuthMcpToken(await token())).rejects.toThrow("issuer does not match");
  });

  it("publishes the configured OIDC authority without Clerk configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    const { protectedResourceResponse } = await import("@/lib/mcp/oauth");
    const response = await protectedResourceResponse(new Request("https://chaos.example/.well-known/oauth-protected-resource/mcp"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ resource: "https://chaos.example/mcp", authorization_servers: [issuer], bearer_methods_supported: ["header"] });
    expect(mocks.clerkMetadata).not.toHaveBeenCalled();
  });

  it("preserves Clerk metadata in the existing default mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "clerk");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    const { protectedResourceResponse } = await import("@/lib/mcp/oauth");
    expect((await protectedResourceResponse(new Request("https://chaos.example/mcp"))).status).toBe(200);
    expect(mocks.clerkMetadata).toHaveBeenCalledOnce();
  });

  it("only permits explicitly enabled HTTP loopback trials", async () => {
    const { betterAuthIssuer } = await import("@/lib/mcp/oauth");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:8080/realms/chaos");
    expect(() => betterAuthIssuer()).toThrow();
    vi.stubEnv("AUTH_ALLOW_HTTP", "true");
    expect(betterAuthIssuer()).toBe("http://localhost:8080/realms/chaos");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://identity.example/realms/chaos");
    expect(() => betterAuthIssuer()).toThrow();
  });
});
