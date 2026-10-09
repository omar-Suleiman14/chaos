# Performance workflow

Chaos keeps performance measurement available without running a permanent
benchmark lab in CI.

## The loop

1. **Keep pull requests correct.** Normal PR CI runs static checks, unit tests,
   integration tests and a production build. `pnpm perf:guard` also runs there
   so product changes cannot quietly weaken the performance harness or budgets.
2. **Measure when performance matters.** Run **Performance** from the Actions
   tab and choose `budgets`, `browser` or `all`. The deterministic budget
   suite covers Convex reads, rendering, stylesheets and bundles. The browser
   suite covers real journeys, keystrokes, render health, idle churn and memory
   against the dedicated E2E environment.
3. **Use production checks where they are useful.** The MCP synthetic runs
   after a successful production deployment and can also be run manually.
   Production telemetry is manual while Chaos has low traffic.
4. **Open an issue when there is evidence to act on.** Record the affected
   journey, the measurement, the expected outcome and how to reproduce it.
   Performance work should start from a measured problem, not a standing queue
   of optimisation tasks.
5. **Review the evidence.** Performance numbers can show a regression or an
   improvement; a person still decides whether the product tradeoff is worth
   making.

## Correctness before speed

A faster form editor that loses answers is a failure. So is a faster
publication that exposes drafts, or a faster cache that shows deleted content.
The deterministic performance run starts with `pnpm test:correctness`, and
normal integration tests protect those boundaries on every pull request.

## Human taste stays human

Automation can measure movement, payloads, waits, subscription counts and
memory. It does not decide whether a design is good. Visual and interaction
changes should be reviewed by a person. Run **Visual regression** manually when
pixel-level comparison is useful.

## Keeping the harness honest

The harness and its budgets are owned separately from product code.
`pnpm perf:guard` runs in normal PR CI. A pull request that changes product
code and the measurement harness together needs the `perf-harness-change`
label so the coupling is explicit and reviewed.
