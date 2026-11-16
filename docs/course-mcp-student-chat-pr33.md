# Chaos PR 33/34 — Approved-student course chat over MCP

**Draft only; stacked directly on PR #409. Do not merge or deploy until the release gates are satisfied.**

## Student-facing MCP tools

1. `list_enrolled_courses` — page through published courses for which this authenticated student has **both** a teacher-approved request and signed-in enrollment. Empty pages can have a `nextCursor`.
2. `search_enrolled_course_lectures` — search title, description, and published block text within one approved course. Each call scans 1–15 **lectures** rather than 1–15 matches; follow `nextOffset` even when a page has no matches.
3. `get_enrolled_course_lecture` — read 1–10 published lecture blocks at a time with exact `courseId`, `lessonId`, `versionId`, `blockId` and `nextOffset`.

The connected ChatGPT/Claude client, not a background AI worker, writes explanations based on returned material. It must cite specific lecture/version/block identifiers, distinguish course statements from other knowledge, match the student's language (including Arabic), and acknowledge absent evidence. This PR is source-grounded **retrieval**, not a new hosted AI model, persistent chat log, or arbitrary file reader.

## Security model

A verified OAuth identity flows through the existing secret-protected MCP envelope. Clients cannot submit an alternative student identity in tool input. **Each page** checks the active account, doctor-reviewed approval, matching enrolled account, current live course publication, content moderation and visibility/team rules. Pending, withdrawn, rejected, suspended and removed requests; legacy guest rows; guessed lesson IDs; unrelated enrollments; archived/unpublished courses; and hidden content do not authorize access.

Each returned version is pinned to the live course publication, never the author's draft outline or unpublished edits. PDF/source bytes, quiz answer keys, private grading, rubrics and individual student response data are not returned. Revocation takes effect on subsequent reads; text already copied into external client conversation histories cannot be remotely deleted.

## Limits and release gates

- Course listing: 1–10 approval records per page; cursor continuation.
- Lecture search: 1–15 lectures scanned, 200-character query, offset up to 100.
- Lecture content: 1–10 blocks, offset up to 500.

Run unit, integration, static, browser and production-build checks. Verify real OAuth identity and immediate student revocation in preview; Arabic/RTL and accessibility; genuine screenshots for earlier PR UI changes; and realistic large-cohort performance. CI alone does not authorize merge or deployment.
