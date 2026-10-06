# Performance harness

Budgets for the surfaces people wait on: dashboard, forms, quizzes, lessons,
courses, Live, `/card` and MCP. Each budget is a number checked into
`perf/baselines`; CI fails when a change makes one worse.

```sh
pnpm perf            # Convex read budgets and client render budgets
pnpm build && pnpm perf:bundles   # first-load JavaScript per route
pnpm perf:check      # compare perf/results with perf/baselines
pnpm perf:ratchet    # after a genuine win: lower budgets, add new metrics
```

## What is measured

| Layer | Where | Measures |
|---|---|---|
| Convex | `perf/backend` | Documents read, index ranges, bytes read, bytes sent to the client, transactions and writes, using convex-test's own transaction accounting. Deterministic. |
| Client | `perf/client` | React commits, DOM mutations and handler work in jsdom. Deterministic counts. |
| Bundles | `scripts/perf-bundles.ts` | First-load JavaScript per route, raw and gzip, from `next build`. |
| Browser | `perf/browser` | Real journeys in Chromium against a deployed E2E environment. Timings; scheduled only. |

`perf/lib/fixtures.ts` seeds one fixed workspace (forms, quizzes, lessons, the
CNS course, a Live game with players, a card). Clock and randomness are pinned,
so two runs produce identical numbers.

## Ratchets

- Counts must not grow at all. Bytes allow 1% for toolchain jitter. Timings allow
  30% and gate only scheduled runs.
- `pnpm perf:ratchet` only lowers budgets, and only when the win clears the
  noise band. It never raises one.
- Raising a budget is explicit: `tsx scripts/perf-ratchet.ts raise <metric> --reason "…"`.
  The reason is stored with the budget and shown in the PR summary.
- A budget whose metric disappears fails the check; deleting a measurement is
  not a way to pass.

## Correctness before speed

A faster editor that loses answers, a faster publication that exposes drafts or
a cache that shows deleted content is a failure. Every perf suite asserts the
result is correct before recording a number, and a failed assertion fails the
ratchet. Correctness regressions live in `tests/integration` and run first.
