# PR 23 — Human essay grading queue, frozen-rubric scoring and moderation

Stacked on draft PR #399. **Draft only; do not merge or deploy.** Secure student exam entry remains hard-disabled.

## Included
- Doctor-owned, bilingual written-answer queue, linked from the existing exam results view. Per-attempt progress and nonempty written questions only; result pagination is capped at 100 with an explicit truncation notice.
- Teacher-private response, prompt, approved reference and immutable rubric projection. No student-facing marking or answer-key API.
- Each criterion gets a whole-number 0–100 percentage, weighted by its frozen rubric percentage; final points use deterministic integer hundredths with rounding. Unrubriced legacy essays require an explicit bounded holistic score.
- Revision-guarded private drafts; submit for moderation; approve or return for changes; append-only decision/audit trail. **In this foundation only the course owner can both mark and moderate**—independent grading staff roles are future work.
- Finalization is one Convex transaction, only if all nonempty essay marks are approved. The original objective score is preserved, pending entries become scored, and a final percentage is computed. Retry or stale edits cannot silently overwrite a finalized grade.
- Existing results API continues withholding grades until finalization **and** frozen result-release policy permits visibility. Neither rubrics nor written responses are projected to students.

## Security and verification
- Active authenticated owner, course, snapshot, release, student and grade relationships are checked on each grading read/write. Direct attempt IDs do not grant access.
- No automated AI grades, no admin MCP grading jobs, no bulk export or role-based independent moderation; those require separate authorization/audit.
- Tests cover weighted scoring, rounding, invalid rubric submissions, stale versions, change requests, rejection of student access, denied early finalization, atomic sealing, student release, and audit ordering.
- Actual student exam entry, historical access/R2/MCP/legacy audit, release screenshots and Vercel preview remain blockers.
- Real screenshots of EN/AR, light/dark, desktop/mobile instructor UI and manual accessibility QA are required; never substitute synthetic evidence.
