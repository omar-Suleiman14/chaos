# Performance harness

Budgets for the surfaces people wait on: dashboard, forms, quizzes, lessons,
courses, Live, `/card` and MCP. Each budget is a number checked into
`perf/baselines`; CI fails when a change makes one worse.

```sh
pnpm perf            # Convex read budgets and client render budgets
pnpm build && pnpm perf:bundles   # first-load JavaScript per route
pnpm perf:css        # stylesheet cost census (perf/results/css-detail.md names offenders)
pnpm perf:check      # compare perf/results with perf/baselines
pnpm perf:ratchet    # after a genuine win: lower budgets, add new metrics
```

## What is measured

| Layer | Where | Measures |
|---|---|---|
| Convex | `perf/backend` | Documents read, index ranges, bytes read, bytes sent to the client, transactions and writes, using convex-test's own transaction accounting. Deterministic. |
| Client | `perf/client` | React commits, DOM mutations and handler work in jsdom. Deterministic counts. |
| Census | `perf/client/census.perf.test.tsx` | Components rendered (fiber census), Convex subscriptions and the largest single commit for the editor, the lesson player and Live, on mount, keystroke and server update. |
| Styles | `scripts/perf-css.ts` | Universal key selectors, global `:has()`, `transition: all`, layout-animating keyframes and transitions, backdrop filters, infinite animations without a reduced-motion guard. |
| Bundles | `scripts/perf-bundles.ts` | First-load JavaScript per route, raw and gzip, from `next build`. |
| Browser | `perf/browser` | Real journeys in Chromium against a deployed E2E environment. Timings; manual runs only. |
| Render | `perf/browser/render.spec.ts` | Per surface in Chromium: renders, rerender spikes, idle commits, Convex subscriptions, style recalculation, layout shift and animation frames. |
| Idle | `perf/browser/idle.spec.ts` | Dashboard, form editor and lesson editor left untouched for 20 s: mutations, actions, subscription churn and HTTP requests must be zero (polling and write loops). Server pushes are recorded. |
| Memory | `perf/browser/memory.spec.ts` | A large lesson and a large form editor opened and closed 6 times in one page: heap growth per cycle after GC, DOM nodes, window/document listeners and live Convex subscriptions must return to where they started. |

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
| `lesson.edit` | the lesson editor is mounted with its content |
| `quiz.question` | the first question can be answered (from Start) |
| `quiz.next` | the next question is on screen after an answer (from Next) |
| `live.join` | the joined player sees the game (from Join) |
| MCP → persisted | measured in the backend suite: the tool call's write is visible to the dashboard |

`perf/backend/journeys.perf.test.ts` budgets the Convex work each journey
needs. `perf/browser/journeys.spec.ts` times the same marks in Chromium through the manual
`Performance` workflow (`.github/workflows/perf.yml`); it runs against the E2E environment
only and needs `E2E_PERF_FORM_ID`, `E2E_PERF_COURSE_ID`, `E2E_PERF_LESSON_ID`,
`E2E_PERF_QUIZ_SHARE_ID` and `E2E_PERF_LIVE_PIN` repository variables (and
`E2E_PERF_GIANT_LESSON_ID`, a 500-block lesson, for the giant-lesson render) for the
content journeys. Missing fixtures skip a journey; they never fake one.

## Payload sizes

Bytes are ratcheted at three levels, each with a 1% band:

- Convex results per surface (`perf/backend/surfaces.perf.test.ts`): dashboard,
  form editor, quiz respondent, lesson editor and reader, course editor and
  public page, card, Live host and player (`*.payloadBytes`). Responses and
  analysis pages for large forms are in `largeForms`.
- MCP: the public and administrator `list_tools` responses and the largest
  single tool definition (`mcp.listToolsBytes`, `mcp.admin.listToolsBytes`,
  `mcp.largestToolBytes`), plus `search_forms` and `get_lesson` results.
- The wire, in Chromium (`render-browser`): websocket bytes Convex pushes to
  each surface while it loads and settles (`render.*.convexBytes`).

## Ratchets

- Counts must not grow at all. Bytes allow 1% for toolchain jitter. Timings allow
  30% and gate only scheduled runs.
- `pnpm perf:ratchet` only lowers budgets, and only when the win clears the
  noise band. It never raises one.
- Raising a budget is explicit: `tsx scripts/perf-ratchet.ts raise <metric> --reason "…"`.
  The reason is stored with the budget and shown in the PR summary.
- A budget whose metric disappears fails the check; deleting a measurement is
  not a way to pass.

## Protecting the harness

An optimisation is judged by the harness, so it must not also change the
harness. On every pull request, `pnpm perf:guard` runs inside the normal CI static-check job:

- fails when one change edits product code (`app`, `components`, `lib`,
  `convex`) and harness files (`perf/lib`, `perf/backend`, `perf/client`,
  `perf/browser`, `scripts/perf-*`, the perf configs and workflows) together,
  unless a reviewer adds the `perf-harness-change` label. Send harness changes
  in their own pull request;
- fails when a budget in `perf/baselines` goes up without
  `perf-ratchet raise --reason`, when a budget is removed, or when a suite's
  tolerance is widened. Lowering budgets is always fine.

