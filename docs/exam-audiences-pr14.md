# Chaos PR 14/32 — Approved course exam audiences and Due Exams

**Stacking:** PR #391 on #390. No merge or deployment. This is an assignment / metadata PR, not an attempt-runtime release.

## Doctor workflow

1. Select questions in the owned course exam draft, seal the immutable snapshot, save policies and mark the exam ready.
2. Publish the owning course. Doctor selects **all approved course students**, **specific approved students**, or **specific course groups**.
3. Save an explicit, revision-checked assignment; changing a setting or resealing a new snapshot invalidates existing assignment readiness.
4. The doctor can change or remove the assignment. No all-Chaos, guest, shared code or group-based course-admission bypass is supported.

## Student workflow

- A bilingual, responsive **Due Exams** page at `/dashboard/learn/exams` appears in Learn.
- Server-side list starts from the signed-in student's approved course-join requests, checks a matching authorized enrollment, active course publication, live group association and explicit assignment.
- The student receives only title, course name, question count, duration and scheduled window. Neither answer keys, case images, written rubrics, candidate lists nor private snapshots leave the server.
- Upcoming scheduled exams appear with dates; expired scheduled exams do not appear. No attempt-start button or unlock is exposed.

## Security and behavior

- All three assignment modes require a doctor-approved course enrollment; group membership *alone* never grants admission.
- Strict owner and course checks on all doctor mutations/reads; selected students must be approved and active, groups must be inside the exact course.
- Reassignment uses optimistic revision conflict protection; change/suspension/removal of course access takes effect on the next reactive read.
- The old `startAttempt` remains fail-closed; later PRs must add safe question delivery, preflight/consent, timer/quota enforcement, atomic starts and submissions before enabling student entry.
- Bounded indexed queries for due exam metadata. Large membership/course lists fail explicitly rather than silently pretending they are complete.
- Existing Forms, Quizzes, production examinations, and completed attempts are unchanged.

## Tests and release gates

- Integration tests: owner-only mutations, no guest/global audience, unpublished/unauthorized selection, revision conflicts, revocation/readmission, live groups, targeted students, unassignment, and settings invalidation.
- Unit tests: invalid or duplicated audience selections.
- Release blockers remain: formal doctor-role authorization, protected exam question/image delivery and private R2 retention, later runtime timing/consent/submission, audited MCP/course access, genuine screenshots and mobile/RTL accessibility review. No merge/deploy until reviewed and verified.
