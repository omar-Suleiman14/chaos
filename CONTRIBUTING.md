# Contributing to Chaos

Thanks for helping. This page covers how to set up, what we expect in a change, and how it gets merged.

## Before you start

- **Small fixes** (typos, clear bugs, docs): open a pull request directly.
- **Anything bigger** (a feature, a new dependency, a change to the data model or the public API): open an issue first so we can agree on the approach before you spend time on it.
- Security problems: do not open a public issue. See [`SECURITY.md`](./SECURITY.md).

By contributing you agree that your work is licensed under the project's license, [AGPL-3.0-or-later](./LICENSE), and you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Setup

Follow [Run it locally](./README.md#run-it-locally) in the README. `pnpm test` needs no accounts or keys, so you can run the test suite before configuring a backend or authentication provider.

## How the code is organised

- **`app/`**: Next.js routes. The workspace lives under `app/dashboard`, public forms under `app/f` and `app/[username]/[quizname]`, live games under `app/play` and `app/dashboard/live`.
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

Run these before opening a pull request. CI runs the same ones.

```bash
pnpm typecheck
pnpm lint        # 0 errors; warnings are allowed but don't add new ones
pnpm test
pnpm build
```

Check dependency advisories with `pnpm audit` and `pnpm audit --prod`. Report unresolved advisories and whether they affect runtime or development tooling; a successful build does not establish that dependencies are vulnerability-free.

## Pull requests

- Keep each pull request to one change, and link the issue it closes (`Closes #123`).
- Describe what you changed and how you checked it, including anything you could not check (for example, no real Clerk keys).
- Screenshots help for visual changes, ideally in both English and Arabic.
- A maintainer reviews every pull request. Changes to the public API, the data model or security-sensitive code get a closer look and may take longer.

## Issues

Use the templates: **Bug report** for something broken, **Feature request** for something new. For planned work the maintainers use the **Task** template, which lists the outcome, current state, acceptance criteria and how to verify it.
