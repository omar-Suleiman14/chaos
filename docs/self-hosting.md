# Self-hosting Chaos

Chaos supports three deployment choices:

| Sign-in | Backend | Required paid services |
|---|---|---|
| Clerk | Convex Cloud or self-hosted Convex | Provider plans depend on usage |
| Better Auth | Convex Cloud | Convex plan depends on usage |
| Better Auth | Self-hosted Convex | None; you operate the infrastructure |

Better Auth runs inside Convex and stores accounts, password hashes, sessions and OAuth signing keys in its component. No separate identity server or authentication database is needed. Analytics, wallet issuers and external connectors are optional.

**Verification limit:** Automated application tests and builds do not verify an entire Docker deployment. Test the installed stack with synthetic accounts before serving real data.

## Requirements

Use Docker Compose v2.20+, sufficient memory for Next.js builds and Convex, persistent storage and backups. Use HTTPS origins for the app, backend API and backend HTTP actions. Use a trusted local TLS proxy for authentication development.

Copy `.env.example` to `.env`; never commit it. Generate independent random secrets, for example `openssl rand -hex 32`. Set `NEXT_PUBLIC_APP_URL`, `CHAOS_APP_URL` (the identical app origin), `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `CONVEX_INSTANCE_SECRET` and your authentication choice. Public variables are baked into the app image; changing them requires rebuilding.

## Choose sign-in

### Clerk

Keep `NEXT_PUBLIC_AUTH_PROVIDER=clerk`. Supply `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and HTTPS `CLERK_JWT_ISSUER_DOMAIN`. Create Clerk's JWT template named `convex`, with audience `convex`. Include `email` and the genuine `email_verified` claim derived from `{{user.email_verified}}`. Do not hardcode verification. Set `CHAOS_AUTH_PROVIDER=clerk` on managed Convex; Compose sets it during deployment.

### Better Auth

Set `NEXT_PUBLIC_AUTH_PROVIDER=betterauth` and an independent random `BETTER_AUTH_SECRET` of at least 32 characters. Both public Convex URLs and the app origin must be explicit HTTPS URLs. Compose configures `CHAOS_AUTH_PROVIDER`, `CHAOS_APP_URL` and the secret on the backend. No Clerk credentials are required. Read [Better Auth configuration, account recovery and OAuth](./better-auth.md).

For Convex Cloud, set those backend variables with `pnpm exec convex env set` before deploying; `.env.local` alone does not configure the backend. Set `NEXT_PUBLIC_CONVEX_SITE_URL` to the deployment's `.convex.site` origin and deploy Next.js to your chosen host. Better Auth does not require its own Compose service.

## Deploy the self-hosted backend and app

```bash
docker compose up -d backend dashboard
docker compose exec backend ./generate_admin_key.sh
# Store the printed root credential as CONVEX_SELF_HOSTED_ADMIN_KEY in .env.
docker compose --profile deploy run --rm convex-deploy
docker compose up -d --build app
```

Deploy backend schema/functions before the app. The deploy container configures authentication mode and nonempty backend settings. Empty optional settings do not clear old values; use `pnpm exec convex env remove VARIABLE` explicitly. Keep webhook encryption keys and the Better Auth secret stable.

Visit `/sign-up` to create a Better Auth account. Passwords require at least 12 characters. `/auth/account` changes passwords and revokes other sessions. New email addresses remain unverified; invitation access requires genuine verification. Automated email verification and forgotten-password delivery need an operator-provided mail integration. They are not configured by default.

After signing in once, an operator can grant application administration with `pnpm exec convex run admin:grantAdmin '{"email":"you@example.com"}'` against the intended backend. The address must be verified by the sign-in provider; with Better Auth, configure email verification first.

## Migrating an existing installation

Back up and rehearse a restore before changing authentication or backend hosting. Migrating to self-hosted Convex also requires exporting/importing the complete database, component data and files using supported Convex tooling. Preserve ownership and respondent data; do not recreate accounts by email.

