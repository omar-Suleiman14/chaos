# PR 27/33 — Course assignments, gradebook, deadlines and outcomes

**Draft / no merge / no deployment.** Stacked directly on PR #403; no live student exam access changes.

## Delivery
- Teacher creates a **draft** assignment linked to a **published course lecture** or the **currently assigned sealed exam snapshot**. Source links must match the owning course and doctor.
- Revision-checked teacher publishing, unpublishing and archival with durable audit events. Server-validates localized open/deadline timestamps and title/outcome limits.
- Approved and actively enrolled students can see only their own published course tasks. Exam targeting honors the existing per-exam audience; withdrawn, revoked, suspended or cross-course accounts cannot list assignments.
- **One assignment at a time** doctor gradebook: approved roster, assignment completion/missed counts, current exam-final percentages, release-state visibility and optional learning-outcome label. A withheld percentage is never returned in the student projection.
- Lesson completion comes from the existing course enrollment completion record. Exam completion comes from submitted immutable attempts; final grades come from the existing controlled exam grade ledger. No parallel marking mechanism or invented grades.
- Initial bilingual teacher + student views and tests. Assignments do not grant access to any lesson, question, media link, result or exam attempt.

## Boundaries
- The student exam runtime remains feature-gated. Assignment creation is not an alternative exam-entry API.
- Gradebook reads are bounded to 80 approved members / 80 assignments, 20 attempts per student per exam. Larger courses require future pagination, not silent truncation.
- Student examination grades are visible **only** after existing publication rules and any doctor review holds clear. A teacher may see internal final percentages.
- Lesson-completion time currently uses the enrollment's last update timestamp as a coarse completion indicator. Fine-grained immutable completion timestamps and weighted cross-course analytics require a later migration.
- No file submissions, custom offline homework uploads, peer grading, notifications, bulk exports, teacher rubric overrides, or student appeal workflow changes in this PR.

## Verification and release
Run static analysis, TS, all unit/integration tests, Chromium editor tests and production/performance checks. UI screenshot workflow requires genuine EN/AR light/dark screenshots. Live teacher/student OAuth, direct-source/media/MCP negative tests and live staging QA remain release gates.

Rollback: leave feature routes unlinked or remove them and the new queries; new tables are isolated and do not mutate existing lesson, exam or grade rows. Do not delete data during an emergency rollback.