`.github/CODEOWNERS` routes every harness, baseline and threshold file to the
maintainer for review.

## Render census

`perf/lib/fiberCensus.ts` registers as React's DevTools hook (production
builds support it too) and counts, per commit, the components that actually
rendered, the way the DevTools profiler does. Budgets:

- `census` (jsdom, gates PRs): the editor with 100 questions, a 60-block
  lesson and a Live phone. Mount, one keystroke, the autosave echo, an agent
  appending a lesson block, a second of the game clock, an unchanged server
  update. The lesson test also asserts that blocks already on screen are not
  rendered again when another block arrives.
- `render-browser` (Chromium, manual runs): dashboard, editor, `/card`,
  lesson, course, a Flow-theme quiz and Live. A test fails when layout shift
  exceeds 0.1 or React keeps committing while the page is idle; the elements
  that moved and the components in the biggest commit are in the test's
  annotations.

`perf/browser/instrument.ts` also samples animation frames: the main-thread
time from requestAnimationFrame to the end of that frame's style, layout and
paint, counted against 60 Hz (16.7 ms) and 120 Hz (8.3 ms) budgets.
Compositor-only animations (transform, opacity) barely register there.

## Streamed lesson blocks

Agents write lessons block by block (`add_lesson_blocks`), never token by
token, so the reader receives finished paragraphs, code blocks and tables. The
reader keeps each finished block's identity across updates
(`useSharedBlocks` in `components/learn/reader/BlockRenderer.tsx`), and block
bodies and block menus are memoized. Each new block renders once, and the
blocks before it are left alone. `census/lesson.appendBlock.*` holds this.

## Stylesheets

`pnpm perf:css` counts the patterns that make style recalculation and
animation expensive. Totals are budgeted like any count; the per-file detail
with examples is in `perf/results/css-detail.md`. Prefer class-qualified key
selectors to `.x *`; use explicit transition properties; animate
`transform` and `opacity` rather than size or position; give constant motion a
`prefers-reduced-motion` override.

## Reads and subscriptions

Budgeted per page and per editor, exactly (counts have no noise band):

- Reads: documents read, index ranges and bytes read per surface query
  (`*.documentsRead`, `*.databaseQueries`, `*.bytesRead`), and
  `*.readAmplification`, which is documents read per document returned ×10. A
  broad query that scans and filters in code shows up there even when its
  payload is small.
- Subscriptions: live subscriptions per surface in the census and in Chromium
  (`*.subscriptions`).
- Duplicate query patterns: the same function and arguments mounted by two
  components (`*.duplicateSubscriptions`), and one function held with several
  arguments at once (`*.sameFunctionManyArgs` in jsdom,
  `render.*.sameFunctionSubscriptions` in Chromium), where one query would often do.

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
ratchet.

`pnpm test:correctness` (`scripts/correctness.ts`) runs first in the deterministic
performance budget job: `tests/integration/correctnessGates.test.ts` states the three
failures end to end (every answer stored exactly while the owner edits; the
published form and lesson served while a newer draft exists; archived, deleted
and unpublished content gone), together with the reactivity, form integrity,
publication boundary, answer secrecy, device cache and draft recovery suites.
Its result goes to `perf/results/correctness.json`, so `pnpm perf:check` fails
on it like a regression, and the PR summary says "Correctness checks passed"
only when they did.

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

## Manual performance runs

Expensive performance suites run only when they are useful. Start
`.github/workflows/perf.yml` from the Actions tab and choose deterministic
budgets, browser measurements or both. The underlying commands remain
available locally, so removing scheduled CI does not remove any performance
coverage.

## Off the main thread

Web Workers are used only where profiling showed a long task. Measured on a
desktop (phones are several times slower):

| Operation | Before | Now |
|---|---|---|
| XLSX export, 5,000 × 40 | 207 ms | worker (`lib/exportFile.ts`); ~20 ms to copy rows |
| XLSX export, 20,000 × 40 | 2.4 s | worker; ~80 ms to copy rows |
| CSV / JSON export, 20,000 × 40 | 750 / 414 ms | worker |
| Docs search, per keystroke | 36–43 ms | 1 ms: entries tokenised once, not per key |
| Palette index, docs | 75–90 ms | 10–16 ms: ASCII fast path in `lib/search.ts` |

Search did not need a worker once the repeated work was gone. Lesson code
blocks are not syntax-highlighted and Markdown is not transformed on the
client, so there is nothing there to move.

## Real users

PostHog receives `journey_usable` (journey, ms, origin: `action` from a click
or `load` from navigation start) for every journey above, and `journey_step`
for funnels: `form.create` reports `first_edit` and `published` as time since
the click that created the draft. Errors arrive as `$exception`.
`scripts/production-health.ts` reads p50/p75/p95 per journey and the error
count from PostHog when the manual production-health workflow is run
(docs/production-monitoring.md).

## Loading states

Skeletons stay invisible for 200 ms (the `ws-skeleton-in` delay in app/workspace.css)
and then fade in, so a fast load shows no skeleton at all; a warm reload shows
the cached copy instead. `loading_state` (surface, ms, shown) and
`journey_usable` (journey, ms) events go to PostHog once it has loaded, so the
delay can be tuned from real load times rather than guesses.
