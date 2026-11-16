# PR 10/32 — Doctor Exam Builder: Syllabus Picker & Question Selection

Stacked on PR #386 (branch `feat/course-question-bank-lecture-tagging`). Draft only; do not merge or deploy without release review.

## What ships
- Teacher-facing entry point in the existing course editor, leading to `/dashboard/courses/[id]/exams` (English and Arabic, RTL-aware).
- Multiple private exam drafts per owned course, each with a title, total question target (1–100), revision and last-edited timestamp.
- Up to 30 syllabus allocations per draft, drawn from whole course, module, lecture or topic; each allocation has a question count and points-per-question (0.01–100).
- Owner-only coverage preview: source choices, counts of distinct ready bank items, row availability, selected counts, total distribution and overlap-aware feasibility.
- Paginated (30-at-a-time) candidate lists, manual selection, server-side validation, deterministic auto-fill, and selected-question review.
- Consistent source-of-truth: question bank items are never copied or modified in this PR. Config edits clear earlier selections; question edits or archival show as invalid until reselected.

## Security and correctness
- All reads and writes require an active account and **ownership** of both the course and exam draft. Course approval, enrollment, group membership and sharing do not grant access to bank questions, exam drafts or answer keys.
- Only ready questions with a currently valid scope link to the owned course are eligible; stale deleted module/lecture associations are ignored.
- Availability is counted by unique question IDs, not by tag-link count. The matching algorithm checks whether all requested allocations can be filled **without reusing a question**, even when topic and lecture pools overlap.
- Manual selection enforces distinct IDs, row membership, row caps, overall target, and optimistic revision checks. Auto-fill is all-or-nothing.
- Candidate and preview projections show prompts, types, reference revision and points, **never** answer keys, explanations or written-answer references.
- Course source scan is bounded at 1,001 links and explicitly fails above 1,000 rather than presenting incomplete counts.

## Intentionally not implemented
- No scheduled/published exam, no student-facing delivery, no invitations/audiences, no timers, submission, grading, result-release logic or immutable exam snapshots.
- Drafts reference current bank questions. A subsequent PR must freeze a **versioned answer-key and content snapshot** before exams can be assigned and served; do not treat a draft as a published exam.
- Doctor-role claims remain absent in the account model; ownership is the enforced authorization boundary pending a formal role policy.
- Inherited PR #378–#386 audit/release blockers, direct-link and MCP access reviews, and R2 production checks remain open.
- Preview scans up to 1,000 course-scope links; larger banks need a pagination/index design before lifting the cap.

## Validation
`tests/integration/examBuilder.test.ts` covers private reads/writes, candidate key isolation, duplicated links, overlapping allocations, distinct matching, mismatched scopes, cross-account question IDs, optimistic revisions, archived questions and draft deletion.

Before review, run `pnpm lint`, `pnpm typecheck`, `pnpm test:integration`, `pnpm test:unit`, `pnpm build`, and existing performance checks; CI passing is not permission to deploy.

## Next (PR 11/32)
Richer question-bank authoring, image-based clinical case questions, bulk import/export and editor usability. Keep exam content immutable/safe when later PRs add actual exam release.
