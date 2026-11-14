# PR 18/33 — Server-Authoritative Exam Timing, Expiry & Protected Submission

Stacked on PR #394 (durable autosave), as a **draft, unmerged and undeployed** change. The public `examRuntime.startAttempt` mutation still throws `EXAM_NOT_READY`. The PR16 synthetic player is still synthetic; no real sealed questions, keys, results or private clinical media are exposed.

## Server clock and frozen policy

- `createExamAttemptTiming(settings, Date.now())` is the server-side initialization contract for the future authorized start transaction. It pins `deadlineAt` to the earlier of `startedAt + duration` and the scheduled release close, and freezes `requireAllAnswers`, `allowEarlySubmission` and `timeoutAction`.
- The minimum manual-submission time is **30 seconds after server start**, capped at the deadline; there is no browser-clock trust. If early submission is disabled, manual submission is blocked entirely and the configured timeout action finishes the attempt.
- Attempts missing the frozen clock/policy are **rejected**, not treated as unlimited-duration legacy attempts.
- Autosave now rejects writes after the frozen deadline even if the browser is asleep, offline or showing a stale countdown.
- For future live entry, the start transaction **must** create the timed attempt and call `internal.examSubmissions.armDeadlineInternal`. This registers `finalizeAtDeadline` in Convex Scheduler; deadline reconciliation is also available through student `expireDue`. The start hook is deliberately not connected until protected question delivery, quota enforcement and all authorization gates are implemented.
- A UI countdown can use `getStatus.serverNow` and `deadlineAt` for display; authoritative decisions are server mutations only.

## Explicit confirmation and durable receipts

1. `prepareSubmission` performs fresh candidate, release, snapshot, policy consent and enrollment checks. It checks minimum time, all-answers and early-submission policy, and returns a short-lived (at most 2 minutes) confirmation ID and answer counts.
2. The user must explicitly choose to confirm. `submit({ confirmed: true, confirmationId, expectedRevision })` repeats every check and compares an answer-revision stamp. Any intervening save invalidates the confirmation; expired or conflicting confirmations must be prepared again.
3. A successful submission atomically transitions the attempt and writes one immutable, answer-free `examSubmissionReceipts` record. A retry of the same confirmation returns the exact same receipt, never a second submission. Later answer writes are rejected.
4. On timeout, `timeoutAction=auto_submit` submits the saved answers (possibly incomplete), while `timeoutAction=expire` expires the attempt. A scheduled backend job or the candidate's idempotent `expireDue` mutation reconciles it. Student receipts remain accessible to the same signed-in candidate after finalization without returning marking keys, question content or answer payloads.
5. The legacy `closeAttemptInternal` primitive is retained for older lifecycle regression tests, but is not the protected student submission interface.

## Verification and rollout gates

Regression tests cover clock clipping and invalid clocks, 30-second minimum and required answers, disabled early submission, preliminary confirmations, autosave invalidation, replayed submission, candidate privacy, deadline writes, both timeout actions and idempotent receipts.

**Not enabled in this PR:** live student attempt creation, scheduler hookup from real entry, question/key-safe exam player delivery, private R2 media delivery, max-attempt quota enforcement, doctor verification, manual accessibility/RTL/mobile review, grading or results publication. Previously outstanding screenshot/accessibility checks remain blockers. No production migration, merge or deployment. PR 33 remains Approved-Student Course Chat through Chaos MCP with strict access checks.
