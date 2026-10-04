#!/bin/sh
# Pushes Chaos's Convex functions and deployment env vars to a self-hosted
# backend. Reads CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY (the
# Convex CLI uses these natively). Safe to re-run on every upgrade.
set -eu

: "${CONVEX_SELF_HOSTED_URL:?set CONVEX_SELF_HOSTED_URL}"
: "${CONVEX_SELF_HOSTED_ADMIN_KEY:?set CONVEX_SELF_HOSTED_ADMIN_KEY (docker compose exec backend ./generate_admin_key.sh)}"
case "${CHAOS_AUTH_PROVIDER:-clerk}" in
  clerk)
    : "${CLERK_JWT_ISSUER_DOMAIN:?set CLERK_JWT_ISSUER_DOMAIN}"
    pnpm exec convex env set CLERK_JWT_ISSUER_DOMAIN "$CLERK_JWT_ISSUER_DOMAIN"
    ;;
  betterauth)
    : "${BETTER_AUTH_SECRET:?set BETTER_AUTH_SECRET (32+ random characters)}"
    : "${CHAOS_APP_URL:?set CHAOS_APP_URL to the public HTTPS app origin}"
    pnpm exec convex env set BETTER_AUTH_SECRET "$BETTER_AUTH_SECRET"
    ;;
  *) echo 'CHAOS_AUTH_PROVIDER must be clerk or betterauth' >&2; exit 1 ;;
esac
pnpm exec convex env set CHAOS_AUTH_PROVIDER "${CHAOS_AUTH_PROVIDER:-clerk}"
[ -z "${CHAOS_APP_URL:-}" ] || pnpm exec convex env set CHAOS_APP_URL "$CHAOS_APP_URL"
[ -z "${CHAOS_MCP_SECRET:-}" ] || pnpm exec convex env set CHAOS_MCP_SECRET "$CHAOS_MCP_SECRET"
[ -z "${CHAOS_SUPPORT_EMAIL:-}" ] || pnpm exec convex env set CHAOS_SUPPORT_EMAIL "$CHAOS_SUPPORT_EMAIL"
[ -z "${CHAOS_WEBHOOK_KEY:-}" ] || pnpm exec convex env set CHAOS_WEBHOOK_KEY "$CHAOS_WEBHOOK_KEY"
[ -z "${INDEXNOW_KEY:-}" ] || pnpm exec convex env set INDEXNOW_KEY "$INDEXNOW_KEY"
[ -z "${CHAOS_WEBHOOK_ALLOW_LOCALHOST:-}" ] || pnpm exec convex env set CHAOS_WEBHOOK_ALLOW_LOCALHOST "$CHAOS_WEBHOOK_ALLOW_LOCALHOST"
[ -z "${CHAOS_API_READ_RATE_PER_MINUTE:-}" ] || pnpm exec convex env set CHAOS_API_READ_RATE_PER_MINUTE "$CHAOS_API_READ_RATE_PER_MINUTE"
[ -z "${CHAOS_API_WRITE_RATE_PER_MINUTE:-}" ] || pnpm exec convex env set CHAOS_API_WRITE_RATE_PER_MINUTE "$CHAOS_API_WRITE_RATE_PER_MINUTE"

pnpm exec convex deploy --yes
