# Self-hosting Chaos with Docker

> **Status: untested end to end.** The Dockerfile, `docker-compose.yml` and this
> guide were written and statically validated (`docker compose config`, a
> standalone `next build`, and the health endpoint run outside a container), but
> the image has **not yet been built or run in a container**, and the full
> creator and respondent journey has not been exercised on a self-hosted stack.
> Treat it as a starting point and expect to fix rough edges. Please report them.

Chaos is two things: a Next.js app and a Convex backend. This guide runs both
with Docker Compose, using Convex's official self-hosted backend and dashboard
images.

## What you need

- Docker with the Compose plugin (v2.20+).
- **A Clerk account.** Authentication is Clerk today and Clerk is a hosted
  service (free tier available). It cannot be self-hosted and cannot currently
  be swapped out. Chaos will not run without it. See [Clerk setup](#clerk-setup).
- A machine with about 2 vCPU and 2 GB RAM for a small instance (rough guess,
  not measured), plus disk for the Convex volume. Building the image needs
  around 2 GB RAM more while it runs.
- For anything beyond a local trial: a domain and TLS ([reverse proxy](#reverse-proxy-and-tls)).

## Quick start (local trial over plain http)

```bash
cp .env.example .env
```

Edit `.env`:

1. `CONVEX_INSTANCE_SECRET`: `openssl rand -hex 32`.
2. Clerk values: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
   `CLERK_JWT_ISSUER_DOMAIN` (see [Clerk setup](#clerk-setup)).
3. Set `NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210` and
   `NEXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211`; leave the app origins at
   `http://localhost:3000` for a local trial.

Then:

```bash
docker compose up -d --build backend dashboard      # 1. start the Convex backend
docker compose exec backend ./generate_admin_key.sh  # 2. prints an admin key
# put it in .env as CONVEX_SELF_HOSTED_ADMIN_KEY=...
docker compose --profile deploy run --rm convex-deploy  # 3. push Chaos's functions
docker compose up -d --build app                     # 4. build and start the app
```

Open http://localhost:3000. The Convex dashboard is at http://127.0.0.1:6791
(sign in with the admin key).

Startup order matters: the backend must be healthy and the functions and schema
must be deployed **before** the app serves traffic that depends on them. Compose
enforces backend-before-app through a health check, but deploying functions is an
explicit step (3) so that a schema change never lands after the code that needs it.

Make yourself an admin (optional), after signing in once:

```bash
docker compose --profile deploy run --rm convex-deploy \
  pnpm exec convex run admin:grantAdmin '{"email":"you@example.com"}'
```

## Environment variables

[`.env.example`](../.env.example) is the complete list, with each variable marked
required/optional and whether it is read at **build**, **runtime** or on
**Convex**. Key points:

- **`NEXT_PUBLIC_*` values are inlined into the browser bundle at build time.**
  A prebuilt image therefore cannot be re-pointed at a different Convex URL,
  Clerk key or app URL. Changing any of them means
  `docker compose build app && docker compose up -d app`. This is a Next.js
  property; the compose file passes them as build arguments. They are public
  values, and no secret is baked into the image.
- `CLERK_SECRET_KEY` and `CHAOS_MCP_SECRET` are runtime-only.
- `CLERK_JWT_ISSUER_DOMAIN`, `CHAOS_APP_URL`, `CHAOS_MCP_SECRET`,
  `CHAOS_SUPPORT_EMAIL`, `CHAOS_WEBHOOK_KEY` and integration rate limits live on
  the Convex deployment. `convex-deploy` sets nonempty values from your `.env`.
  Empty optional values do not remove previously configured variables; use
  `pnpm exec convex env remove VARIABLE` against your self-hosted target to clear
  one. Keep `CHAOS_WEBHOOK_KEY` stable so existing webhook secrets remain readable.
- `CHAOS_MCP_CLIENT_IDS` is the app's runtime OAuth client allowlist.
- `NEXT_PUBLIC_SUPPORT_EMAIL` is a public build-time value, like the app origin.
- `NEXT_PUBLIC_CONVEX_SITE_URL` (HTTP actions, port 3211) is required for
  self-hosting: hosted Convex derives it from a `.cloud` URL, self-hosted cannot.

## Clerk setup

1. Create an application at https://clerk.com.
2. Copy the publishable key (`pk_...`) and secret key (`sk_...`) into `.env`.
3. In Clerk, go to **JWT templates** and create a template named **`convex`**
   (Clerk's Convex preset does this). Convex validates tokens with
   `applicationID: "convex"`.
4. Set `CLERK_JWT_ISSUER_DOMAIN` to your Clerk **Frontend API URL**
   (for example `https://your-app.clerk.accounts.dev`).
5. Add your app's public origin to Clerk's allowed origins/redirects.

The deployment requires an explicit HTTPS `CLERK_JWT_ISSUER_DOMAIN`; it refuses
to deploy without one. Every installation selects its own Clerk issuer.

## Reverse proxy and TLS

Expose three public origins (subdomains are simplest) and terminate TLS in front
of them, with any proxy (Caddy, nginx, Traefik):

| Public URL | Proxies to | Env var |
|---|---|---|
| `https://chaos.example.com` | `app:3000` | `NEXT_PUBLIC_APP_URL`, `CHAOS_APP_URL` |
| `https://convex.example.com` | `backend:3210` (websockets required) | `NEXT_PUBLIC_CONVEX_URL` |
| `https://convex-site.example.com` | `backend:3211` | `NEXT_PUBLIC_CONVEX_SITE_URL` |

Then set those variables, remove `CONVEX_DO_NOT_REQUIRE_SSL`, and **rebuild the
app image** (build-time values). The admin dashboard binds to 127.0.0.1 by
default; put it behind your own auth or reach it over an SSH tunnel rather than
exposing it publicly. Minimal Caddy example:

```
chaos.example.com        { reverse_proxy localhost:3000 }
convex.example.com       { reverse_proxy localhost:3210 }
convex-site.example.com  { reverse_proxy localhost:3211 }
```

The app's Content-Security-Policy is currently **report-only** and lists hosted
Convex domains; with your own Convex domain you will see console reports, but
nothing is blocked. Also add your domain to Clerk.

## Health checks and volumes

- App: `GET /api/health` returns `{"status":"ok","version":"..."}`. The image has
  a `HEALTHCHECK` on it. It checks the app process only, not Convex.
- Backend: compose polls `http://localhost:3210/version`.
- **Volume `convex-data`** holds the entire database and file storage. It is the
  only state. Everything else can be rebuilt.

## Upgrades

```bash
git pull
docker compose build app
docker compose pull backend dashboard        # if you track :latest; prefer pinned tags
docker compose up -d backend dashboard
docker compose --profile deploy run --rm convex-deploy   # schema and functions first
docker compose up -d app
```

Deploy Convex before swapping the app so new code never runs against an old
schema. Back up first (below). Pin `CONVEX_BACKEND_TAG` in `.env` so backend
upgrades are a deliberate choice; read the Convex self-hosting release notes
before bumping it.

## Backups

Back up the `convex-data` volume (stop the backend or use a volume snapshot for
consistency) and keep `.env`. Convex also supports `npx convex export` /
`import` against a self-hosted backend
(`CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` set), which is the
portable option. If you use an external Postgres/MySQL (`CONVEX_DATABASE_URL`),
use that database's own backup tooling. Restores have not been rehearsed for
this repo; test yours. See Convex's self-hosting docs for details.

## What is not supported / differs from hosted Chaos

- **Clerk is mandatory** and cannot be self-hosted. Core Forms and Quiz work with
  no managed *Chaos* service, but sign-in depends on Clerk's servers.
- The stack has not been verified end to end, including the public API and
  webhook delivery. They use Convex HTTP actions on port 3211, so that port must
  be publicly reachable by whatever calls them.
- No high availability: one backend container, one app container. Scaling the
  backend beyond that is Convex's own (separate) topic.
- `NEXT_PUBLIC_*` changes need an image rebuild (see above).
- Defaults that point at the hosted product if you leave variables unset:
  `NEXT_PUBLIC_APP_URL` (SEO/sitemap origin, `https://chaos.fail`) and
  `CHAOS_APP_URL` (links built by Convex). Set both to your own origin.
- Analytics is off unless you set the PostHog variables.
- No AI provider variables are read by the code at this commit.
- Hosted-only operations (managed backups, monitoring, support) are not part of
  the self-hosted stack.
- Windows/macOS Docker Desktop should work for trials; production is expected on Linux.
