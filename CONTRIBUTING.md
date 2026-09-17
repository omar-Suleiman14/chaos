# Contributing to Chaos

## License

Chaos is licensed under the [GNU Affero General Public License v3.0 or
later](./LICENSE) (AGPL-3.0-or-later). By submitting a contribution, you
agree it is licensed under the same terms as the rest of the project. See
[#7](https://github.com/omar-Suleiman14/chaos/issues/7) for how that
decision was made.

## Setup

See the [Development setup](./README.md#development-setup) section of the
README — it isn't repeated here.

## Architecture

- **`app/`** — Next.js App Router. Route segments are the pages: the
  creator dashboard (`app/dashboard/*`), the anonymous respondent player
  (`app/[username]/[quizname]`), printing (`app/print/[quizId]`) and admin
  tools (`app/admin`).
- **`components/`** — shared UI, including the shadcn-derived primitives
  under `components/ui/`.
- **`convex/`** — the backend. `quizFunctions.ts` is the core module: users,
  quizzes, questions, sessions, grading and settings all live there today.
  `aiQuiz.ts`, `aiEditorChat.ts` and `aiQuizMutations.ts` are the AI surface
  — generation, chat-based editing, and the mutations that persist
  AI-produced content, respectively. `schema.ts` is the single source of
  truth for the data model.
- **`lib/`** — browser-only helpers with no Convex dependency: `haptics.ts`,
  `sfx.ts`, `sounds.ts`, `utils.ts`.
- **`tests/`** — see [`tests/README.md`](./tests/README.md) for how unit,
  integration and e2e tests are organized.

## Conventions

- **ESLint** (`eslint.config.mjs`): Next.js core-web-vitals + TypeScript
  rules, plus `@convex-dev/eslint-plugin`'s recommended set. Two rules are
  deliberately relaxed from their defaults:
  `react-hooks/set-state-in-effect` is off (it breaks typical Next.js
  hydration/mount patterns used throughout this codebase), and
  `@typescript-eslint/no-explicit-any` is a warning, not an error, to allow
  incremental typing improvements without blocking builds.
- **Prettier** (`.prettierrc`): no overrides — Prettier's defaults apply as-is.
- **Commit messages**: no convention is enforced today (recent history
  includes single-word messages like `button`, `error`, `lola`). If you want
  one adopted project-wide, propose it in an issue rather than assuming
  Conventional Commits or any other specific style is expected.

## Testing

```bash
pnpm test        # unit + integration — no credentials required
pnpm test:e2e     # Playwright, needs `pnpm dev` running against real Convex/Clerk
pnpm typecheck
pnpm lint
```

See [`tests/README.md`](./tests/README.md) for what each layer covers and
where to add a new test.

## What an issue should contain

This repository's issues consistently follow one structure — see
[`.github/ISSUE_TEMPLATE/task.md`](./.github/ISSUE_TEMPLATE/task.md) for the
template: **Outcome** (the observable result), **Current state** (what's
true at HEAD today, with real file/line references — this is what makes an
issue verifiable rather than aspirational), **Work**, **Non-goals**,
**Acceptance criteria** (a checklist), and **Verification** (automated and
manual). Match this shape when filing a new issue.

## Pull request expectations

- Reference the issue it closes (`Closes #N`) — see
  [`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md).
- Before opening, inspect current HEAD rather than assuming the issue's
  "Current state" section is still accurate — if the issue turns out to
  already be satisfied or has become wrong, say so instead of writing
  duplicate or contradictory code.
- State plainly what you verified and how, including what you could not
  verify (e.g. no live Convex/Clerk credentials in your environment) rather
  than checking boxes you didn't actually run.

## Model authority policy

Every issue in this repository ends with the same workflow footer: set
Status to **In progress** before starting, inspect current HEAD before
writing code, and stop at **Review** with a pull request linked to the
issue. **Only Astra merges pull requests, closes release parent issues, or
performs release actions** — no other contributor or model does these,
regardless of how complete the work looks. Issues also carry a **Recommended
model** label (Astra, Opus, Sol or Terra) reflecting the judgment the work
needs — cross-cutting architecture and anything requiring owner approval
(like [#7](https://github.com/omar-Suleiman14/chaos/issues/7)) goes to
Astra; substantial well-scoped work to Opus or Sol; narrow, clearly-bounded
work to Terra. The full policy text is in
[`.github/ISSUE_TEMPLATE/task.md`](./.github/ISSUE_TEMPLATE/task.md), since
that's what every issue in this repository is actually generated from.
