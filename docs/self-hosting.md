# Self-hosting Chaos

Chaos supports three deployment choices:

| Sign-in | Backend | Required paid services |
|---|---|---|
| Clerk | Convex Cloud or self-hosted Convex | Provider plans depend on your usage |
| Self-hosted Keycloak (OIDC) | Convex Cloud | Convex plan depends on your usage |
| Self-hosted Keycloak (OIDC) | Self-hosted Convex | None; you operate the infrastructure |

Convex remains the backend software in all three choices. The fully self-hosted choice removes the dependency on Convex Cloud and Clerk. Analytics, wallet issuers and external connectors are optional.

**Verification limit:** Compose configuration and application tests are checked separately. The complete Docker/Keycloak stack has not been built or exercised end to end in this environment. Test a deployment with synthetic accounts before serving real data.

## Requirements

Use Docker Compose v2.20+, sufficient memory for Next.js builds, Convex and (if selected) Keycloak/PostgreSQL, persistent storage and backups. Use HTTPS origins for the app, backend API, backend HTTP actions and OIDC issuer. Authentication deliberately rejects an HTTP issuer, including localhost. A trusted local TLS proxy and certificate trust are required for a local OIDC trial.

Copy `.env.example` to `.env`; never commit it. Generate independent random secrets, for example `openssl rand -hex 32`. Set `NEXT_PUBLIC_APP_URL`, `CHAOS_APP_URL`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `CONVEX_INSTANCE_SECRET` and your authentication choice. Public variables are baked into the app image; changing them requires a rebuild. Server credentials are runtime values.

## Choose sign-in

### Clerk

Keep `NEXT_PUBLIC_AUTH_PROVIDER=clerk`. Supply `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and HTTPS `CLERK_JWT_ISSUER_DOMAIN`. Create Clerk's JWT template named `convex`, with audience `convex`. Include `email` and the genuine `email_verified` claim derived from `{{user.email_verified}}`. Do not hardcode verification. Set `CHAOS_AUTH_PROVIDER=clerk` on managed Convex; Compose sets it during deployment.

### Keycloak / OIDC

Set `NEXT_PUBLIC_AUTH_PROVIDER=oidc`, `AUTH_OIDC_ISSUER=https://identity.example.com/realms/chaos`, `AUTH_OIDC_CLIENT_ID=chaos-web`, `AUTH_OIDC_CLIENT_SECRET` and `AUTH_SECRET`. No Clerk keys are required. On managed Convex set `CHAOS_AUTH_PROVIDER=oidc` and the identical `AUTH_OIDC_ISSUER` before deploying. Use the canonical issuer without a trailing slash.

For the included `oidc` Compose profile also set `KEYCLOAK_HOSTNAME=https://identity.example.com`, `KEYCLOAK_ADMIN_PASSWORD` and `KEYCLOAK_DB_PASSWORD`. Configure HTTPS proxying before starting it:

```bash
docker compose --profile oidc up -d keycloak-db keycloak
```

The pinned Keycloak image imports `docker/keycloak/chaos-realm.json` on first startup. It creates a confidential web client with the exact `${NEXT_PUBLIC_APP_URL}/api/auth/callback/keycloak` redirect, authorization-code flow, PKCE S256, profile/email scopes and an access-token audience mapper for `convex`. Existing realms are skipped on restart; changing `.env` or the bootstrap JSON does not update an existing client secret or redirect. Apply those changes in Keycloak administration and update the app together.

The realm disables public registration and password reset by default. Create accounts in Keycloak; verify email through configured SMTP or another documented identity-verification process before marking an account verified. Do not mark arbitrary addresses verified merely to unblock a login or invitation. Configure SMTP and registration/reset policies yourself if needed. No users or fixed passwords are included in the realm file.

