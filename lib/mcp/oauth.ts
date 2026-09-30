import { generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";
import { MCP_SCOPES } from "./server";

/** Public origin of this deployment (Vercel sets x-forwarded-host). */
export function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** The canonical MCP resource identifier; ChatGPT echoes it as the OAuth `resource`. */
export function resourceUrl(request: Request): string {
  return `${publicOrigin(request)}/mcp`;
}

export function resourceMetadataUrl(request: Request): string {
  return `${publicOrigin(request)}/.well-known/oauth-protected-resource/mcp`;
}

export const metadataCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

/** RFC 9728 protected resource metadata pointing at the Clerk authorization server. */
export function protectedResourceResponse(request: Request): Response {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  try {
    if (!publishableKey) throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set");
    const metadata = generateClerkProtectedResourceMetadata({
      publishableKey,
      resourceUrl: resourceUrl(request),
      properties: {
        scopes_supported: MCP_SCOPES,
        resource_name: "Chaos",
        resource_documentation: `${publicOrigin(request)}/chatgpt`,
        bearer_methods_supported: ["header"],
      },
    });
    return Response.json(metadata, { headers: { ...metadataCors, "Cache-Control": "public, max-age=3600" } });
  } catch (error) {
    console.error("oauth metadata unavailable", error instanceof Error ? error.message : error);
    return Response.json({ error: "not_configured" }, { status: 503, headers: metadataCors });
  }
}
