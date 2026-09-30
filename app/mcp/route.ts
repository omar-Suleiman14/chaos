// MCP endpoint for the Chaos ChatGPT app: https://chaos.fail/mcp
// Stateless Streamable HTTP. Clerk is the OAuth authorization server; tokens
// are verified here and the verified user id is forwarded to Convex.

import { clerkClient } from "@clerk/nextjs/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createChaosMcpServer, McpToolError } from "@/lib/mcp/server";
import type { McpCaller } from "@/lib/mcp/server";
import { resourceMetadataUrl, resourceUrl } from "@/lib/mcp/oauth";

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

function unauthorized(request: Request, description: string): Response {
  return withCors(Response.json(
    { error: "invalid_token", error_description: description },
    { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl(request)}", error="invalid_token", error_description="${description}"` } },
  ));
}

async function verifiedUserId(request: Request): Promise<string | null | Response> {
  if (!/^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "")) return null;
  try {
    const clerk = await clerkClient();
    const state = await clerk.authenticateRequest(request, { acceptsToken: "oauth_token" });
    const auth = state.toAuth();
    if (state.isAuthenticated && auth && auth.tokenType === "oauth_token" && auth.userId) {
      // Only OAuth clients on the allow-list (the ChatGPT app) may act for a person. Unset = any client of this Clerk instance.
      const allowed = (process.env.CHAOS_MCP_CLIENT_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
      if (allowed.length && !allowed.includes(auth.clientId ?? "")) return unauthorized(request, "This app is not allowed to use Chaos.");
      return auth.userId;
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

function convexCaller(userId: string): McpCaller {
  const secret = process.env.CHAOS_MCP_SECRET;
  let profile: { name: string; email: string; imageUrl?: string } | undefined;
  const send = async (tool: string, input: Record<string, unknown>) => {
    if (!secret) throw new McpToolError("NOT_CONFIGURED", "The Chaos app is not configured on this server yet.");
    const response = await fetch(`${convexSiteUrl()}/api/mcp/v1`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId, profile, tool, input }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as { result?: unknown; error?: { code: string; message: string } } | null;
    if (response.ok && body && "result" in body) return { ok: true as const, result: body.result };
    return { ok: false as const, code: body?.error?.code ?? "ERROR", message: body?.error?.message ?? "Chaos could not complete this." };
  };
  return async (tool, input) => {
    let outcome = await send(tool, input);
    // First visit from ChatGPT: create the Chaos account from the Clerk profile, then retry once.
    if (!outcome.ok && outcome.code === "ACCOUNT_REQUIRED" && !profile) {
      const user = await (await clerkClient()).users.getUser(userId);
      const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? "";
      profile = { name: user.fullName || user.username || user.firstName || "Anonymous", email, imageUrl: user.imageUrl || undefined };
      outcome = await send(tool, input);
    }
    if (!outcome.ok) throw new McpToolError(outcome.code, outcome.message);
    return outcome.result;
  };
}

async function handle(request: Request): Promise<Response> {
  const userId = await verifiedUserId(request);
  if (userId instanceof Response) return userId;
  const server = createChaosMcpServer({ call: userId ? convexCaller(userId) : null, resourceMetadataUrl: resourceMetadataUrl(request) });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request, userId ? { authInfo: { token: "", clientId: "clerk", scopes: [], resource: new URL(resourceUrl(request)), extra: { userId } } } : undefined);
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
    return withCors(Response.json({ name: "Chaos", mcp: resourceUrl(request), docs: "https://chaos.fail" }));
  }
  return withCors(new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS" } }));
}

export async function DELETE() {
  return withCors(new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS" } }));
}

export async function OPTIONS() {
  return withCors(new Response(null, { status: 204 }));
}
