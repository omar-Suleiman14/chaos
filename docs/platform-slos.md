# Platform observability foundation

This is an instrumentation and status policy, not an availability certification. No production measurements or load-test claims are implied.

## Parent integration

Spread `observabilityTables` from `convex/observabilityModel.ts` into the application schema. Run normal codegen after integration. Wrap trusted HTTP handlers with `observeHttp(ctx, "integration-api", () => handler(ctx, request))` from `lib/backendTelemetry.ts`; keep the service name server-selected. The callback is plain code, not a registered HTTP action invoked as a function. Mount a public GET status route that calls `observability:publicStatus` and returns only its validated result. Add an internal cron for `observability:prune`; repeat on `more: true` in bounded invocations. No schema, HTTP router or cron is changed by this module.

## Measurement policy

Services supported: submissions, integration-api, mcp, source-files, learn-reads, search, ai and webhooks. `observed` is true only when actual recent recorder data exists. Consumers should advertise only observed services or services with an explicit incident; an uninstrumented service is never operational by default. Native database queries need an action/HTTP observation boundary; this helper does not automatically instrument them. AI is a reserved service name, not evidence of an enabled AI feature.

Each completed observation writes one internal mutation to one of 16 randomly chosen hourly shards. Only service, server hour, counters and seven latency bucket counts are retained. No URL, payload, token, identity, source content, exception or response body is stored. Buckets end at 100, 300, 1000, 3000, 10000 and 60000 ms, with an overflow bucket. Clock time comes from the server. HTTP 5xx and thrown exceptions count as failures; 4xx count separately and remain in the denominator. This is request success, not proof of dependency health or correctness. Telemetry failure preserves the business result and emits a fixed diagnostic warning. Recording adds a mutation to each request; monitor its cost and contention before scaling, and sample if necessary with an explicit revised policy.

The public window includes the previous full UTC hour and the current partial hour. Below 20 observations the measured state is unknown. More than 20% failed requests produces outage; more than 1% failure or more than 5% latency above 1000 ms produces degraded; otherwise it is operational. These thresholds are a provisional diagnostic policy. A separate rolling 30-day SLO should target 99% successful requests and 95% latency at or below 1000 ms, with exclusions and service-specific targets agreed before any contractual claim. No alert delivery or paging integration is included; wire alerts to an operator-owned channel separately.

## Incidents, privacy and retention

Active administrators create append-only status overrides with a private reason, actor, public summary and expiration (1 minute to 7 days). The newest record supersedes earlier records even after it expires; earlier overrides never resurrect. Restoration is a new operational override with a reason. Administrators must write summaries suitable for public disclosure. The feed exposes no raw counters, shard IDs, reasons or administrator identities. Incident audit records are retained; define an organization/legal retention policy before deleting them.

Metric retention is 30 days. Pruning removes at most 200 expired rows per call, reports whether more remain, and leaves current metrics intact. Scheduled pruning and HTTP instrumentation must be wired and verified before roadmap 145/146 can be marked operationally complete. Security tests exercise public privacy, admin authorization, telemetry failure isolation and retention locally; they do not certify production SLO attainment.
