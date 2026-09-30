# Data migrations and old rows

Convex applies `convex/schema.ts` when you deploy. Every field added since the first release is
optional, so an old row is still valid and nothing has to be rewritten to keep working. The risk is
not a load failure. It is an old row being read the wrong way. This page lists what changed, how
old rows are read today, the two repair functions that exist, and how to go back.

Nothing in this repository runs a migration by itself, and none has been run against production.
Running one needs the owner's approval (see "Running a repair").

## What changed, by release

Kinds: **additive** (old rows are valid and behave as before), **interpretive** (old rows are valid
but the code decides what a missing value means), **destructive** (data is removed or rewritten).
No change so far is destructive.

| Release | Change | Kind | How an old row is read |
| --- | --- | --- | --- |
| 0.2 | `users.isElevated` was set on new users; plans replaced it (`plan`, `planExpiresAt`) | interpretive | `hasPro()` in `convex/authz.ts`: if `plan` is set it wins, otherwise `isElevated` still counts. A user with neither is on the free plan. |
| 0.2 | `questions.deletedAt` (soft delete) | interpretive | Every list and player read filters `deletedAt === undefined`. Old sessions that answered a removed question still show its text from the kept row. |
| 0.2 | `aiJobs.quizId` may point at a deleted quiz | additive | Nothing reads the id without checking it exists. |
| 0.3 | `quizzes.publishedSnapshot`, `publishedAt` (publish freezes a copy) | interpretive | No snapshot means the live questions are served. With a snapshot, players get the frozen copy. |
| 0.3 | `quizSessions.questionSnapshot` | additive | Grading and detail views use the snapshot when present, else the question row. |
| 0.3 | Multi-select answers stored as a comma-joined string | interpretive | Old answers are kept verbatim and shown as stored. When an option itself contains a comma the string cannot be split back reliably, so an old multi-select is never re-graded. Its stored `isCorrect` and `pointsEarned` stand. |
| 0.3 | Editor round-trip defect: multi-select and written questions saved as `mcq` | destructive by the old editor | Repaired by `migrations:repairQuestionTypes` (below). |
| 0.3 | Per-quiz settings (`displayMode`, `passingThreshold`, show/randomize flags) | additive | Cascade: quiz, then teacher settings, then global config, then the built-in default. |
| 0.4 | `quizzes.tags`, `groupName`, `poolSize`, `resultRelease`, `resultsReleasedAt` | additive | Missing means: no tags, no group, no pool, results shown immediately. |
| 0.4 | `quizSessions.status` and the `by_quizId_and_status_and_score` index | interpretive | See "Sessions without a status". |
| 0.4 | `users` usage counters, `usernameChosen`, suspension and ban fields | additive | Missing means none. |
| 1.0 | Forms: `forms`, `formVersions`, `formResponses`, `formAggregates` | additive | A 1.0 form has `schemaVersion: 1`, a minimal theme and no `quiz`, `translations` or logic. All of these are optional in the validators and read as "off". |
| 1.x | Form themes, slugs, embed, webhooks, integration tokens, collaborators | additive | New tables and optional fields only. |

Things the issues mention that do not exist in this codebase, so there is nothing to migrate:
revisions of quizzes (a form has `formVersions`; a classic quiz has one frozen snapshot),
collaboration roles on quizzes (a quiz has only `creatorId`; forms have `formCollaborators`),
recorded question ordering per session (a session records the answers it received; with
`questionSnapshot` it also records the questions). A pre-snapshot session has no record of what the
respondent saw beyond its answers. That is unchanged, and it is handled by reading the live question
rows (or "Deleted question" when a row is gone).

`quizzes.slug` is required. A quiz with no slug cannot be stored, but an empty string can, and an
empty slug is not a public route: the quiz is reachable only by id.

## Open-source cleanup compatibility (2026-09-30)

`formAccessGrants.accessCodeHash` is optional so existing rows still pass schema
validation. New grants bind to the current access-code hash. Older grants without
that field and grants for a previous code no longer unlock a form; respondents
must enter the current code again. No form definition or response is rewritten.

