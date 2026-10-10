// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ clerk: vi.fn(), verify: vi.fn(), backend: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: mocks.clerk }));
vi.mock("@/lib/mcp/oauth", () => ({ verifyBetterAuthMcpToken: mocks.verify, resourceUrl: () => "https://chaos.example/mcp", resourceMetadataUrl: () => "https://chaos.example/.well-known/oauth-protected-resource/mcp" }));
vi.mock("@/lib/mcp/server", () => ({
  McpToolError: class extends Error {},
  createChaosMcpServer: () => ({ connect: async () => {}, close: async () => {} }),
}));
vi.mock("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js", () => ({ WebStandardStreamableHTTPServerTransport: class { async handleRequest() { return Response.json({ accepted: true }); } } }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "betterauth");
  vi.stubEnv("CHAOS_MCP_SECRET", "test-only-backend-secret-32-characters");
  vi.stubEnv("CONVEX_SITE_URL", "https://backend.example");
  mocks.verify.mockResolvedValue({ userId: `oidc_${"a".repeat(64)}`, clientId: "chat-client", profile: { name: "Verified Creator", email: "" } });
  mocks.backend.mockResolvedValue(Response.json({ result: { admin: false } }));
  vi.stubGlobal("fetch", mocks.backend);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

describe("MCP auth provider routing", () => {
  it("forwards only verified OIDC identity/profile and performs no Clerk lookup", async () => {
    const { POST } = await import("@/app/mcp/route");
    const response = await POST(new Request("https://chaos.example/mcp", { method: "POST", headers: { Authorization: "Bearer signed-token" }, body: JSON.stringify({ userId: "user_attacker", profile: { email: "attacker@example.com" } }) }));
    expect(response.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith("signed-token");
    const body = JSON.parse(mocks.backend.mock.calls[0][1].body);
    expect(body).toMatchObject({ userId: `oidc_${"a".repeat(64)}`, profile: { name: "Verified Creator", email: "" }, tool: "get_documentation_capabilities" });
    expect(mocks.clerk).not.toHaveBeenCalled();
  });

  it("rejects invalid OAuth tokens before dispatching a backend operation", async () => {
    mocks.verify.mockRejectedValue(new Error("wrong audience"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/mcp/route");
    const response = await POST(new Request("https://chaos.example/mcp", { method: "POST", headers: { Authorization: "Bearer rejected-token" } }));
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
    expect(mocks.backend).not.toHaveBeenCalled();
    expect(mocks.clerk).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("uses Clerk authentication when the original mode is selected", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "clerk");
    vi.stubEnv("CHAOS_MCP_CLIENT_IDS", "");
    mocks.clerk.mockResolvedValue({ authenticateRequest: async () => ({ isAuthenticated: true, toAuth: () => ({ tokenType: "oauth_token", userId: "user_original" }) }) });
    const { POST } = await import("@/app/mcp/route");
    expect((await POST(new Request("https://chaos.example/mcp", { method: "POST", headers: { Authorization: "Bearer clerk-token" } }))).status).toBe(200);
    expect(mocks.clerk).toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(JSON.parse(mocks.backend.mock.calls[0][1].body).userId).toBe("user_original");
  });
  it.each([["verified", true], ["unverified", false]] as const)("passes Clerk's %s email status on first use", async (status, expected) => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "clerk");
    vi.stubEnv("CHAOS_MCP_CLIENT_IDS", "");
    const getUser = vi.fn().mockResolvedValue({ fullName: "Casey", primaryEmailAddress: { emailAddress: "casey@example.com", verification: { status } }, emailAddresses: [], imageUrl: "" });
    mocks.clerk.mockResolvedValue({ authenticateRequest: async () => ({ isAuthenticated: true, toAuth: () => ({ tokenType: "oauth_token", userId: "user_new" }) }), users: { getUser } });
    mocks.backend.mockReset();
    mocks.backend.mockResolvedValueOnce(Response.json({ error: { code: "ACCOUNT_REQUIRED", message: "Sign in" } }, { status: 403 }));
    mocks.backend.mockResolvedValue(Response.json({ result: { admin: false } }));
    const { POST } = await import("@/app/mcp/route");
    await POST(new Request("https://chaos.example/mcp", { method: "POST", headers: { Authorization: "Bearer clerk-token" } }));
    const retry = JSON.parse(mocks.backend.mock.calls[1][1].body);
    expect(retry.profile).toMatchObject({ email: "casey@example.com", emailVerified: expected });
  });
  it("never sends a secret the backend would refuse", async () => {
    vi.stubEnv("CHAOS_MCP_SECRET", "too-short-secret");
    const { POST } = await import("@/app/mcp/route");
    const response = await POST(new Request("https://chaos.example/mcp", { method: "POST", headers: { Authorization: "Bearer signed-token" } }));
    expect(response.status).toBe(200); // the capability probe fails quietly; tools report NOT_CONFIGURED
    expect(mocks.backend).not.toHaveBeenCalled();
  });
  it("answers 401 to token-less clients that sign in at the transport, but lets ChatGPT list tools first", async () => {
    const { POST } = await import("@/app/mcp/route");
    const claude = await POST(new Request("https://chaos.example/mcp", { method: "POST", headers: { "User-Agent": "claude-code/2.1" } }));
    expect(claude.status).toBe(401);
    expect(claude.headers.get("WWW-Authenticate")).toBe('Bearer resource_metadata="https://chaos.example/.well-known/oauth-protected-resource/mcp"');
    const chatgpt = await POST(new Request("https://chaos.example/mcp", { method: "POST", headers: { "User-Agent": "openai-mcp/1.0.0" } }));
    expect(chatgpt.status).toBe(200);
    expect(mocks.backend).not.toHaveBeenCalled();
  });
});
