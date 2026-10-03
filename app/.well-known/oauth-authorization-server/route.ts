// Mirrors the selected authorization server metadata for MCP clients that look for it
// on the resource origin instead of following authorization_servers.
import { metadataCors, betterAuthIssuer } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NEXT_PUBLIC_AUTH_PROVIDER !== "betterauth") {
    const { authServerMetadataHandlerClerk } = await import("@clerk/mcp-tools/next");
    return authServerMetadataHandlerClerk()();
  }
  try {
    const issuer = betterAuthIssuer();
    const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
    if (!site) throw new Error("Convex HTTP-actions URL is required");
    const response = await fetch(`${site.replace(/\/+$/, "")}/.well-known/oauth-authorization-server`, { redirect: "error", signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) throw new Error("OIDC discovery unavailable");
    const metadata: unknown = await response.json();
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || !("issuer" in metadata) || metadata.issuer !== issuer) throw new Error("OIDC discovery issuer does not match");
    for (const field of ["authorization_endpoint", "token_endpoint", "jwks_uri"]) {
      const value = (metadata as Record<string, unknown>)[field];
      if (typeof value !== "string") throw new Error("OIDC discovery endpoint missing");
      const endpoint = new URL(value);
      if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash) throw new Error("Invalid OIDC discovery endpoint");
    }
    return Response.json(metadata, { headers: { ...metadataCors, "Cache-Control": "public, max-age=3600" } });
  } catch {
    return Response.json({ error: "not_configured" }, { status: 503, headers: { ...metadataCors, "Cache-Control": "no-store" } });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: metadataCors });
}
