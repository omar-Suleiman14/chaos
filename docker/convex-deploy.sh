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
  oidc)
    : "${AUTH_OIDC_ISSUER:?set AUTH_OIDC_ISSUER}"
    pnpm exec convex env set AUTH_OIDC_ISSUER "$AUTH_OIDC_ISSUER"
    ;;
  *) echo 'CHAOS_AUTH_PROVIDER must be clerk or oidc' >&2; exit 1 ;;
esac
pnpm exec convex env set CHAOS_AUTH_PROVIDER "${CHAOS_AUTH_PROVIDER:-clerk}"
[ -z "${CHAOS_APP_URL:-}" ] || pnpm exec convex env set CHAOS_APP_URL "$CHAOS_APP_URL"
[ -z "${CHAOS_MCP_SECRET:-}" ] || pnpm exec convex env set CHAOS_MCP_SECRET "$CHAOS_MCP_SECRET"
[ -z "${CHAOS_SUPPORT_EMAIL:-}" ] || pnpm exec convex env set CHAOS_SUPPORT_EMAIL "$CHAOS_SUPPORT_EMAIL"
[ -z "${CHAOS_WEBHOOK_KEY:-}" ] || pnpm exec convex env set CHAOS_WEBHOOK_KEY "$CHAOS_WEBHOOK_KEY"
[ -z "${CHAOS_WEBHOOK_ALLOW_LOCALHOST:-}" ] || pnpm exec convex env set CHAOS_WEBHOOK_ALLOW_LOCALHOST "$CHAOS_WEBHOOK_ALLOW_LOCALHOST"
[ -z "${CHAOS_API_READ_RATE_PER_MINUTE:-}" ] || pnpm exec convex env set CHAOS_API_READ_RATE_PER_MINUTE "$CHAOS_API_READ_RATE_PER_MINUTE"
[ -z "${CHAOS_API_WRITE_RATE_PER_MINUTE:-}" ] || pnpm exec convex env set CHAOS_API_WRITE_RATE_PER_MINUTE "$CHAOS_API_WRITE_RATE_PER_MINUTE"

pnpm exec convex deploy --yes
