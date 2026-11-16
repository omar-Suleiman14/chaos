# Chaos PR 13/32 — Doctor Exam Settings & Scheduling

Stacked directly on PR #389 (`feat/exam-immutable-snapshots-attempt-lifecycle`). Draft, not merged or deployed.

## Scope
- Doctor-owned, bilingual course exam settings panel in the existing exam builder. Doctors can seal a completed draft snapshot, configure a release and mark it **ready for audience assignment**.
- Persisted, revision-checked **release policy** separate from immutable question snapshots: anytime vs UTC-epoch scheduled opens/closes, duration 1–480 minutes, 1–3 attempts, answer-completion requirement, early submission, saved-answer auto-submit or expiry on timeout, pass threshold (0–100%), immediate/after-close/manual results, and post-release correct-answer/explanation visibility.
- Scheduled windows require an opening time before a future close, max 366 days, with no after-close result mode for an anytime exam. The editor accepts device-local time and stores UTC milliseconds. Backend validates every submitted policy.
- Owner-only reading/writing, active account and course ownership, restricted-account denial, optimistic revision conflicts, and readiness invalidation after changes or resealing.
- Existing runtime `studentEntryEnabled` stays **false**. The readiness flag is *not* a student permission. Even a prepared release remains inaccessible: `startAttempt` continues to reject all attempts.
- Existing production quizzes/exams untouched. No pricing or payments.

## Implementation boundaries
PR 14 must add approved-course student audience selection (all approved course students / named selected students / selected course groups), Due Exams and authorization checks **before** setting student entry to true. Later PRs must actually enforce these stored settings in entry, timer, submission, grading and result endpoints. The existence of a configured value does not make that runtime behavior functional.

Formal doctor-role permissions, real private R2 media pinning/retention validation, broader inherited course/MCP content authorization, and earlier visual checks remain release blockers.

## Tests
`tests/unit/examSettingsModel.test.ts`: invalid duration, attempts, score precision, schedule and after-close combinations.

`tests/integration/examSettings.test.ts`: doctor-only policy reads/writes, required snapshot, revision conflict, schedule validation, readiness reset, stale reseal and **fail-closed student start**.

## Next
PR 14/32: approved-course exam audiences, assignments and Due Exams. Do not permit public Chaos users or guests; membership approval is necessary but not sufficient.