Create the replacement account through Better Auth's `/api/auth/sign-up/email` API or an operator-controlled script and record the returned user ID. Do not use the website signup page for this step: it redirects to the workspace and creates a new Chaos account. Verify the old and new identities through an operator-controlled process, then run the internal binding before visiting the workspace:

```bash
pnpm exec convex run authIdentity:bindLegacyAccount '{"issuer":"https://convex-site.example.com","subject":"BETTER_AUTH_USER_ID","legacyActorId":"OLD_ACCOUNT_ACTOR_ID","legacyTokenIdentifier":"OLD_STORED_TOKEN_IDENTIFIER"}'
```

The replacement issuer is the Convex HTTP-actions origin. Use actual stored legacy values. Binding preserves actor IDs, administration, ownership and study identity; matching email never links accounts. New installations need no binding. Passwords and sessions are not automatically imported from Clerk or Keycloak; migrating users create fresh credentials. Keep previous identity-service backups until migration and restore checks succeed. Test old content, collaborator roles and respondent access before cutover.

## TLS, storage and operations

Place a trusted reverse proxy in front of the public endpoints:

| Origin | Target |
|---|---|
| `https://chaos.example.com` | `app:3000` |
| `https://convex.example.com` | `backend:3210` (WebSockets) |
| `https://convex-site.example.com` | `backend:3211` |

The proxy must overwrite forwarded headers. Remove `CONVEX_DO_NOT_REQUIRE_SSL` behind TLS. Protect the Convex dashboard (localhost port 6791) and root key. App health at `/api/health` checks the app process only.

Back up `convex-data`, including auth component data and signing keys, plus server configuration/secrets consistently. Rehearse a restore. Never run `docker compose down -v` against retained data. Review release/security notes before upgrades; pin Convex images to tested releases. Deploy schema/functions before swapping the app. High availability and managed monitoring are operator responsibilities.

## Versions and upgrades

`docker-compose.yml` and `.env.example` pin the Convex backend and dashboard images to a tested build
(`CONVEX_BACKEND_TAG`, `CONVEX_DASHBOARD_TAG`) instead of `latest`, so a restart never upgrades the
database engine by surprise. To upgrade, back up `convex-data`, change both tags to the same newer
build, then deploy functions again. The app image builds with the pnpm version pinned in
`package.json` (`packageManager`).

Links the MCP server gives assistants (lessons, courses, cards and guides) use `NEXT_PUBLIC_APP_URL`
and the section origins from [hosts.md](hosts.md); backend links use `CHAOS_APP_URL`. Set both to your
own origin.

## What is not covered yet

Check these before relying on a self-hosted installation:

- **Email delivery.** With Better Auth, verification and forgotten-password emails are not configured
  ([better-auth.md](better-auth.md#email-and-recovery)). Until you add a mail integration, people who
  forget their password need an operator to reset it, and email-based invitations cannot be accepted.
- **Restore.** The backup steps above have not been rehearsed against a full restore by the project.
  Rehearse one on your own data before you depend on it.
- **Load.** No sustained load test or large live-game run has been published for the Docker setup.
  Measure with your expected class sizes first.

## Optional integrations

MCP requires `CHAOS_MCP_SECRET` shared by Next.js and Convex. Better Auth additionally requires explicitly registered PKCE clients and a nonempty Next.js `CHAOS_MCP_CLIENT_IDS` allowlist. Request the app's `/mcp` URL as the OAuth resource. Registration and consent are described in [Better Auth MCP setup](./better-auth.md#mcp-oauth). Dynamic client registration is disabled; test external connector callbacks before enabling them.

Google Wallet needs your own issuer/service-account credentials; leave `GOOGLE_WALLET_*` empty to disable it. Analytics stays off without `NEXT_PUBLIC_POSTHOG_*`. Integration API/webhook callers must reach the backend HTTP-actions origin. Set `NEXT_PUBLIC_SOURCE_REPO_URL` to the source for your running modified version, as required by the AGPL. See [data lifecycle](./data-lifecycle.md), [migrations](./migrations.md) and [security](../SECURITY.md).
