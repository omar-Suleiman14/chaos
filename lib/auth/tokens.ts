import type { JWT } from "next-auth/jwt";

export type OidcToken = JWT & { actorId?: string; accessToken?: string; refreshToken?: string; accessExpiresAt?: number; authError?: "RefreshAccessTokenError" };
const refreshing = new Map<string, Promise<OidcToken>>();
const recent = new Map<string, { expiresAt: number; result: OidcToken }>();
const RECENT_MS = 10_000;
const RECENT_LIMIT = 256;

/** Refresh credentials stay in the encrypted, HttpOnly Auth.js JWT cookie. */
export async function refreshOidcToken(token: OidcToken, config: { issuer: string; clientId: string; clientSecret: string }, fetcher: typeof fetch = fetch): Promise<OidcToken> {
  if (!token.refreshToken) return { ...token, accessToken: undefined, authError: "RefreshAccessTokenError" };
  const key = JSON.stringify([config.issuer, config.clientId, token.actorId, token.refreshToken]);
  const now = Date.now();
  for (const [entryKey, entry] of recent) if (entry.expiresAt <= now) recent.delete(entryKey);
  const completed = recent.get(key);
  if (completed) return { ...token, accessToken: completed.result.accessToken, refreshToken: completed.result.refreshToken, accessExpiresAt: completed.result.accessExpiresAt, authError: completed.result.authError };
  const existing = refreshing.get(key);
  if (existing) return existing;
  const refresh = (async (): Promise<OidcToken> => {
    try {
      const discovery = await fetcher(`${config.issuer}/.well-known/openid-configuration`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
      if (!discovery.ok) throw new Error("Discovery unavailable");
      const metadata = await discovery.json() as { issuer?: string; token_endpoint?: string };
      if (metadata.issuer !== config.issuer || !metadata.token_endpoint) throw new Error("Invalid discovery");
      const endpoint = new URL(metadata.token_endpoint), issuer = new URL(config.issuer);
      if (endpoint.origin !== issuer.origin || endpoint.username || endpoint.password || endpoint.hash) throw new Error("Invalid token endpoint");
      const response = await fetcher(endpoint, { method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: token.refreshToken!, client_id: config.clientId, client_secret: config.clientSecret }) });
      if (!response.ok) throw new Error("Refresh failed");
      const body = await response.json() as { access_token?: unknown; expires_in?: unknown; refresh_token?: unknown };
      if (typeof body.access_token !== "string" || !body.access_token || typeof body.expires_in !== "number" || !Number.isFinite(body.expires_in) || body.expires_in <= 0) throw new Error("Invalid token response");
      return { ...token, accessToken: body.access_token, accessExpiresAt: Date.now() + body.expires_in * 1000, refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : token.refreshToken, authError: undefined };
    } catch { return { ...token, accessToken: undefined, authError: "RefreshAccessTokenError" }; }
  })();
  refreshing.set(key, refresh);
  try {
    const result = await refresh;
    if (!result.authError) {
      if (recent.size >= RECENT_LIMIT) recent.delete(recent.keys().next().value!);
      recent.set(key, { result, expiresAt: Date.now() + RECENT_MS });
    }
    return result;
  } finally { refreshing.delete(key); }
}