Newly completed classic quiz attempts with a question snapshot include unanswered
questions in their possible marks. Existing completed scores and pre-snapshot
attempts are kept as stored. Live-game attempts cannot be graded or completed
through the classic quiz respondent endpoints.

Deployments now require `CLERK_JWT_ISSUER_DOMAIN` to be set explicitly. Set it on
the intended Convex deployment before deploying these functions.

## Sessions without a status

Sessions saved before `status` existed have no status. Four reads only look at
`status: "completed"` through the index: the library counts and averages, results and the session
list, the leaderboard, and the 100-player limit for free owners. Those sessions were therefore
not counted. The MCP and integration summaries already treated a status-less session with
`completedAt` as completed, so the two sides disagreed.

`migrations:backfillSessionStatus` sets `status: "completed"` when `completedAt` exists and
`"in_progress"` otherwise. It changes nothing else.

## The repair functions (`convex/migrations.ts`)

Both are internal mutations, work one page at a time, take `dryRun`, and are idempotent.

- `migrations:backfillSessionStatus`
- `migrations:repairQuestionTypes`. Only two shapes are treated as corrupted, because they cannot
  be legitimate: an `mcq` with more than one `correctAnswers` and options becomes `multi_select`;
  an `mcq` or `true_false` with `keywords` and no options and no `correctAnswer` becomes `written`.
  Only `type` changes. `correctAnswer`, `correctAnswers`, `keywords` and options are kept. The
  frozen `publishedSnapshot` copy is repaired the same way. Anything ambiguous is left alone for a
  person to review (for example an `mcq` with keywords and options).

Arguments: `{ "dryRun": true, "batchSize": 100, "cursor": null }`. The result is
`{ scanned, changed, changedIds, isDone, continueCursor }`; repeat with `continueCursor` until
`isDone`.

### Running a repair

1. Take a backup (Convex dashboard, Settings, Backups) or `npx convex export`.
2. Run against a scratch deployment restored from that backup first, with `dryRun: true`, then for real.
3. Compare the scratch result with the tests in `tests/integration/legacyData.test.ts`.
4. Only with the owner's approval, run on production: dry run, read `changed` and `changedIds`, then the real run.
5. Run it a second time. `changed` must be 0.

## Rolling back

Convex has no automatic migration history, so the position for each repair is:

| Repair | What it wrote | Roll back |
| --- | --- | --- |
| `backfillSessionStatus` | `status` on rows that had none | Save `changedIds` from the run. To undo, patch those ids back to `status: undefined`. The app reads correctly either way; the counts simply return to excluding those sessions. Restoring from the backup taken in step 1 also works. |
| `repairQuestionTypes` | `type` on the listed questions and in `publishedSnapshot` | Save `changedIds`. To undo, patch those question ids back to `type: "mcq"`, and the `snapshot:` ids inside their quiz's `publishedSnapshot`. No answer data was removed, so this is lossless. |

A schema change that has already been deployed cannot be un-deployed against existing rows. If a
future field becomes required, ship it optional first, backfill, then tighten.

## Tests

- `tests/fixtures/legacyDataset.ts` holds the old-shape rows: users without plan fields,
  `isElevated` users, a soft-deleted question, corrupted questions, sessions with and without
  `status`, a frozen snapshot, an AI job pointing at a deleted quiz, an empty slug, partial teacher
  settings, and a 1.0 form with responses.
- `tests/integration/legacyData.test.ts` loads it, checks every read path, runs each repair
  (dry run, real run, second run, no data loss) and compares scores, public URLs and form data
  before and after.
- `tests/integration/formIntegrity.test.ts` covers form round trips, exports, concurrency and
  editing.

## Known limits

- The current behaviour when a published form is edited: responses keep the version they were
  answered on (`formResponses.version`), the inbox and detail views render them with that version's
  labels, and the spreadsheet export lists every question that any of the last 100 versions had.
  Unfinished responses are completed against the version they started on.
- Historical multi-select answers with commas in option text cannot be re-graded (see above).
- There is no fixture for production-scale data. Run the repairs on a copy of real data with the
  owner before any production run.
