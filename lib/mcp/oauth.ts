import { createRemoteJWKSet, jwtVerify } from "jose";
import { oidcActorId } from "@/lib/auth/identity";
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

function oidcUrl(value: string | undefined): URL {
  if (!value?.trim()) throw new Error("OIDC URL is not configured");
  const url = new URL(value.trim());
  const localHttp = process.env.AUTH_ALLOW_HTTP === "true" && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash) throw new Error("OIDC requires an HTTPS URL (explicit local HTTP trials only)");
  return url;
}

export function oidcIssuer(): string {
  return oidcUrl(process.env.AUTH_OIDC_ISSUER).href.replace(/\/+$/, "");
}

const keyResolvers = new Map<string, Promise<ReturnType<typeof createRemoteJWKSet>>>();
async function oidcKeys(issuer: string) {
  let pending = keyResolvers.get(issuer);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`${issuer}/.well-known/openid-configuration`, { redirect: "error", signal: AbortSignal.timeout(5000), cache: "no-store" });
      if (!response.ok) throw new Error("OIDC discovery unavailable");
      const discovery = await response.json() as { issuer?: unknown; jwks_uri?: unknown };
      if (discovery.issuer !== issuer || typeof discovery.jwks_uri !== "string") throw new Error("OIDC discovery issuer does not match");
      return createRemoteJWKSet(oidcUrl(discovery.jwks_uri), { timeoutDuration: 5000 });
    })();
    if (keyResolvers.size >= 20) keyResolvers.clear();
    keyResolvers.set(issuer, pending);
    pending.catch(() => keyResolvers.delete(issuer));
  }
  return pending;
}

export type VerifiedOidcMcp = {
  userId: string;
  clientId: string;
  profile: { name: string; email: string; imageUrl?: string };
};

/** OAuth access tokens must target this resource and a registered, allowed client. */
export async function verifyOidcMcpToken(token: string): Promise<VerifiedOidcMcp> {
  const issuer = oidcIssuer();
  const audience = process.env.AUTH_OIDC_MCP_AUDIENCE?.trim();
  const allowed = (process.env.CHAOS_MCP_CLIENT_IDS ?? "").split(",").map(id => id.trim()).filter(Boolean);
  if (!audience || !allowed.length) throw new Error("OIDC MCP audience and client allow-list are required");
  const { payload } = await jwtVerify(token, await oidcKeys(issuer), { issuer, audience, algorithms: ["RS256"], requiredClaims: ["sub", "exp", "iat"] });
  const clientId = typeof payload.azp === "string" ? payload.azp : typeof payload.client_id === "string" ? payload.client_id : "";
  if (!payload.sub || !allowed.includes(clientId)) throw new Error("OAuth client is not allowed");
  // Keycloak marks access tokens as Bearer; never accept an ID token here.
  if (payload.typ !== "Bearer") throw new Error("An OAuth access token is required");
  const email = payload.email_verified === true && typeof payload.email === "string" ? payload.email : "";
  const name = typeof payload.name === "string" ? payload.name : typeof payload.preferred_username === "string" ? payload.preferred_username : "Anonymous";
  const imageUrl = typeof payload.picture === "string" && payload.picture.startsWith("https://") ? payload.picture : undefined;
  return { userId: await oidcActorId(issuer, payload.sub), clientId, profile: { name, email, ...(imageUrl ? { imageUrl } : {}) } };
}

/** RFC 9728 protected resource metadata for this installation's selected provider. */
export async function protectedResourceResponse(request: Request): Promise<Response> {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  try {
    if (process.env.NEXT_PUBLIC_AUTH_PROVIDER === "oidc") {
      const issuer = oidcIssuer();
      return Response.json({ resource: resourceUrl(request), authorization_servers: [issuer], scopes_supported: MCP_SCOPES, resource_name: "Chaos", resource_documentation: `${publicOrigin(request)}/chatgpt`, bearer_methods_supported: ["header"] }, { headers: { ...metadataCors, "Cache-Control": "public, max-age=3600" } });
    }
    if (!publishableKey) throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set");
    const { generateClerkProtectedResourceMetadata } = await import("@clerk/mcp-tools/server");
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
