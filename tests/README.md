# Tests

Three layers, each with its own runner and reasons:

- **`tests/unit`** — Vitest + jsdom. Pure logic and
  React component tests. Convex and Clerk are mocked at the module boundary;
  nothing here talks to a real backend. Run with `pnpm test:unit`.
- **`tests/integration`** — Vitest + `convex-test`, environment `edge-runtime`.
  Exercises real Convex query/mutation handlers (`convex/quizFunctions.ts`,
  etc.) against `convex-test`'s in-memory backend — no `CONVEX_DEPLOYMENT`
  needed. Run with `pnpm test:integration`.
- **`tests/e2e`** — Playwright, a real browser against a real running app.
  **Optional in CI**: it requires `pnpm dev` (or an already-running instance
  via `PLAYWRIGHT_BASE_URL`) backed by a real Convex deployment and a real
  Clerk or Better Auth instance, which the other layers deliberately avoid needing.
  The creator smoke supports both providers; a passing unit suite does not verify
  a live provider deployment. Run
  locally with `pnpm test:e2e`.

`pnpm test` runs `test:unit` and `test:integration` only — the suites that
work from a clean checkout with no credentials. `pnpm test:e2e` is separate
and is not part of `pnpm test` for that reason.

`tests/fixtures.ts` is the one place that defines a creator, a second
("rival") creator, an anonymous respondent name, and one question of each of
the four supported types (`mcq`, `true_false`, `multi_select`, `written`).
Import from there instead of inlining fixture data in a new test file.

## Core creator/respondent smoke

`core-production-smoke.spec.ts` covers the production-shaped path in one test:
creator sign-in, quiz creation/editing/settings, publication, a fresh anonymous
respondent browser context, scoring, creator results/analytics, CSV export, and
reopening/editing/saving the quiz.

Set these environment variables before running it:

- `PLAYWRIGHT_BASE_URL`: URL of the deployed E2E app.
- `E2E_CONVEX_ENV`: marker naming the dedicated non-production Convex target
  (for example `e2e` or `staging`).
- `E2E_AUTH_PROVIDER`: `clerk` (default) or `betterauth` for the Chaos Better Auth email/password page.
- `E2E_CREATOR_EMAIL`: dedicated test-user email.
- `E2E_CREATOR_PASSWORD`: test-user password. Use a dedicated account
  without MFA for this automated flow.

Run exactly:

```sh
pnpm test:e2e -- tests/e2e/core-production-smoke.spec.ts
```

The spec refuses `chaos.fail` and `www.chaos.fail`, and rejects a Convex marker
named `prod` or `production`, by default. `E2E_ALLOW_PRODUCTION=true` is the
explicit emergency override and is intentionally absent from the GitHub Actions
workflow. `.github/workflows/e2e-smoke.yml` is manual-only, so this smoke test
does not run blindly on every pull request. Configure its four referenced
repository secrets with the same dedicated E2E target and test user. Set the
repository variable `E2E_AUTH_PROVIDER=betterauth` for Better Auth; default is Clerk.

AI retirement coverage lives in `tests/integration/aiRetirement.test.ts`: stale public/internal calls fail without provider requests or writes, while legacy content and results remain readable.

## Embedding

`embed.spec.ts` frames the app from a fake third-party page served by Playwright. Its first test needs only the running app (creator and app routes must refuse the frame). The second completes a response inside the frame and needs a real deployment plus `E2E_EMBED_SHARE_ID`: a published form with one required short-text question, access "Anyone", embedding allowed for `https://embedder.test`.

## MCP

`tests/integration/mcpRegression.test.ts` drives the real MCP server against the
real Convex endpoint (`/api/mcp/v1`) of a convex-test deployment, the way
`app/mcp/route.ts` does in production: tool listing, auth and permission grants,
then create, update, publish, attach, archive and course/module operations. It
needs no credentials, so it runs in CI with `pnpm test`.

`tests/integration/mcpErrors.test.ts` checks that each kind of failure reaches the
assistant with a code and a category (`validation`, `permission`, `ownership`,
`not_found`, `revision_conflict`, `publication`, `internal`, …) and a recovery
hint, both in the text and in `_meta["chaos/error"]` (`lib/mcp/errors.ts`). Only
genuine faults may come back as `internal`.

`lib/mcp/tool-schemas.json` is a snapshot of every tool a client is offered:
title, description, permission, annotations and input and output schemas.
`pnpm mcp:inventory:check` (a CI step) fails when the registry differs from it and
lists the tools that were added, removed or changed. Run `pnpm mcp:inventory` and
commit the result when a change is intended.

## Large lessons

`tests/integration/largeLessons.test.ts` uses `largeLessonBlocks` from
`perf/lib/content.ts`: lessons mixing paragraphs, images, videos, diagrams,
tables, flashcards, quiz embeds and toggles, with real image, flashcard and quiz
references (`seedLessonRefs`). A 500-block lesson (the limit) and one near the
300 KB document limit must save, publish and read back whole; 2,000 and 10,000
blocks must be refused with a validation error, through the app and through MCP,
without writing anything.
