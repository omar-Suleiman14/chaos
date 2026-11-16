# PR 32/34 — Administrative performance engineering and release acceptance

**Draft only; stacked directly on PR #408 (PR 31). Do not merge or deploy.**

## Changes

- The Operations **Enrollment** and **Exams** paged queries now reuse an in-flight
  course-title lookup per distinct course within a single authorized request.
  Shared-course cohorts no longer issue one identical course read per row.
  The cache is discarded after the query, so changed/deleted course data and
  administrator revocation remain effective on the next request.
- The historical analytics scanner retains its existing **50-form page** and
  **2 MB read ceiling**, but overlaps up to **six** read-only per-form aggregation
  tasks instead of awaiting all count reads serially. It still uses the
  existing per-owner restriction memo. Results are folded in page order.
- Worker errors are awaited and then rethrown, causing the entire Convex
  mutation to fail. No incomplete aggregate is published as a completed
  history snapshot, and there is no new cross-transaction cache.
- Existing server authorization, pagination, data projections, supported
  languages, access permissions, billing exclusions and grading protections
  are unchanged.

## Reproducible checks

- `tests/unit/adminOperationsPerformance.test.ts` verifies title lookup reuse,
  request isolation, failure propagation, peak six-worker concurrency,
  order preservation and error settlement.
- `tests/integration/adminOperationsCohortPerformance.test.ts` builds 75
  enrollment records sharing a private course; it checks two separate 25-row
  pages, updated title visibility on a subsequent page, no private course
  description, and non-admin rejection.
- Prior admin analytics history, duplicate completion, retention and role
  revocation tests continue to run in CI.
- Expected CI commands: `pnpm typecheck`, `pnpm lint`,
  `pnpm test:unit`, `pnpm test:integration`, `pnpm build`,
  `pnpm perf` and `pnpm perf:check`.

The synthetic 75-enrollment regression is **not** a substitute for measuring
latency, read counts, or Convex limits against a realistic large dataset.

## Human release-acceptance matrix (not claimed as passed)

| Area | Acceptance evidence required |
| --- | --- |
| Admin permission | Real authenticated admin, non-admin, logged-out, suspended and newly revoked sessions; all six Operations panels and analytics history |
| Large cohorts | Dedicated staging dataset with many courses, owners, exams, submissions and form responses; capture Convex read sizes, query duration, scan completions and retries |
| Correctness | Compare sequential-versus-bounded scan totals for accounts, forms, responses, partials and published forms; force a count-read failure and confirm no false completed snapshot |
| Visual/RTL | Genuine browser captures of EN and AR, LTR and RTL, desktop/phone, light/dark for changes from earlier UI PRs; no fabricated screenshots |
| Accessibility | Keyboard tab/escape flows, tables and pagination announced correctly, readable errors and screen-reader labels |
| Auth/MCP/media | Validate course enrollment and revocation on the real OAuth connection and protected files, PDFs/images and MCP searches |
| Infrastructure | Valid Vercel preview (when the build-rate limit is lifted), app health, Convex deployment safety, rollback plan and monitoring |

Before release, attach observed data, screenshots, and results to the
individual dependent PRs. A passing mock/integration suite, this branch's
CI, or a locally prepared runbook **does not** authorize release.

## Scope

This PR does not enable student MCP chat (PR 33), PWA push notifications
(PR 34), billing, per-student activity analytics, or live deployment. It does
not increase any configured performance budget or change the performance
harness to hide regressions.
