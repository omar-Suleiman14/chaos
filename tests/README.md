# Tests

Three layers, each with its own runner and reasons:

- **`tests/unit`** — Vitest + jsdom. Pure logic (`convex/aiQuiz.ts` parsing) and
  React component tests. Convex and Clerk are mocked at the module boundary;
  nothing here talks to a real backend. Run with `pnpm test:unit`.
- **`tests/integration`** — Vitest + `convex-test`, environment `edge-runtime`.
  Exercises real Convex query/mutation handlers (`convex/quizFunctions.ts`,
  etc.) against `convex-test`'s in-memory backend — no `CONVEX_DEPLOYMENT`
  needed. Run with `pnpm test:integration`.
- **`tests/e2e`** — Playwright, a real browser against a real running app.
  **Optional in CI**: it requires `pnpm dev` (or an already-running instance
  via `PLAYWRIGHT_BASE_URL`) backed by a real Convex deployment and a real
  Clerk instance, which the other two layers deliberately avoid needing. Run
  locally with `pnpm test:e2e`.

`pnpm test` runs `test:unit` and `test:integration` only — the suites that
work from a clean checkout with no credentials. `pnpm test:e2e` is separate
and is not part of `pnpm test` for that reason.

`tests/fixtures.ts` is the one place that defines a creator, a second
("rival") creator, an anonymous respondent name, and one question of each of
the four supported types (`mcq`, `true_false`, `multi_select`, `written`).
Import from there instead of inlining fixture data in a new test file.
