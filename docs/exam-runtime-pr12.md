# Chaos PR 12/32 — Immutable Exam Snapshots & Attempt Lifecycle

Stacked on PR #388 (`feat/exam-rich-authoring-clinical-cases`). Draft and undeployed.

## Scope
- A single transactional `sealDraft` operation copies the exact selected **ready** bank question content, answer keys, choices, explanations, clinical case data, current question revision, image media ID/alt/MIME/byte length/ETag and allocation marks into an append-only sealed exam snapshot.
- Sealing requires owner account and active owned course, exact optimistic draft revision, exactly the target number of **distinct** eligible selections, all allocation rows filled, and current question and media authorization. Failure writes **nothing**. A repeated seal on the same revision returns the same immutable version. A later draft revision generates a new version (maximum 20 per draft).
- Immutable snapshots are separate from a small mutable release pointer; previous versions are never overwritten. Max size is 360,000 serialized question characters to keep a safe Convex document headroom.
- All answer-key and model-answer snapshot reads are **owner-only**; list views contain metadata only. Do not expose `getOwnerSnapshot` from student routes, public APIs or MCP.
- Version-bound `examAttempts` schema, single-attempt-per-snapshot/student lookup index, revision and terminal state machine, and an internal-only close transition. `getMyAttempt` returns only the student's own metadata and additionally rechecks course approval.
- **Fail-closed student entry:** `startAttempt` currently refuses all starts even for approved course members. No consumer may toggle `studentEntryEnabled` without the explicit audience policy in PR 14. Sealing is **not** publishing an exam to students.

## Non-goals and blockers
- Formal doctor roles are not available in the existing user model; current author authorization is active account + course/draft ownership. Doctor-role policy still blocks release.
- No exam scheduling, all/selected/group audience, Due Exams, student question delivery, autosave, grading, time expiry, consent, anti-cheat or results. These belong to later PRs.
- Clinical image bytes remain in private R2; the sealed image descriptor includes the verified ETag. Student authorization/proxy, immutable media pinning/GC and real-bucket end-to-end tests are required before image-based exams can be delivered.
- Inherited direct source/MCP/quiz access audits and genuine visual/screenshot gates remain release blockers. Existing production exams and quizzes are unchanged.

## Regression coverage
`tests/integration/examRuntime.test.ts` and `tests/unit/examAttemptState.test.ts` cover owner IDOR denial, no student answer-key reads, missing selections, atomic seal, revision/idempotency, source edits and archival, R2 metadata checks, fail-closed student starts and terminal attempt state transitions.

## Next
PR 13/32: Doctor exam settings (scheduling and availability, submission controls, pass threshold, result visibility). Keep all student entry off until PR 14 audience assignment.
