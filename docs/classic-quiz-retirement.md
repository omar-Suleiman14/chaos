# Retiring classic quizzes

Classic quizzes (the old quiz editor, its player at `/<username>/<slug>`, results and print
pages) are gone from the app. Quizzes are forms with quiz mode on. Existing classic quizzes are
converted into quiz forms by a one-time migration, `convex/classicQuizMigration.ts`, and then
deleted.

## What the migration does

It runs in three stages, each a chain of small scheduled batches. Every stage is safe to run
again: a quiz that was already converted is skipped.

1. **Convert.** Each classic quiz becomes a quiz form owned by the same creator, with the same
   title, description and group. Questions keep their order, text, options, answer keys, marks and
   explanations:

   | Classic question | Quiz form question |
   | --- | --- |
   | Multiple choice (`mcq`) | Single choice |
   | True or false | Single choice with *True* and *False* |
   | Multi-select | Multiple choice |
   | Written | Long text, not graded automatically (forms have no keyword grading) |

   Questions saved with the wrong type by the old editor are repaired first (see
   [migrations.md](migrations.md)). A published quiz is published as version 1 of the new form,
   if its questions pass the form checks; otherwise it stays a draft for the creator to finish.
   Archived quizzes become archived forms, and quizzes on admin hold stay held. Each conversion is
   recorded in `classicQuizConversions`.
2. **Repoint.** Everything that referred to a classic quiz now points at its quiz form: lesson quiz
   blocks (drafts, published versions and recovery copies), lessons' attached quizzes, course
   module assessments (draft and published), folders, and past live games.
3. **Purge.** The classic rows are deleted: quizzes, questions, attempts, fork snapshots and
   lineage, author-index rows, the classic quiz defaults (`teacherSettings`), and AI job links to
   quizzes.

### Not carried over

- Past attempts and scores on classic quizzes. Export results you want to keep before running it.
- Per-quiz player settings with no form equivalent: timers, question pools, hints, result release
  and pass marks. Form quiz settings start from their defaults.
- Written-answer keywords. Written questions are collected as long-text answers.

## Old links

`classicQuizConversions` is kept after the purge:

- `chaos.fail/<username>/<slug>` opens the quiz form the quiz became.
- `/dashboard/editor?id=<quiz>` and `/dashboard/results?id=<quiz>` open the form's editor and
  responses for its owner, and otherwise go to the library.
- The old username stays reserved, as it was while the quiz existed.

The integration API, webhooks and the MCP server only know forms now. A `quiz_<id>` reference
returns not found; an integration `kind: "quiz"` draft creates a quiz form.

## Running it

1. Deploy this release. The app no longer reads the classic tables, so nothing breaks while the
   migration has not run; classic quizzes are simply not shown.
2. Take a backup: Convex dashboard → Settings → Backups, or `npx convex export`.
3. Run it on a scratch deployment restored from the backup first and check the result.
4. With the owner's approval, run it on production:

   ```sh
   npx convex run classicQuizMigration:start
   npx convex run classicQuizMigration:status   # { quizzesLeft, conversions }
   ```

   It is done when `quizzesLeft` is 0 and the logs show `classicQuizMigration: done`.
5. In a later release, remove the classic tables (`quizzes`, `questions`, `quizSessions`,
   `teacherSettings`, `quizForkSnapshots`), their validators and the `"quiz"` asset kinds from the
   schema, and then remove `convex/classicQuizMigration.ts`. Keep `classicQuizConversions` for the
   old-link redirects.

## Rolling back

The purge deletes data, so the only way back is the backup from step 2. Before the purge stage
finishes, the converted forms and the classic rows exist side by side.
