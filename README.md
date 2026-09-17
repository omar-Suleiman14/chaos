# Chaos

Chaos is an open-source platform for asking people things. It's built around
two intended modes:

- **Quiz mode** — graded questions with scoring, timers and explanations.
  This is what ships today.
- **Form mode** — ungraded data collection. Planned, not built yet; see the
  [v1.2.0 milestone](https://github.com/omar-Suleiman14/chaos/milestone/6).

Everything below describes what actually exists at the current commit, not
the long-term roadmap.

## What Quiz mode does today

- **Four question types in the data model and grading engine**: multiple
  choice, true/false, multi-select and written (keyword-matched) answers.
  **The creator editor currently only lets you author MCQ and true/false by
  hand** — multi-select and written questions exist and grade correctly if
  present, but authoring them through the UI is still being built (see
  Current limitations below).
- **Per-question configuration**: points, a time limit, and an optional
  explanation shown after answering. Questions can also store a hint, but it
  is not currently surfaced anywhere in the respondent player
  ([#27](https://github.com/omar-Suleiman14/chaos/issues/27)).
- **Creator-level settings**: randomize question order, randomize MCQ option
  order, show/hide correct answers, show/hide explanations, and a result
  display mode (raw score or pass/fail with a passing threshold).
- **Anonymous respondents** — no account needed to take a quiz. A published
  quiz is playable at `/{creatorUsername}/{quizSlug}`.
- **Results and per-question analytics** in the creator dashboard, plus CSV
  export of responses.
- **Printing** a quiz (`/print/{quizId}`).
- **AI generation** from an uploaded PDF or image: PDF text is extracted
  client-side with `pdfjs-dist`, image text via OCR with `tesseract.js`, and
  the extracted text is sent to the server to either generate new questions
  from lecture material or parse an existing quiz/answer key out of a
  document. In practice this currently only produces MCQ and true/false
  questions, even though the request accepts counts for all four types (see
  Current limitations).
- **AI editing** — ask an assistant to modify quiz questions through a chat
  interface, with generated changes previewed before they're applied.
  Currently limited to MCQ and true/false questions.
- **Authentication** via Clerk; **backend and data** via Convex.
- **Admin tools** (`/admin`) for support staff: global default settings and
  the popup/error copy shown to users who hit plan limits.

Nothing beyond this list exists yet — in particular, there is no Form mode,
no respondent "experience" system, no public API, no webhooks and no
self-hosting support. Do not assume a capability exists here just because
it's planned; check `convex/schema.ts` and `app/` if in doubt.

## Development setup

Requires Node.js and [pnpm](https://pnpm.io) (this repo uses `pnpm-lock.yaml`
and pins the pnpm build-script allowlist in `pnpm-workspace.yaml`).

```bash
pnpm install
pnpm dev
```

`pnpm dev` runs `next dev` and `convex dev` in parallel — the Next.js
frontend and the Convex backend both need to be running for the app to work.
Its `predev` hook runs first every time: it waits for the Convex dev
deployment to come up, then opens the Convex dashboard in your browser.

You will need:

1. A [Convex](https://convex.dev) project (`npx convex dev` on first run will
   walk you through creating one and writing `NEXT_PUBLIC_CONVEX_URL` into
   `.env.local` for you).
2. A [Clerk](https://clerk.com) application, with its keys added to
   `.env.local` (see below).

Once both are configured, `pnpm dev` serves the app at
`http://localhost:3000`.

### Environment variables

| Variable | Where it's set | Read by | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` (Next.js) | `components/ConvexClientProvider.tsx` | URL of your Convex deployment. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` (Next.js) | `ClerkProvider` (`app/layout.tsx`), implicitly | Clerk's publishable key, used client-side. |
| `CLERK_SECRET_KEY` | `.env.local` (Next.js) | `clerkMiddleware` (`middleware.ts`), implicitly | Clerk's secret key, used server-side. |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex dashboard/CLI environment | `convex/auth.config.ts` | Clerk JWT issuer domain Convex validates session tokens against. Falls back to `https://clerk.chaos.fail` if unset. |
| `OPENROUTER_API_KEY` | Convex dashboard/CLI environment, **not** `.env.local` | `convex/aiQuiz.ts`, `convex/aiEditorChat.ts` | Used for AI quiz generation and AI editing. Without it, those two features fail; everything else works. |

The Convex-side variables (`CLERK_JWT_ISSUER_DOMAIN`, `OPENROUTER_API_KEY`)
are set against your Convex deployment (`npx convex env set NAME value`),
not in `.env.local` — they run on Convex's servers, not in the Next.js
process.

### Tests

See [`tests/README.md`](./tests/README.md) for the full breakdown. Short
version:

```bash
pnpm test        # unit + integration — no credentials required
pnpm test:e2e     # Playwright, needs `pnpm dev` running against real Convex/Clerk
pnpm typecheck
pnpm lint
```

## Build and deployment

This is a standard Next.js app (`pnpm build` / `pnpm start`) paired with a
Convex deployment. `pnpm build` needs `NEXT_PUBLIC_CONVEX_URL` and the Clerk
publishable/secret keys available at build time (see
`.github/workflows/ci.yml` for the placeholder values CI uses to build
without real credentials). Deploying Convex functions is a separate step
(`npx convex deploy`) from deploying the Next.js app.

## Current limitations

Known gaps, tracked as issues rather than restated in detail here:

- Authorization has not yet been audited end-to-end on every server
  operation ([#9](https://github.com/omar-Suleiman14/chaos/issues/9)), admin
  access is a hardcoded email list rather than a configurable source
  ([#10](https://github.com/omar-Suleiman14/chaos/issues/10)), new users get
  elevated privileges by default
  ([#11](https://github.com/omar-Suleiman14/chaos/issues/11)), public queries
  may over-expose correct answers/explanations
  ([#12](https://github.com/omar-Suleiman14/chaos/issues/12)), and user/quiz
  ban state is not enforced server-side
  ([#15](https://github.com/omar-Suleiman14/chaos/issues/15)).
- Quiz deletion and data lifecycle are undefined
  ([#16](https://github.com/omar-Suleiman14/chaos/issues/16)).
- There are two competing sound implementations and a duplicate,
  unreachable respondent player at `/user/quiz`
  ([#17](https://github.com/omar-Suleiman14/chaos/issues/17),
  [#18](https://github.com/omar-Suleiman14/chaos/issues/18)).
- Dark mode is not fully wired up
  ([#19](https://github.com/omar-Suleiman14/chaos/issues/19)), and the app
  lacks consistent failure/error states
  ([#20](https://github.com/omar-Suleiman14/chaos/issues/20)).
- Only MCQ and true/false questions are authorable in the creator editor
  ([#23](https://github.com/omar-Suleiman14/chaos/issues/23)), producible by
  AI generation ([#30](https://github.com/omar-Suleiman14/chaos/issues/30))
  or editable by the AI editor
  ([#31](https://github.com/omar-Suleiman14/chaos/issues/31)) today, even
  though multi-select and written questions are fully supported by the
  schema and grading engine. Saving an unchanged question is not yet
  guaranteed to leave it byte-identical
  ([#24](https://github.com/omar-Suleiman14/chaos/issues/24)), and results,
  CSV export and print have further per-type gaps tracked across the
  [v0.3.0 milestone](https://github.com/omar-Suleiman14/chaos/milestone/2).
- PDF/OCR source extraction and accessibility have not been audited
  ([#33](https://github.com/omar-Suleiman14/chaos/issues/33),
  [#36](https://github.com/omar-Suleiman14/chaos/issues/36),
  [#37](https://github.com/omar-Suleiman14/chaos/issues/37)).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for how to propose changes.

## License status

**Undecided.** Chaos does not yet have a license. Do not assume any specific
license applies until this is resolved; see
[#7](https://github.com/omar-Suleiman14/chaos/issues/7) for the open
decision.
