// MCP endpoint for the Chaos ChatGPT app: https://chaos.fail/mcp
// Stateless Streamable HTTP. The selected auth provider verifies OAuth tokens;
// only verified account identities are forwarded to the backend.

import { clerkClient } from "@clerk/nextjs/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createChaosMcpServer, McpToolError } from "@/lib/mcp/server";
import type { McpCaller } from "@/lib/mcp/server";
import { resourceMetadataUrl, resourceUrl, verifyBetterAuthMcpToken } from "@/lib/mcp/oauth";
import { detectAiClient, type CreatedWith } from "@/lib/aiClients";
import { chaosIntegration } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, value] of Object.entries(CORS)) headers.set(k, value);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * ChatGPT lists tools before sign-in and asks to connect per tool (securitySchemes and
 * mcp/www_authenticate). Every other client (Claude, Claude Code, Codex, Cursor) only starts OAuth
 * when the transport answers 401, so a token-less request from them gets one straight away.
 */
const PER_TOOL_AUTH_CLIENT = /^openai-mcp\//i;
function signInRequired(request: Request): Response {
  return withCors(Response.json(
    { error: "invalid_request", error_description: "Sign in to Chaos to continue." },
    { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl(request)}"` } },
  ));
}

function unauthorized(request: Request, description: string): Response {
  return withCors(Response.json(
    { error: "invalid_token", error_description: description },
    { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl(request)}", error="invalid_token", error_description="${description}"` } },
  ));
}

type Verified = { userId: string; clientId?: string; profile?: { name: string; email: string; emailVerified?: boolean; imageUrl?: string }; provider: "clerk" | "betterauth" };
async function verifiedUser(request: Request): Promise<Verified | null | Response> {
  if (!/^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "")) return null;
  try {
    if (process.env.NEXT_PUBLIC_AUTH_PROVIDER === "betterauth") {
      const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
      if (!token) return unauthorized(request, "An OAuth access token is required.");
      return { ...await verifyBetterAuthMcpToken(token), provider: "betterauth" };
    }
    const clerk = await clerkClient();
    const state = await clerk.authenticateRequest(request, { acceptsToken: "oauth_token" });
    const auth = state.toAuth();
    if (state.isAuthenticated && auth && auth.tokenType === "oauth_token" && auth.userId) {
      // Only OAuth clients on the allow-list (the ChatGPT app) may act for a person. Unset = any client of this Clerk instance.
      const allowed = (process.env.CHAOS_MCP_CLIENT_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
      if (allowed.length && !allowed.includes(auth.clientId ?? "")) return unauthorized(request, "This app is not allowed to use Chaos.");
      return { userId: auth.userId, clientId: auth.clientId ?? undefined, provider: "clerk" };
    }
  } catch (error) {
    console.error("mcp: token verification failed", error instanceof Error ? error.message : error);
  }
  return unauthorized(request, "The Chaos sign-in has expired. Reconnect Chaos.");
}

function convexSiteUrl(): string {
  const explicit = process.env.CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const cloud = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
  return cloud.replace(/\.convex\.cloud\/?$/, ".convex.site");
}

// OAuth client id -> registered app name ("ChatGPT", "Claude", ...). Dynamic clients rarely change, so cache for an hour.
const clientNames = new Map<string, { name: string; expires: number }>();
async function oauthClientName(clientId: string | undefined): Promise<string | undefined> {
  if (!clientId) return undefined;
  const cached = clientNames.get(clientId);
  if (cached && cached.expires > Date.now()) return cached.name;
  try {
    const clerk = await clerkClient();
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await clerk.oauthApplications.list({ limit: 100, offset });
      const app = page.data.find(a => a.clientId === clientId);
      if (app) {
        if (clientNames.size >= 500) clientNames.clear();
        clientNames.set(clientId, { name: app.name, expires: Date.now() + 3_600_000 });
        return app.name;
      }
      if (page.data.length < 100) break;
    }
  } catch (error) {
    console.error("mcp: client lookup failed", error instanceof Error ? error.message : error);
  }
  return undefined;
}

