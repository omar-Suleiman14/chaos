# Production monitoring

Chaos keeps production checks small and purposeful. There is no general
nightly monitoring suite and no model runs in the background.

## MCP synthetic check

`.github/workflows/mcp-synthetic.yml` runs after a successful production
deployment and can also be started manually. It uses `pnpm mcp:synthetic` to
check:

1. the deployed tool list and schemas against `lib/mcp/tool-schemas.json`;
2. authenticated reads through the real MCP transport;
3. an isolated create, read, delete and archive flow in the synthetic account;
4. p50/p75/p95 latency against `perf/baselines/mcp-synthetic.json`.

Setup:

| Name | Kind | Value |
|---|---|---|
| `MCP_SYNTHETIC_TOKEN` | secret | OAuth access token of a dedicated synthetic account with no real content |
| `PRODUCTION_MCP_URL` | variable | optional, defaults to `https://chaos.fail/mcp` |

The synthetic account uses private disposable content and never publishes it.

## Production health

`.github/workflows/production-health.yml` is manual while Chaos has low
traffic. Run it when investigating production health or before/after a
significant release.

`pnpm health:production` checks:

- PostHog journey p50/p75/p95 values and exceptions;
- the platform status feed from the production Convex site;
- thresholds in `perf/production-thresholds.json`.

Setup: `POSTHOG_PERSONAL_API_KEY` secret with read-only query scope,
`POSTHOG_API_HOST` and `POSTHOG_PROJECT_ID` variables, and optionally
`PRODUCTION_CONVEX_SITE_URL`.

When Chaos has enough real traffic that automated monitoring produces useful
signal, scheduled production-health checks can be reintroduced.
