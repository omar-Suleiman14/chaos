# Chaos Exam Mode — PR 26/33: Doctor Review, Regrading & Appeals

Status: **DRAFT ONLY**, stacked on PR #402. No merge, production deploy, or student-exam activation.

## Boundaries

- Doctor-only `examDoctorReview.review` retrieves proposals submitted by the dedicated admin MCP grading connection. The authenticated course owner is checked against the job, submitted attempt, immutable snapshot, currently active release, course, and private grade.
- Doctor-only `decide` can **accept**, **override**, or **reject** each proposed essay mark. The administrator's proposal is never a student grade. Rejected proposals do not create a grade; an owner may use the existing manual marking flow. No automatic AI model invocation is introduced.
- Concurrency: every decision checks the job and existing mark revision. Replays/stale updates fail. Proposal state changes and doctor audit entries happen in one Convex transaction.
- Finalization continues to use `examEssayGrading.finalize`, which only accepts explicitly approved teacher marks for **every** pending written answer. No administrative proposal finalizes an attempt.
- All student-facing transcripts continue to honor frozen grading and publication rules.

## Appeal lifecycle

1. The signed-in candidate can file **one** appeal per submitted attempt, **only once an actual final result is released**; reason must be 20–2000 characters.
2. The owner sees the attempt-scoped, private appeal queue and can reject, uphold the original result, or mark the appeal adjusted **after a real regrade**. Appeal decisions require a doctor note and expected revision.
3. Regrading requires a finalized, approved written mark, owner identity, matching snapshot/course/grade records, and both grade and mark revisions. It recalculates the final total from exact integer cents. A regrade creates `reviewHold=true` and clears any old regrade-release timestamp **atomically with the score change**.
4. `resultStatus` withholds held results under **all** publication modes (manual, immediate, after-close); an existing result can no longer leak a stale or premature transcript.
5. After an appeal is resolved, the owner explicitly calls `releaseRegrade` with the expected grade revision and confirmation. For manual publication, a snapshot must also still be published. `regradeReleasedAt` makes the post-regrade approval explicit without re-publishing other students' results.
6. Student appeal status and doctor decision notes are visible only to the verified candidate for that attempt. Student APIs never expose rubrics, grading proposals, private evidence, answer keys, or internal mark ledgers.

## User interface

- Teacher: course Exams → Grading, then select pending or finalized written answers. Proposal evidence, confidence and status appear only in the owner review. Doctor can accept, override, reject, and separately regrade; held results require explicit release.
- Teacher: course Exams → Student Results to inspect appeals and decide them. Regrade an answer from the Grading screen before selecting “Confirm adjusted grade”.
- Candidate: Dashboard → Learn → Exams → My Results to file an appeal from a released result and inspect own appeal status. Arabic and English copy is included.

## Security review / known limitations

- No self-service second appeal (one per attempt); no automatic administrator rework loop after a doctor rejects a proposal. The doctor may regrade manually.
- No automatic notifications, AI model execution, student exam activation, or background auto-release is introduced.
- Existing draft stack must be merged **in order** and pass all inherited release checks. Specifically: genuine PR24 EN/AR light/dark screenshots, the live administrator OAuth grading-MCP smoke test, cross-course and R2/media/MCP access audits, and performance budgets.
- Test the manual, immediate, and after-close result modes, concurrent stale updates, cross-account appeals, grade calculation integrity, and visual/keyboard/mobile accessibility before production.

## Verification and rollback

Run `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm perf:check` and the existing screenshot workflows; do not report success unless the final PR head has a passing run.
- Rollback of client affordances: revert this PR and keep the prior PR25 doctor-review queue read-only; do not apply direct database deletions to financial/academic ledgers.
- Rollback of server contracts: first stop creating new appeals/regrades; preserve immutable audit/appeal rows for safe forward migration. A deployed grade under `reviewHold` must remain withheld until a verified doctor action clears it. Do not blindly reset holds.
- No merge or production deployment is authorized by PR creation or preview success.
