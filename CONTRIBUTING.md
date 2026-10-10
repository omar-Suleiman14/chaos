# Contributing to Chaos

Thanks for helping. This page covers how to set up, what we expect in a change, and how it gets merged.

## Before you start

- **Small fixes** (typos, clear bugs, docs): open a pull request directly.
- **Anything bigger** (a feature, a new dependency, a change to the data model or the public API): open an issue first so we can agree on the approach before you spend time on it.
- Security problems: do not open a public issue. See [`SECURITY.md`](./SECURITY.md).

By contributing you agree that your work is licensed under the project's license, [AGPL-3.0-or-later](./LICENSE), and you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Setup

Follow [Run it locally](./README.md#run-it-locally) in the README. `pnpm test` needs no accounts or keys, so you can run the test suite before configuring a backend or authentication provider.

Use Clerk or the [Better Auth setup](./docs/better-auth.md). Better Auth uses a local Convex component; regenerate its schema with `node scripts/generate-auth-schema.mjs` after auth dependency changes. Test both frontend modes and the real HTTP auth/OAuth handlers before changing authentication.

## How the code is organised

- **`app/`**: Next.js App Router routes. Localized pages live under `app/[lang]`: the dashboard is in `(app)/dashboard`, public form responses in `(app)/f/[shareId]`, player join screens in `(app)/play`, and public lessons/courses in `(app)/learn`. Marketing pages live in `(site)`; route groups do not appear in URLs. Live hosting and replay live under `(app)/dashboard/live`.
- **`components/`**: UI. `components/forms` holds the form renderer (what respondents see) and the builder (what creators edit).
- **`convex/`**: the backend. Read [`convex/README.md`](./convex/README.md) and the [authorization guide](./docs/security-authorization.md) before changing backend code. `schema.ts` and `formModel.ts` define the data. Creator functions check identity and role on the server (`authz.ts`); anonymous respondent functions validate publication, access settings and respondent capabilities.
- **`lib/`**: shared helpers, including the language layer (`i18n.tsx`, `locale.ts`) and the user guides (`lib/docs`).
- **`tests/`**: see [`tests/README.md`](./tests/README.md).

## Expectations for a change

- **Both languages.** Every user-facing string exists in English and Arabic: put it in a `const copy = { en, ar }` next to the component and read it with `useCopy` from `@/lib/i18n`. Use logical CSS (`margin-inline-start`, `ms-`/`me-` in Tailwind) so layouts work right to left.
- **Plain wording.** Short, concrete sentences. Say what a button does. No marketing filler.
- **Server-side rules.** Anything that matters for security or data (permissions, limits, validation, grading) is enforced in `convex/`, not only in the browser. Add a test that the wrong user is refused.
- **Tests.** Add or update tests for what you change: unit tests in `tests/unit`, Convex function tests in `tests/integration`.
- **Docs.** If people will notice the change, update the matching guide in both `lib/docs/content-en.ts` and `lib/docs/content-ar.ts` (same headings in both; a test checks this).
- **Schema changes are additive.** New fields are optional so existing data keeps working. If old rows need rewriting, add a migration and describe it in [`docs/migrations.md`](./docs/migrations.md).
- **Keep private artifacts local.** Do not commit credentials, real respondent data, personal deployment URLs, internal review notes or agent configuration. Public examples must use placeholders or synthetic fixtures.
- **Preserve existing content.** Retired generation services must stay retired. Existing lessons, questions, responses, scores and external-connector provenance must remain readable.

## Checks

Run these before opening a pull request. CI runs the same checks.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Check dependency advisories with `pnpm audit` and `pnpm audit --prod`. Report unresolved advisories and whether they affect runtime or development tooling; a successful build does not establish that dependencies are vulnerability-free.

## Pull requests

- Open pull requests against **`main`**. Work happens on short-lived branches; `main` should stay releasable.
- `main` is protected. Pull requests are squash-merged once Static checks, Unit tests, Integration tests and Production build pass and review conversations are resolved. The pull request title becomes the commit message, so write it as one, e.g. `fix: keep live answers after reconnect`.
- Pull requests that only touch Markdown docs or issue/PR templates skip the test and build jobs.
- Keep each pull request to one change, and link the issue it closes (`Closes #123`).
- Describe what you changed and how you checked it, including anything you could not check.
- **Every visible change needs screenshots in the pull request description.** Show each changed screen in English and Arabic, in light and dark appearance, at desktop and phone widths where they apply. Show motion with a short recording or before/after frames. The `PR screenshots` check fails when pages, components or styles change without an image in the description. Use the `no-visual-change` label only when those files change and nothing visible does.
- Changes to the public API, data model, authentication, authorization or other security-sensitive code get extra scrutiny.

## Issues

Use the templates: **Bug report** for something broken, **Feature request** for something new. For planned work the maintainers use the **Task** template, which lists the outcome, current state, acceptance criteria and how to verify it.

## Find planned work and report problems

The current roadmap lives in [GitHub issues](https://github.com/omar-Suleiman14/chaos/issues) and [milestones](https://github.com/omar-Suleiman14/chaos/milestones). Issues describe the outcome, current state, acceptance criteria and verification; pull requests link their issue.

Use the **Bug report** template for a reproducible problem, including browser, language, expected/actual behavior and a minimal example without real respondent data. Use **Feature request** for a desired outcome and who needs it. Use **Task** for agreed implementation work. Check existing issues first; link duplicates instead of opening parallel work. Security reports use the private reporting process in SECURITY.md.

After changing MCP registration, run `pnpm mcp:inventory`. CI checks the generated inventory and advertised count. Validate schema/auth/privacy changes with meaningful boundary tests and the complete user flow. Mark verification pending when an implementation is awaiting its agreed test pass.

### CI dependency installation and check isolation

The required CI jobs use `setup-node` with the pnpm store cache keyed by the lockfile and run `pnpm install --frozen-lockfile` on each independent GitHub-hosted runner. Each install reconstructs that runner's `node_modules`; sharing a runner would remove the current parallelism and isolation between static checks, unit tests, integration tests and the performance-gated build. Do not combine these jobs solely to remove repeated install commands. Revisit only with step-level install/cache measurements that show a material end-to-end saving while retaining the same required check names, gates, and independent test coverage.