function convexCaller(verified: Verified, client?: CreatedWith): McpCaller {
  const { userId } = verified;
  const secret = process.env.CHAOS_MCP_SECRET;
  let profile = verified.profile;
  const send = async (tool: string, input: Record<string, unknown>) => {
    if (!secret) throw new McpToolError("NOT_CONFIGURED", "The Chaos app is not configured on this server yet.");
    const response = await fetch(`${convexSiteUrl()}/api/mcp/v1`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId, profile, tool, input, ...(client ? { client } : {}) }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as { result?: unknown; error?: { code: string; message: string; details?: unknown } } | null;
    if (response.ok && body && "result" in body) return { ok: true as const, result: body.result };
    return { ok: false as const, code: body?.error?.code ?? "ERROR", message: body?.error?.message ?? "Chaos could not complete this.", details: body?.error?.details };
  };
  return async (tool, input) => {
    let outcome = await send(tool, input);
    // First visit from ChatGPT: create the Chaos account from the Clerk profile, then retry once.
    if (!outcome.ok && outcome.code === "ACCOUNT_REQUIRED" && !profile && verified.provider === "clerk") {
      const user = await (await clerkClient()).users.getUser(userId);
      const address = user.primaryEmailAddress ?? user.emailAddresses[0];
      // The address is shown on the account; only a Clerk-verified one may later grant access.
      profile = { name: user.fullName || user.username || user.firstName || "Anonymous", email: address?.emailAddress ?? "", emailVerified: address?.verification?.status === "verified", imageUrl: user.imageUrl || undefined };
      outcome = await send(tool, input);
    }
    if (!outcome.ok) throw new McpToolError(outcome.code, outcome.message, outcome.details);
    return outcome.result;
  };
}

const adminCapabilities = new Map<string, { admin: boolean; expires: number }>();
async function handle(request: Request): Promise<Response> {
  const verified = await verifiedUser(request);
  if (verified instanceof Response) return verified;
  if (!verified && !PER_TOOL_AUTH_CLIENT.test(request.headers.get("user-agent") ?? "")) return signInRequired(request);
  const userId = verified?.userId ?? null;
  // Which assistant is calling, so content it creates can say "Created with ChatGPT/Claude/…".
  const client = verified ? detectAiClient(verified.provider === "clerk" ? await oauthClientName(verified.clientId) : undefined, request.headers.get("user-agent")) : undefined;
  const call = verified ? convexCaller(verified, client) : null;
  let admin = false;
  if (call && userId) {
    const cached = adminCapabilities.get(userId);
    if (cached && cached.expires > Date.now()) admin = cached.admin;
    else try {
      admin = (await call("get_documentation_capabilities", {}) as { admin: boolean }).admin === true;
      if (adminCapabilities.size >= 500) adminCapabilities.clear();
      adminCapabilities.set(userId, { admin, expires: Date.now() + 30_000 });
    } catch { /* Backend checks permissions again on every documentation operation. */ }
  }
  const server = createChaosMcpServer({ call, admin, resourceMetadataUrl: resourceMetadataUrl(request) });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request, userId ? { authInfo: { token: "", clientId: verified?.clientId ?? verified!.provider, scopes: [], resource: new URL(resourceUrl(request)), extra: { userId } } } : undefined);
    return withCors(response);
  } finally {
    await server.close().catch(() => undefined);
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  // Stateless server: no standalone SSE stream.
  if (!(request.headers.get("accept") ?? "").includes("text/event-stream")) {
    return withCors(Response.json({ name: chaosIntegration.name, mcp: resourceUrl(request), docs: chaosIntegration.docsUrl, icon: `${chaosIntegration.siteUrl}${chaosIntegration.logoPath}` }));
  }
  return withCors(new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS" } }));
}

export async function DELETE() {
  return withCors(new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS" } }));
}

export async function OPTIONS() {
  return withCors(new Response(null, { status: 204 }));
}
