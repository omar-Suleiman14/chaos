# Performance harness

Budgets for the surfaces people wait on: dashboard, forms, quizzes, lessons,
courses, Live, `/card` and MCP. Each budget is a number checked into
`perf/baselines`; CI fails when a change makes one worse.

```sh
pnpm perf            # Convex read budgets and client render budgets
pnpm build && pnpm perf:bundles   # first-load JavaScript per route
pnpm perf:check      # compare perf/results with perf/baselines
pnpm perf:ratchet    # after a genuine win: lower budgets, add new metrics
```

## What is measured

| Layer | Where | Measures |
|---|---|---|
| Convex | `perf/backend` | Documents read, index ranges, bytes read, bytes sent to the client, transactions and writes, using convex-test's own transaction accounting. Deterministic. |
| Client | `perf/client` | React commits, DOM mutations and handler work in jsdom. Deterministic counts. |
| Bundles | `scripts/perf-bundles.ts` | First-load JavaScript per route, raw and gzip, from `next build`. |
| Browser | `perf/browser` | Real journeys in Chromium against a deployed E2E environment. Timings; scheduled only. |

`perf/lib/fixtures.ts` seeds one fixed workspace (forms, quizzes, lessons, the
CNS course, a Live game with players, a card). Clock and randomness are pinned,
so two runs produce identical numbers.

## Journeys

`lib/journeys.ts` names the moments people wait for and the app marks each one
itself (`performance.mark("chaos:usable:<journey>")`, duration in the mark's
detail):

| Journey | Usable when |
|---|---|
| `dashboard` | the library shows real items |
| `form.create` | a new draft's editor can be typed in (from the click) |
| `form.open` | an existing form's editor is loaded |
| `course.modules` | the module list renders (public page or editor) |
| `lesson.read` | the lesson reader is on screen |
| `quiz.question` | the first question can be answered (from Start) |
| `live.join` | the joined player sees the game (from Join) |
| MCP → persisted | measured in the backend suite: the tool call's write is visible to the dashboard |

`perf/backend/journeys.perf.test.ts` budgets the Convex work each journey
needs. `perf/browser/journeys.spec.ts` times the same marks in Chromium
(`.github/workflows/perf-journeys.yml`); it runs against the E2E environment
only and needs `E2E_PERF_FORM_ID`, `E2E_PERF_COURSE_ID`, `E2E_PERF_LESSON_ID`,
`E2E_PERF_QUIZ_SHARE_ID` and `E2E_PERF_LIVE_PIN` repository variables for the
content journeys. Missing fixtures skip a journey; they never fake one.

## Ratchets

- Counts must not grow at all. Bytes allow 1% for toolchain jitter. Timings allow
  30% and gate only scheduled runs.
- `pnpm perf:ratchet` only lowers budgets, and only when the win clears the
  noise band. It never raises one.
- Raising a budget is explicit: `tsx scripts/perf-ratchet.ts raise <metric> --reason "…"`.
  The reason is stored with the budget and shown in the PR summary.
- A budget whose metric disappears fails the check; deleting a measurement is
  not a way to pass.

## Subscriptions are correctness

Budgets count subscriptions and reads so that waste shows up, not so that
live data gets cut. Never drop or narrow a subscription only to improve a
metric: `tests/integration/reactivity.test.ts` checks that deletes, renames,
publications and archives reach every open view, and it must keep passing.
If a view needs the data, its subscription stays and the budget is raised
with a reason.

## Correctness before speed

A faster editor that loses answers, a faster publication that exposes drafts or
a cache that shows deleted content is a failure. Every perf suite asserts the
result is correct before recording a number, and a failed assertion fails the
ratchet. Correctness regressions live in `tests/integration` and run first.

## The workspace opens from the device

`lib/confirmedQuery.ts` keeps the last confirmed copy of the workspace's data
in localStorage, per account. A reload renders it at once, faded, with buttons
and fields disabled (links still work) until Convex confirms what is on screen;
the confirmed result then replaces the copy whole.

- `useConfirmedQuery(query, args)` for one query; `useConfirmed(name, value)`
  for a hook that combines several (the Learn hooks in `lib/learn/data.ts`).
- Copies only show inside `WorkspaceCache` (the dashboard layout). Public pages
  get live values only.
- A live result counts only after Convex has authenticated the visitor; until
  then Convex answers as a signed-out visitor and that answer is ignored.
- The last account is remembered with Clerk's `__client_uat` marker. After a
  sign-out or another person's sign-in the marker differs and nothing shows
  until Clerk names the account; a different account clears every copy.
- An inline script in `dashboard/layout.tsx` hides skeletons before hydration
  when a copy exists, so a warm reload goes from blank to content.
- Sidebar destinations prefetch their whole page (`IntentLink eager`), so
  switching pages does not stop at the loading skeleton.
