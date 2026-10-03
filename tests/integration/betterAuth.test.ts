import { afterEach, beforeEach, expect, it, vi } from "vitest";
import componentTest from "@convex-dev/better-auth/test";
import authSchema from "@/convex/betterAuth/schema";
import { createTestConvex } from "./setup";
import { internal } from "@/convex/_generated/api";
import { createHash } from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";

// Password hashing and RSA key generation need headroom on shared CI runners.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  vi.useRealTimers();
  vi.stubEnv("CHAOS_AUTH_PROVIDER", "betterauth");
  vi.stubEnv("CHAOS_APP_URL", "https://chaos.example.test");
  vi.stubEnv("CONVEX_SITE_URL", "https://backend.example.test");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "synthetic-auth-test-secret-at-least-32-characters",
  );
});
afterEach(() => vi.unstubAllEnvs());

function backend() {
  const t = createTestConvex();
  t.registerComponent("betterAuth", authSchema, {
    ...componentTest.modules,
    "./component/adapter.ts": () => import("@/convex/betterAuth/adapter"),
    "./component/refresh.ts": () => import("@/convex/betterAuth/refresh"),
  });
  return t;
}
const post = (body: unknown) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://chaos.example.test",
  },
  body: JSON.stringify(body),
});

it("registers, signs in, issues a Convex JWT and rejects incorrect passwords through HTTP", async () => {
  const t = backend();
  const registration = await t.fetch(
    "/api/auth/sign-up/email",
    post({
      name: "Test Creator",
      email: "creator@example.test",
      password: "synthetic-password-123",
    }),
  );
  expect(registration.status).toBe(200);
  const created = await registration.json();
  expect(created.user.emailVerified).toBe(false);
  expect(created.user.password).toBeUndefined();
  const login = await t.fetch(
    "/api/auth/sign-in/email",
    post({ email: "creator@example.test", password: "synthetic-password-123" }),
  );
  expect(login.status).toBe(200);
  expect(login.headers.get("set-cookie")).toContain("HttpOnly");
  const cookies = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const jwt = await t.fetch("/api/auth/convex/token", {
    headers: { Cookie: cookies },
  });
  expect(jwt.status).toBe(200);
  const claims = JSON.parse(
    Buffer.from((await jwt.json()).token.split(".")[1], "base64url").toString(),
  );
  expect(claims).toMatchObject({
    iss: "https://backend.example.test",
    aud: "convex",
    sub: created.user.id,
    emailVerified: false,
  });
  const backendKeys = await t.fetch("/api/auth/convex/jwks");
  expect(backendKeys.status).toBe(200);
  await expect(
    jwtVerify(
      (
        await (
          await t.fetch("/api/auth/convex/token", {
            headers: { Cookie: cookies },
          })
        ).json()
      ).token,
      createLocalJWKSet(await backendKeys.json()),
      { issuer: "https://backend.example.test", audience: "convex" },
    ),
  ).resolves.toBeTruthy();
  const denied = await t.fetch(
    "/api/auth/sign-in/email",
    post({ email: "creator@example.test", password: "wrong-password" }),
  );
  expect(denied.status).toBe(401);
});

it("rejects cross-origin registration and short passwords", async () => {
  const t = backend();
  const request = post({
    name: "Test",
    email: "other@example.test",
    password: "synthetic-password-123",
  });
  expect(
    (
      await t.fetch("/api/auth/sign-up/email", {
        ...request,
        headers: {
          ...request.headers,
          Origin: "https://attacker.example.test",
        },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await t.fetch(
        "/api/auth/sign-up/email",
        post({ name: "Test", email: "other@example.test", password: "short" }),
      )
    ).status,
  ).toBe(400);
});

it("completes PKCE authorization with consent and a resource-bound OAuth access token", async () => {
  const t = backend();
  const { clientId } = await t.action(internal.auth.registerMcpClient, {
    name: "Test Connector",
    redirectUris: ["https://connector.example.test/callback"],
  });
  const signup = await t.fetch(
    "/api/auth/sign-up/email",
    post({
      name: "Creator",
      email: "oauth@example.test",
      password: "synthetic-password-123",
    }),
  );
  expect(signup.status).toBe(200);
  const cookies = signup.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const verifier = "synthetic-pkce-verifier-at-least-43-characters-long";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://connector.example.test/callback",
    response_type: "code",
    scope: "profile email offline_access",
    resource: "https://chaos.example.test/mcp",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: "test-state",
  });
  const authorize = await t.fetch(`/api/auth/oauth2/authorize?${params}`, {
    headers: { Cookie: cookies },
  });
  expect(authorize.status).toBe(302);
  const consentUrl = new URL(authorize.headers.get("location")!);
  expect(consentUrl.pathname).toBe("/auth/consent");
  const consent = await t.fetch("/api/auth/oauth2/consent", {
    ...post({ accept: true, oauth_query: consentUrl.searchParams.toString() }),
    headers: { ...post({}).headers, Cookie: cookies },
  });
  expect(consent.status).toBe(200);
  const destination = new URL((await consent.json()).url);
  expect(destination.origin).toBe("https://connector.example.test");
  expect(destination.searchParams.get("state")).toBe("test-state");
  const exchange = await t.fetch("/api/auth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: "https://connector.example.test/callback",
      code: destination.searchParams.get("code")!,
      code_verifier: verifier,
      resource: "https://chaos.example.test/mcp",
    }).toString(),
  });
  expect(exchange.status).toBe(200);
  const tokens = await exchange.json();
  expect(tokens.refresh_token).toBeTruthy();
  const jwks = await (await t.fetch("/api/auth/jwks")).json();
  const { payload } = await jwtVerify(
    tokens.access_token,
    createLocalJWKSet(jwks),
    {
      issuer: "https://chaos.example.test",
      audience: "https://chaos.example.test/mcp",
      algorithms: ["RS256"],
    },
  );
  expect(payload).toMatchObject({
    azp: clientId,
    scope: "profile email offline_access",
    email_verified: false,
  });
  expect(payload.aud).toBe("https://chaos.example.test/mcp");
  const refreshed = await t.fetch("/api/auth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: tokens.refresh_token,
      resource: "https://chaos.example.test/mcp",
    }).toString(),
  });
  const rotated = await refreshed.json();
  expect({
    status: refreshed.status,
    error: rotated.error,
    description: rotated.error_description,
  }).toEqual({ status: 200, error: undefined, description: undefined });
  expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
  const outside = await t.fetch("/api/auth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: rotated.refresh_token,
      resource: "https://attacker.example.test/mcp",
    }).toString(),
  });
  expect(outside.status).toBe(400);
  const metadata = await t.fetch("/.well-known/oauth-authorization-server");
  expect(metadata.status).toBe(200);
  expect(await metadata.json()).toMatchObject({
    issuer: "https://chaos.example.test",
    jwks_uri: "https://chaos.example.test/api/auth/jwks",
  });
  expect(
    (
      await t.fetch(
        "/api/auth/oauth2/register",
        post({ redirect_uris: ["https://attacker.example.test"] }),
      )
    ).status,
  ).not.toBe(200);
});
