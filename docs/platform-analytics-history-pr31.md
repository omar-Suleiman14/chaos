# PR 31/34 — Historical platform analytics and trend comparisons

**Draft only; stacked directly on PR #407 (PR 30). Do not merge or deploy.**

## What changes

- Existing `adminAnalytics.scan` remains the sole source of aggregate account, form and response totals. It already scans in bounded transactions and does not transmit individual answers to the admin UI.
- A completed scan now records an immutable **aggregate-only snapshot** in `adminMetricSnapshots` in the same transaction as its published `adminMetrics` result. Partial or aborted scans are never shown as complete.
- `adminAnalytics.history` returns at most **30** newest completed snapshots via the `by_completedAt` index, after checking current admin authorization on every request.
- A scan completion keeps at most 30 snapshots by removing the oldest one from the 31-row indexed window. This invariant is maintained for all newly created history; the existing overview continues working when history is empty.
- The Operations → Usage panel displays the completed snapshot history, a chronological table and signed changes versus the previous completed refresh. It supports Arabic/English labels, natural text direction, accessible table captions, loading and empty states.
- A refresh in progress continues showing the **previous completed** snapshot until the new run succeeds.

## Interpretation and privacy

These are **point-in-time totals**, not per-day activity, unique students, examination success rates, billing metrics, or revenue. A change between refreshes is not a daily growth rate; snapshots may be captured at irregular intervals. The recorded metrics inherit the existing scanner's definition of users, forms, responses, partial responses and restricted accounts; fields not currently populated by that scanner must not be marketed as observed activity.

Only numeric aggregates and completion timestamps are saved in history; **no account identifiers, student submissions, rubrics, answers, unpublished grades or private marking data** are added. Authorization is server-enforced and rechecked after revocation. No notification delivery or PWA push is included (PR 34).

## Verification

- Integration tests cover unauthenticated/non-admin refusal, immediate role revocation, newest-first bounded reads, atomic completion, 30-entry retention, stale-scan replay idempotence and aggregate-only output.
- GitHub CI must pass TypeScript, lint, unit/integration tests, build and performance budgets before review.
- Still required before merge: genuine browser screenshots, Arabic/RTL and keyboard/screen-reader inspection, live authorized/revoked admin sessions, large-dataset scan verification and Vercel preview when permitted.
- No production schema deployment, migration or analytics backfill has been performed. Existing deployments have **no historical data** until a new completed scan is run.

## Scope boundaries

This PR does not add paid analytics, billing/payment flows, owner admission powers, official grade changes, per-student learning telemetry, long-term time-series storage, or global real-time events. Performance engineering and release QA remain separate follow-up PRs.
