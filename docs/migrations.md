# Data migrations and old rows

Convex applies `convex/schema.ts` when you deploy. Every field added since the first release is
optional, so an old row is still valid and nothing has to be rewritten to keep working. The risk is
not a load failure. It is an old row being read the wrong way. This page lists what changed, how
old rows are read today, the repair functions that exist, and how to go back.

Nothing in this repository runs a migration by itself, and none has been run against production.
Running one needs the owner's approval (see "Running a repair").

## What changed, by release

Kinds: **additive** (old rows are valid and behave as before), **interpretive** (old rows are valid
but the code decides what a missing value means), **destructive** (data is removed or rewritten).
The classic quiz retirement is the only destructive change (see below).

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
| 2026-10 | Classic quizzes retired: converted to quiz forms, then deleted | destructive | No app code reads `quizzes`, `questions`, `quizSessions`, `teacherSettings` or `quizForkSnapshots` any more. Run `classicQuizMigration:start` ([classic-quiz-retirement.md](classic-quiz-retirement.md)). The 0.2–0.4 rows above describe data that the retirement converts or deletes. |

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

Deployments require an explicit HTTPS issuer for the selected authentication
mode: `CLERK_JWT_ISSUER_DOMAIN` for Clerk, or `BETTER_AUTH_SECRET` and `CHAOS_APP_URL` with
`CHAOS_AUTH_PROVIDER=betterauth` for Better Auth. Set these on the intended Convex deployment
before deploying functions. Changing providers does not merge users by email.
Bind each verified replacement identity to its existing account before its
first login, as described in [self-hosting migration](./self-hosting.md#migrating-an-existing-installation).

## Business workspaces and CRM (2026-10-05)

Business adds separate `businessTeams`, `businessMembers`, `businessInvites`,
`businessShares` and `businessActivity` tables. No existing user, form, lesson,
course or folder record is rewritten. Existing Personal accounts stay Personal
until they explicitly create or join a Business workspace. Legacy plan fields and
direct collaborator/lesson permission rows remain valid and readable. New direct
collaborator grants require Business membership. Leaving a team does not remove
independent legacy grants.

The `folderMembers.by_asset` and `adminAudit.by_target` indexes are additive.
Folder and course sharing reuses existing membership/outline records and checks
team membership dynamically. Deploying the schema/functions enables the feature;
there is no backfill or production repair to run. Removing this feature from the
app leaves old records unchanged, but stops resolving the new team grants.

## Classic quiz retirement

`convex/classicQuizMigration.ts` converts every classic quiz to a quiz form, re-points everything
that referred to it, and deletes the classic rows. Before converting it repairs the two
unambiguous editor-corrupted question types (an `mcq` with several `correctAnswers` and options is
a multi-select question; an `mcq` or `true_false` with `keywords`, no options and no
`correctAnswer` is a written question). Steps, rollback and what is not carried over are in
[classic-quiz-retirement.md](classic-quiz-retirement.md). The earlier
`migrations:backfillSessionStatus` and `migrations:repairQuestionTypes` repairs were removed with
the classic quiz code.

## The repair functions

### Reserved usernames (`convex/links.ts`)

- `links:releaseReservedUsernames`. A username that later became a page address (for example
  `claude` or `chatgpt`, added with the integration pages) is moved to a generated `userNNNNN`
  name, marked not chosen so the person picks a new one, and the reserved name's alias is released.
  The account, its content and its `/f/` links are unchanged; custom links under the old name stop
  resolving because that path is now a page. Takes `{ "dryRun": true }` and returns
  `{ changed, changedIds }`. New accounts can never take a reserved name (`usernameProblem`).

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
| `releaseReservedUsernames` | `username`, `usernameChosen`, `cardOnboardingPending` on the listed users; deletes the reserved name's `usernameAliases` row | Save `changedIds` and their old usernames from the dry run. The old name cannot be given back while it is a page address. |
| `classicQuizMigration` | new quiz forms, re-pointed references, deleted classic rows | Restore the backup taken in step 1. See [classic-quiz-retirement.md](classic-quiz-retirement.md). |

A schema change that has already been deployed cannot be un-deployed against existing rows. If a
future field becomes required, ship it optional first, backfill, then tighten.

## Tests

- `tests/fixtures/legacyDataset.ts` holds the old-shape rows: users without plan fields,
  `isElevated` users, a soft-deleted question, corrupted questions, sessions with and without
  `status`, a frozen snapshot, an AI job pointing at a deleted quiz, an empty slug, partial teacher
  settings, and a 1.0 form with responses.
- `tests/integration/legacyData.test.ts` loads it, checks the schema still accepts every old
  shape, and checks 1.0-era forms in the library, public page, inbox, analysis and export.
- `tests/integration/classicQuizMigration.test.ts` runs the classic quiz retirement end to end.
- `tests/integration/formIntegrity.test.ts` covers form round trips, exports, concurrency and
  editing.

## Known limits

- The current behaviour when a published form is edited: responses keep the version they were
  answered on (`formResponses.version`), the inbox and detail views render them with that version's
  labels, and the spreadsheet export lists every question that any of the last 100 versions had.
  Unfinished responses are completed against the version they started on.
- There is no fixture for production-scale data. Run the repairs on a copy of real data with the
  owner before any production run.
