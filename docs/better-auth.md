# Better Auth

Better Auth is the optional authentication provider alongside Clerk. Its Convex component stores password hashes, users, sessions, OAuth clients and signing keys in the same backend deployment as Chaos. It works with Convex Cloud or a self-hosted Convex instance. No separate identity server, database service or paid authentication service is required.

## Configuration

Frontend build variables:

```dotenv
NEXT_PUBLIC_AUTH_PROVIDER=betterauth
NEXT_PUBLIC_APP_URL=https://chaos.example.com
NEXT_PUBLIC_CONVEX_URL=https://convex.example.com
NEXT_PUBLIC_CONVEX_SITE_URL=https://convex-site.example.com
```

Set these on the Convex deployment before deploying functions:

```bash
pnpm exec convex env set CHAOS_AUTH_PROVIDER betterauth
pnpm exec convex env set CHAOS_APP_URL https://chaos.example.com
pnpm exec convex env set BETTER_AUTH_SECRET YOUR_RANDOM_SECRET
```

Generate at least 32 random characters for the secret. The Convex backend supplies `CONVEX_SITE_URL` automatically; its public HTTPS HTTP-actions origin must match `NEXT_PUBLIC_CONVEX_SITE_URL`. Keep origins canonical, without trailing slashes. Use HTTPS, including trusted local TLS for development. Frontend and backend auth modes must match. Clerk keys are unnecessary in this mode.

Deploy functions first, rebuild the frontend and visit `/sign-up`. Email/password registration is enabled; passwords require at least 12 characters. Sessions expire after eight hours. `/auth/account` changes the password and revokes other sessions. Authentication endpoints use Better Auth's origin checks, secure cookies and database-backed rate limiting. Convex independently checks signed JWTs and resource permissions.

## Email and recovery

New addresses remain unverified. Email-based invitations require genuine verification and will not grant access to an unverified address. Automated verification and forgotten-password emails are not configured by this starter. Operators must add a mail delivery integration and Better Auth verification/reset callbacks before offering those flows. Do not mark arbitrary addresses verified or link legacy accounts by matching email. Signed-in password changes work without mail delivery.

## MCP OAuth

Better Auth's OAuth Provider plugin handles authorization-code flow, PKCE S256, refresh tokens and explicit consent at `/auth/consent`. Dynamic registration is disabled. Operators register each reviewed connector's exact HTTPS redirect URIs:

```bash
pnpm exec convex run auth:registerMcpClient '{"name":"My connector","redirectUris":["https://connector.example.com/oauth/callback"]}'
```

Put the returned `clientId` in Next.js runtime `CHAOS_MCP_CLIENT_IDS` (comma-separated), and share `CHAOS_MCP_SECRET` between Next.js and Convex. Registered clients are public PKCE clients; they receive no client secret. Request `profile email`, optionally `offline_access`, and resource `https://chaos.example.com/mcp`. OAuth discovery is available at `/.well-known/oauth-authorization-server`; protected-resource discovery is at `/.well-known/oauth-protected-resource/mcp`.

MCP verifies the signature, issuer, resource audience, expiry, subject, granted scopes and client allowlist. Website JWTs and OAuth ID tokens cannot substitute for MCP access tokens. External connectors still need acceptance testing against their registered callback URLs; automatic ChatGPT registration is not enabled.

## Existing accounts and upgrades

Follow [the identity migration steps](./self-hosting.md#migrating-an-existing-installation) before the replacement account uses Chaos. There is no automatic password or session import from another provider. Retain old provider backups until account migration and restore tests succeed.

Better Auth and the OAuth Provider plugin use the supported 1.6 release line of `@convex-dev/better-auth`. Update them together, review security advisories and regenerate the local component schema with `node scripts/generate-auth-schema.mjs` after dependency changes. Run tests and deploy component schema/functions before updating the frontend. The auth component and signing keys must be included in backend backups.

See the official [Convex integration](https://labs.convex.dev/better-auth/framework-guides/next) and [OAuth Provider documentation](https://better-auth.com/docs/plugins/oauth-provider).

## OAuth dependency advisory

The supported 1.6 OAuth Provider line is affected by [GHSA-p2fr-6hmx-4528](https://github.com/advisories/GHSA-p2fr-6hmx-4528). Chaos applies the documented single-audience workaround: only the app's `/mcp` resource is allowed, the `openid` scope is disabled for this provider to avoid implicit userinfo audiences, and MCP rejects audience arrays. Backend authorization checks remain independent of OAuth resource claims. `pnpm audit --prod` still reports this advisory. Do not add audiences or enable `openid` without upgrading to a patched provider supported by the Convex adapter and rerunning authorization/refresh tests.
