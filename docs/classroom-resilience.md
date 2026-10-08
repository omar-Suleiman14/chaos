# Classroom reliability and teaching tools

## Phone updates

New live rooms store a small `livePhoneStates` projection and one `liveQuestions`
row per question. `playerView` reads that projection, its own player/answer, and
only the current question. It never reads the large game snapshot for a new room.
Every host transition and settings mutation updates the projection in the same
transaction. Join counters, answer counters and result saving do not update it.
Existing rooms use the original reader until their next host transition initializes
these rows. Answer keys remain server-only until reveal.

## Device answer recovery

Quiz answers and written drafts are backed up in localStorage. A pending answer is
written before the mutation starts. Refreshing offers **Resume saved quiz**, which
loads the original server snapshot and recorded answers for the same attempt;
pool question order is retained. **Saving**, **Saved**, and **Saved on this device ·
waiting to send** distinguish a server acknowledgment from a local backup. Disabled
or full storage shows **Device backup unavailable**. Completion clears the backup.

Live answers are also written before sending, bound to the game, question and
private player token. Refresh/reconnect retries the same pending answer while that
question remains open. A closed question shows a clear failure rather than silently
claiming the answer was saved. Offline answer times never override the server clock
or extend a deadline. A timeout cannot overwrite an answer waiting for retry.

Answers received in less than 500 ms get a private `too_fast` review flag. The server
measures that time; client-reported times are ignored. Flags never change marks.
Legacy attempts without recorded timing are not retroactively flagged.

## Rehearsal and release testing

Choose **Rehearse** next to a published quiz in Games. This creates a separate,
host-private room with the same engine, clock, scoring and phone query as a live
game. Add simulated students, then use the ordinary Start/Next controls. Practice
joins create no student-roster entries, and practice completion creates no responses,
attempts or completion webhooks. Ordinary player caps still apply. The browser
harness supports up to 300 phones per run and uses ten concurrent joins.

**Chaos mode** injects missed answers, delayed sends beyond the deadline and duplicate
retries. Each simulated phone has a unique private token and its own query
subscription. Stopping or leaving cancels pending timers and subscriptions. Start a
new rehearsal to add a fresh cohort after stopping.

The browser and the release test use `lib/liveRehearsal.ts`. The integration adapter
runs 50 simulated phones through the real Convex handlers and verifies answer
counts, reveal, score ledgers and result isolation. Run without deployment credentials:

```sh
pnpm exec vitest run --config vitest.integration.config.mts tests/integration/classroomResilience.test.ts tests/integration/liveReleaseReview.test.ts
pnpm exec vitest run --config vitest.unit.config.mts tests/unit/classroomResilience.test.ts tests/unit/playerScreen.test.tsx tests/unit/quizStartButton.test.tsx
```

The existing 500-player release regression remains part of the integration suite.
Synthetic timing is a regression check; deployment latency still needs a rehearsal
against the release environment.

## Teacher views

Quiz results offer **Question quality & version history**. The detective uses the
latest 200 completed attempts, separates question editions, and reports correctness,
median answer time, most common wrong choice, and review counts. Small cohorts are
marked as insufficient; difficulty and easy-question signals need ten observations,
and high/low cohort discrimination needs twenty and distinct score groups. Missing
answer times remain missing. Form timings currently come from live games only.

Form version comparisons use up to 30 immutable published editions. Classic quiz
comparisons use up to 30 distinct attempt snapshots, including prompts, options,
answer keys, marks and timers. Pool draws are explicitly labelled as snapshots,
since a different draw does not necessarily mean a different published version.
Historical attempts without snapshots are disclosed and excluded. These queries
use existing teacher/viewer authorization and expose no student names or raw
written answers.

Ended games offer **Replay classroom**. Scrub each played question, watch answers
arrive, and choose one student's ghost. New rooms record round clocks and scores
in separate tables, so replay awards points at reveal, exactly as the live engine
does. A game stopped before reveal awards no round points. Replay queries read one
round's answers and two score ledgers, rather than every student's entire history.
Older games reconstruct saved answer timing with an estimated reveal time and a
clearly labelled sample of at most 100 players. Replay is host-only and read-only.

## Interface

The teacher tools follow Apple's patterns in Chaos colours (screenshots in
`docs/screenshots/apple-polish/`):

- **Classroom time machine** (`/dashboard/live/<game>/replay`) works like Time Machine.
  The current question is the front window, and earlier questions recede behind it.
  The timeline on the trailing edge, the up/down arrows and the ↑/↓ keys move between
  questions. Inside a question, play or scrub through a waveform of answer arrivals.
  The leaderboard re-sorts at the reveal. Media controls stay left to right in Arabic.
- **Ghost replay** follows one student: their answer, rank and score, and a marker on
  the scrubber.
- **Version history** works like Preview's "Browse All Versions": the current version
  on one side, earlier versions stacked behind on the other, with a date timeline.
  Changed, added and removed questions, options, marks and answer keys are marked.
  On phones a segmented control switches between the two sides.
- **Question detective** is an inset grouped list sorted by what needs attention, each
  with a plain-language reason.
- **Rehearsal classroom** uses an iOS stepper, a switch and live result tiles.
- **Saving status** is one capsule shared by quizzes and live phones. "Saved" folds to
  a tick, and states that need attention keep their words.