A generic OIDC provider must expose discovery/JWKS and issue signed JWT access tokens with issuer equal to `AUTH_OIDC_ISSUER`, audience `convex`, a stable subject and genuine email-verification claims. Opaque access tokens are insufficient. Review [Keycloak containers](https://www.keycloak.org/server/containers), [realm imports](https://www.keycloak.org/server/importExport), [reverse proxies](https://www.keycloak.org/server/reverseproxy) and [Keycloak 26.8.0 release notes](https://www.keycloak.org/2026/10/keycloak-2680-released).

## Deploy the self-hosted backend and app

```bash
docker compose up -d backend dashboard
docker compose exec backend ./generate_admin_key.sh
# Store the printed root credential as CONVEX_SELF_HOSTED_ADMIN_KEY in .env.
docker compose --profile deploy run --rm convex-deploy
docker compose up -d --build app
```

Deploy backend schema/functions before the app. The deploy container configures the selected issuer, authentication mode and nonempty optional backend settings. Empty optional settings do not clear old values; use `pnpm exec convex env remove VARIABLE` explicitly. Keep webhook encryption keys stable.

For Keycloak plus Convex Cloud, run only the identity profile, deploy backend functions with the normal managed Convex CLI and deploy the app to your chosen Node.js host. Set backend environment values using `pnpm exec convex env set`; `.env.local` alone does not configure them.

After signing in once, an operator can grant application administration with `pnpm exec convex run admin:grantAdmin '{"email":"you@example.com"}'` against the intended backend.

## Migrating an existing installation

Back up and rehearse a restore before changing either authentication or backend hosting. Migrating to self-hosted Convex also requires exporting/importing the complete database and files using supported Convex tooling. Preserve ownership and respondent data; do not recreate accounts by email.

Before a replacement identity signs into Chaos for the first time, verify the old and new identity through an operator-controlled process, then run the internal binding command against the intended backend:

```bash
pnpm exec convex run authIdentity:bindLegacyAccount '{"issuer":"https://identity.example.com/realms/chaos","subject":"NEW_PROVIDER_SUBJECT","legacyActorId":"OLD_CLERK_USER_ID","legacyTokenIdentifier":"OLD_ISSUER|OLD_CLERK_USER_ID"}'
```

Use the actual stored legacy identity values, not guesses. Binding preserves the existing actor and ownership IDs; matching email does not link accounts. Test old content, collaborator roles and respondent access before cutover. New OIDC installations need no legacy binding.

## TLS, storage and operations

Place a trusted reverse proxy in front of the public endpoints:

| Origin | Target |
|---|---|
| `https://chaos.example.com` | `app:3000` |
| `https://convex.example.com` | `backend:3210` (WebSockets) |
| `https://convex-site.example.com` | `backend:3211` |
| `https://identity.example.com` | Keycloak listener on `127.0.0.1:8080` |

Keycloak uses `xforwarded` proxy headers. The proxy must overwrite forwarded headers and only the proxy should reach its listener; protect the administration console separately. `AUTH_TRUST_HOST=true` in Compose assumes a trusted proxy and host configuration. Remove `CONVEX_DO_NOT_REQUIRE_SSL` behind TLS. Protect the Convex dashboard (localhost port 6791) and root key. App health at `/api/health` checks the app process only.

Back up `convex-data`, the Keycloak PostgreSQL `keycloak-data` volume and server configuration/secrets consistently. PostgreSQL has no published host port. Stopped-volume snapshots or database-native backups must include a rehearsed restore. Never run `docker compose down -v` against retained data. A realm export alone is not a full Keycloak database backup.

Review release/security notes before upgrades. Convex image tags are configurable; pin them to a tested release. Keycloak and PostgreSQL are pinned in Compose; update deliberately. Deploy schema/functions before swapping the app. There is no built-in high availability or managed monitoring.

Run one app replica for OIDC sessions. Refresh-token coordination is local to that process, with a short grace window for requests carrying an older session cookie. Multiple replicas require shared refresh coordination or suitable provider refresh-token grace; strict token rotation across replicas has not been verified.

## Optional integrations

MCP requires `CHAOS_MCP_SECRET` shared by Next.js and Convex. OIDC MCP additionally requires a nonempty `CHAOS_MCP_CLIENT_IDS` allowlist and JWT access tokens for `AUTH_OIDC_MCP_AUDIENCE` (default `chaos-mcp`). Register each connector client with exact redirect URIs, PKCE and a dedicated audience mapper in Keycloak. The web client is not an MCP client; the supplied realm does not register external clients or enable dynamic client registration. Generic OIDC does not guarantee automatic ChatGPT registration compatibility.

Google Wallet needs your own issuer/service-account credentials; leave `GOOGLE_WALLET_*` empty to disable it. Analytics stays off without `NEXT_PUBLIC_POSTHOG_*`. Integration API/webhook callers must reach the backend HTTP actions origin. Set `NEXT_PUBLIC_SOURCE_REPO_URL` to the source for your running modified version, as required by the AGPL. See [data lifecycle](./data-lifecycle.md), [migrations](./migrations.md) and [security](../SECURITY.md).
