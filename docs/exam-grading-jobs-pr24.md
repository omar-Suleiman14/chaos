# PR 24 — Doctor-assisted grading requests and durable admin queue

Stacked on PR #400, draft-only and default-off for live examinations.

- Doctor explicitly confirms limited access and requests assistance per pending submitted attempt.
- Server checks owner, course, active immutable exam snapshot, attempt, grade, pending written question, and live account status.
- One durable Convex job per attempt with stable idempotency key and revision-checked transitions; no auto-run model calls.
- Admin-only metadata queue and 15-minute exclusive claims; expired claims may be retried at most 3 times. No student essays or private rubrics in metadata listings.
- Audit records for request, claim and retry. Claim expiry and retries do not change the grade ledger.
- Bilingual (EN/AR) request control in teacher's existing essay grading screen; inline job state.
- PR 25 introduces scoped admin MCP bundle reads and **proposals only**. PR 26 adds doctor approval and regrading safeguards.

## Required verification and rollout
Run static/lint/typecheck, integration/unit, Chromium, production build, 268 unchanged performance budgets and authentic EN/AR light/dark desktop/mobile screenshots. Audit all actor/claim expiry/race/idempotency paths. Verify no student answer access from the admin list or without an active claim. Deploy nothing until inherited course/R2/MCP and visual/security gates are closed.

**Not implemented:** push notifications, admin-facing UI, AI execution, human approval of proposals, published grades, live exam entry. No merges/deployments.
