# Production monitoring

Scheduled GitHub Actions watch the deployed app. They compare numbers with
thresholds and open, update or close one GitHub issue per check
(`scripts/check-report.ts`). No model runs on a schedule. When an issue is
worth fixing, hand it to an agent yourself.

## MCP synthetic check

`.github/workflows/mcp-synthetic.yml` runs every 6 hours (`pnpm mcp:synthetic`):

1. `list_tools`: the deployed names and contracts (title, description,
   permission, annotations, input and output schema) must equal
   `lib/mcp/tool-schemas.json`. Drift between the repository and what ChatGPT
   or Claude is offered fails the run, with each tool's difference listed.
2. Authenticated reads: `get_my_card` and `list_folders`. The MCP client
   validates structured results against each tool's output schema.
3. Isolated write: a private draft lesson (`publish: false`) is created, read
   back, has its block deleted and is archived. If a step fails midway the
   lesson is archived anyway.
4. Latency: `/api/health`, `connect`, `list_tools` and every tool call, over 7
   rounds. p50/p75/p95 go to `perf/results/mcp-synthetic.json` and are compared
   with `perf/baselines/mcp-synthetic.json` (50% band). The first run proposes
   the budgets. Commit them with `pnpm perf:ratchet -- --suites mcp-synthetic`.

Setup:

| Name | Kind | Value |
|---|---|---|
| `MCP_SYNTHETIC_TOKEN` | secret | OAuth access token of a dedicated synthetic account with no real content |
| `PRODUCTION_MCP_URL` | variable | optional, defaults to `https://chaos.fail/mcp` |
| `STAGING_MCP_URL`, `STAGING_MCP_SYNTHETIC_TOKEN` | variable, secret | optional staging target |

The synthetic account collects archived lessons named "Synthetic check …".
They are private and never published.
