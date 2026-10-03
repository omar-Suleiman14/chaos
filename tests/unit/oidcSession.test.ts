import { describe, expect, it, vi } from "vitest";
import { safeAuthReturn } from "../../lib/auth/redirect";
import { refreshOidcToken } from "../../lib/auth/tokens";

const config = { issuer: "https://auth.example.test/realms/chaos", clientId: "chaos", clientSecret: "private-secret" };
const token = { actorId: "oidc_actor", accessToken: "expired", refreshToken: "private-refresh", accessExpiresAt: 0 };
function discovery() { return Response.json({ issuer: config.issuer, token_endpoint: `${config.issuer}/protocol/openid-connect/token` }); }

describe("OIDC session refresh", () => {
  it("rotates tokens server-side and preserves canonical identity", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(discovery()).mockResolvedValueOnce(Response.json({ access_token: "fresh", expires_in: 300, refresh_token: "rotated" }));
    const result = await refreshOidcToken(token, config, fetcher);
    expect(result).toMatchObject({ actorId: "oidc_actor", accessToken: "fresh", refreshToken: "rotated" });
    expect(result.accessExpiresAt).toBeGreaterThan(Date.now());
    const request = fetcher.mock.calls[1][1]!;
    expect(request.redirect).toBe("error");
    expect((request.body as URLSearchParams).get("client_secret")).toBe("private-secret");
  });
  it("coalesces concurrent refreshes instead of reusing a rotating credential twice", async () => {
    const concurrentToken = { ...token, refreshToken: "concurrent-private-refresh" };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(discovery()).mockResolvedValueOnce(Response.json({ access_token: "fresh", expires_in: 300 }));
    const results = await Promise.all([refreshOidcToken(concurrentToken, config, fetcher), refreshOidcToken(concurrentToken, config, fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(results[0]).toEqual(results[1]);
  });
  it("reuses a recently completed rotation for a parallel request carrying the old cookie", async () => {
    const stale = { ...token, refreshToken: "stale-cookie-refresh" };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(discovery()).mockResolvedValueOnce(Response.json({ access_token: "rotated-access", refresh_token: "rotated-secret", expires_in: 300 }));
    const first = await refreshOidcToken(stale, config, fetcher);
    const second = await refreshOidcToken(stale, config, fetcher);
    expect(first).toEqual(second);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(second.refreshToken).toBe("rotated-secret");
  });
  it("never sends client credentials to a foreign discovery endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ issuer: config.issuer, token_endpoint: "https://attacker.test/token" }));
    const result = await refreshOidcToken({ ...token, refreshToken: "foreign-endpoint-refresh" }, config, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.accessToken).toBeUndefined();
    expect(result.authError).toBe("RefreshAccessTokenError");
  });
  it("fails closed when the provider rejects refresh", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(discovery()).mockResolvedValueOnce(new Response("denied", { status: 400 }));
    expect(await refreshOidcToken({ ...token, refreshToken: "denied-refresh" }, config, fetcher)).toMatchObject({ accessToken: undefined, authError: "RefreshAccessTokenError" });
  });
});

describe("auth return paths", () => {
  it.each(["https://attacker.test", "//attacker.test", "/\\attacker.test", "/\nattacker", undefined])("rejects unsafe redirect %s", (value) => {
    expect(safeAuthReturn(value)).toBe("/dashboard");
  });
  it("preserves a local form receipt or workspace destination", () => {
    expect(safeAuthReturn("/creator/quiz?resume=capability#question")).toBe("/creator/quiz?resume=capability#question");
  });
});
