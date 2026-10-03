// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ clerk: vi.fn(() => Response.json({ issuer: "https://clerk.example" })) }));
vi.mock("@clerk/mcp-tools/next", () => ({ authServerMetadataHandlerClerk: () => mocks.clerk }));
vi.mock("@/lib/mcp/server", () => ({ MCP_SCOPES: ["openid", "profile", "email"] }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

const issuer = "https://identity.example/realms/chaos";

describe("OAuth authorization metadata provider selection", () => {
  it("mirrors verified OIDC discovery and serves CORS without calling Clerk", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "oidc");
    vi.stubEnv("AUTH_OIDC_ISSUER", issuer);
    const metadata = { issuer, authorization_endpoint: `${issuer}/protocol/openid-connect/auth`, token_endpoint: `${issuer}/protocol/openid-connect/token`, jwks_uri: `${issuer}/protocol/openid-connect/certs` };
    const fetcher = vi.fn(async () => Response.json(metadata));
    vi.stubGlobal("fetch", fetcher);
    const { GET, OPTIONS } = await import("@/app/.well-known/oauth-authorization-server/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(metadata);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(fetcher).toHaveBeenCalledWith(`${issuer}/.well-known/openid-configuration`, expect.objectContaining({ redirect: "error" }));
    expect(OPTIONS().status).toBe(204);
    expect(mocks.clerk).not.toHaveBeenCalled();
  });

  it.each(["mismatched", "unavailable", "invalid", "unconfigured", "incomplete", "insecure"])("fails closed for %s discovery", async (failure) => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "oidc");
    vi.stubEnv("AUTH_OIDC_ISSUER", failure === "unconfigured" ? "" : issuer);
    vi.stubGlobal("fetch", vi.fn(async () => failure === "unavailable" ? new Response(null, { status: 503 }) : Response.json(failure === "invalid" ? [] : failure === "incomplete" ? { issuer } : failure === "insecure" ? { issuer, authorization_endpoint: "http://identity.example/auth", token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/keys` } : { issuer: "https://another.example" })));
    const { GET } = await import("@/app/.well-known/oauth-authorization-server/route");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.clerk).not.toHaveBeenCalled();
  });

  it("preserves Clerk metadata in the default provider mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "clerk");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { GET } = await import("@/app/.well-known/oauth-authorization-server/route");
    const response = await GET();
    expect(await response.json()).toEqual({ issuer: "https://clerk.example" });
    expect(mocks.clerk).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
