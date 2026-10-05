# Chaos

Turn what you know into something people can use.

Chaos is an open platform for creating, teaching, learning and testing. Build lessons and courses, create forms and quizzes, turn quizzes into live games, and connect [Claude](https://chaos.fail/claude) or [ChatGPT](https://chaos.fail/chatgpt) to work directly on your content. It works in English and Arabic and runs no AI itself. Try [chaos.fail](https://chaos.fail), or host your own copy.

## What it does

**Main features**

- **Forms, surveys and quizzes.** 16 question types, sections, branching and required rules. Quiz mode adds answer keys, points and automatic marking.
- **Lessons and courses.** A document-like editor with covers, icons, images, video, equations, tables, sources and citations. Put lessons in order as a course and publish it.
- **Learning.** Public courses and community lessons, saved lessons, progress and weak areas, and copies that keep the original author credited.
- **Live games.** Host a quiz on a big screen; people join from their phones with a PIN, answer against the clock and watch the leaderboard.
- **Results you can use.** Live summaries and charts, every response in detail, CSV, Excel and JSON export, webhooks and an HTTP API.
- **Business teams.** Teams with owner, admin and member roles edit shared forms, lessons, courses and folders together, and publish team-only lessons, courses, flashcards, forms, quizzes and live games. Free for a limited time.
- **A look for every form.** 18 themes (including Google Forms and Microsoft Forms styles), four ways to answer (page, sections, one at a time, swipe), optional sounds, your own colours and logo.

**Also included:** English and Arabic with right-to-left layouts, 21 templates, collaborators with roles, team-only (internal) publishing, version history and undo, opening and closing times with time zones, response limits and access codes, respondent edits with history, links, QR codes and embedding, use from ChatGPT or Claude through MCP, a Max integration, and step-by-step guides at [`/docs`](https://chaos.fail/docs).

## Stack

- [Next.js](https://nextjs.org) 16 (App Router) and React 19 for the web app
- [Convex](https://convex.dev) for the database, server functions, scheduling and file storage
- [Clerk](https://clerk.com) or self-hosted [Better Auth](https://better-auth.com) backed by Convex for sign-in
- TypeScript everywhere; Vitest, `convex-test` and Playwright for tests

## Run it locally

You need Node.js 22.12 or later in the 22.x series, [pnpm](https://pnpm.io) 12.4.2 (pinned in `package.json`), a backend deployment and a configured authentication provider. Choose Clerk + Convex, Better Auth + Convex Cloud, or Better Auth + self-hosted Convex with no required paid service. The complete setup and migration instructions are in [self-hosting](./docs/self-hosting.md).

```bash
pnpm install
cp .env.example .env.local   # then select and configure authentication
pnpm dev                     # runs next dev and convex dev together
```

For the default Clerk + Convex Cloud setup, on first run Convex asks you to sign in and creates a development deployment, then writes `NEXT_PUBLIC_CONVEX_URL` into `.env.local`. Leave `NEXT_PUBLIC_CONVEX_SITE_URL` empty when using Convex Cloud so Chaos derives the matching HTTP actions URL. Create Clerk's **JWT template named `convex`** using its Convex preset. The first backend deployment waits for its required issuer; keep `pnpm dev` running and set it from a second terminal:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
```

The app runs at <http://localhost:3000>. To make yourself an admin, sign in once, then run `npx convex run admin:grantAdmin '{"email":"you@example.com"}'`.

Email-based collaborator invitations require a verified email claim. Keep `email` and `email_verified` in the Clerk `convex` JWT template, with `email_verified` derived from `{{user.email_verified}}`, rather than a hardcoded value. Missing or false verification never grants invitation access. See [Clerk JWT templates](https://clerk.com/docs/guides/sessions/jwt-templates).

For Better Auth, set `NEXT_PUBLIC_AUTH_PROVIDER=betterauth`, `NEXT_PUBLIC_APP_URL` and both public Convex URLs. Set `CHAOS_AUTH_PROVIDER=betterauth`, the matching `CHAOS_APP_URL` and a random `BETTER_AUTH_SECRET` on Convex before deploying. Accounts and sessions live in Convex; no Clerk credentials, separate identity server or paid authentication service are required. Sign up at `/sign-up`. Existing accounts need an explicit operator binding before first use; see [migration steps](./docs/self-hosting.md#migrating-an-existing-installation).

### Environment variables

Every variable is listed with what it does in [`.env.example`](./.env.example). The ones you need to start:

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Your Convex deployment (written by `convex dev`). |
| `NEXT_PUBLIC_AUTH_PROVIDER` | Build / `.env.local` | `clerk` (default) or `betterauth`. Match the backend mode. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | `.env.local` | Required only for Clerk mode. |
| `BETTER_AUTH_SECRET`, `CHAOS_APP_URL` | Convex | Random secret and exact app origin for Better Auth. |
| `CHAOS_AUTH_PROVIDER` | Convex | `clerk` or `betterauth`, matching the frontend. Required for Clerk too: `npx convex dev` and `convex deploy` refuse to push without it (`npx convex env set CHAOS_AUTH_PROVIDER clerk`). |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex (`npx convex env set`) | Required for Clerk mode; lets Convex verify sign-ins. |

Optional features switch on when their variables are set: webhooks (`CHAOS_WEBHOOK_KEY`), the ChatGPT app (`CHAOS_MCP_SECRET`, `CHAOS_MCP_CLIENT_IDS`), analytics (`NEXT_PUBLIC_POSTHOG_*`), and your support address (`NEXT_PUBLIC_SUPPORT_EMAIL`, `CHAOS_SUPPORT_EMAIL`). Set Convex variables with `pnpm exec convex env set`; putting them only in `.env.local` does not configure the backend. The MCP shared secret must match in both processes.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test        # unit + integration, no credentials needed
pnpm test:e2e    # Playwright against a running app; configured dedicated test accounts required
pnpm build
```

See [`tests/README.md`](./tests/README.md) for what each layer covers.

## Deploy

The web app and the Convex functions deploy separately, and they must match: a new web app talking to old Convex functions fails (for example, saves are rejected).

**Vercel + Convex Cloud.** Vercel runs `pnpm vercel-build` ([`scripts/vercel-build.mjs`](./scripts/vercel-build.mjs)); keep Vercel's default build command. Add a production `CONVEX_DEPLOY_KEY` (Convex dashboard → Settings → Deploy keys) to Vercel's **Production** environment only. Every production deploy then pushes the matching Convex functions before building the site. Preview deploys build the site only, so unreviewed branches never reach the live backend. Without the key, the build warns and you run `npx convex deploy` yourself after each merge.

**Self-hosting.** Docker, Compose with the self-hosted Convex backend, and the full guide are in [`docs/self-hosting.md`](./docs/self-hosting.md).

When hosting a modified version, set `NEXT_PUBLIC_SOURCE_REPO_URL` to the source for your running version before building. The site's Source link then points to your fork.

## Project layout

| Path | What's there |
|---|---|
| `app/` | Pages and routes: landing, `/docs`, `/pricing`, the workspace (`/dashboard`), public forms (`/f/[shareId]`, `/[username]/[slug]`), live games (`/play`), `/mcp` for Claude and ChatGPT, `/claude` and `/chatgpt` integration pages, `/api/plugins/*` plugin downloads |
| `components/` | UI: the form renderer and builder (`components/forms`), workspace pieces, site chrome |
| `convex/` | Backend: schema (`schema.ts`, `formModel.ts`), forms and responses (`forms.ts`, `respond.ts`, `formResults.ts`), grading (`grading.ts`, `formQuiz.ts`), integrations, webhooks, crons |
| `lib/` | Shared helpers: i18n (`i18n.tsx`, `locale.ts`), docs content (`lib/docs`), search, analytics |
| `docs/` | Developer docs: integration API, webhooks, ChatGPT app, AI integrations, self-hosting, migrations, data lifecycle |
| `tests/` | Unit, integration and end-to-end tests |

## Documentation

- For people using Chaos: [chaos.fail/docs](https://chaos.fail/docs) (source in `lib/docs/`), including [file uploads](https://chaos.fail/docs/file-uploads), [unfinished responses](https://chaos.fail/docs/partial-responses), [exports](https://chaos.fail/docs/export-responses), [connections](https://chaos.fail/docs/connections) and [self-hosting](https://chaos.fail/docs/self-hosting)
- How Chaos compares with Google Forms, Microsoft Forms, Typeform and Kahoot!, including its gaps: [chaos.fail/compare](https://chaos.fail/compare)
- Getting help: [chaos.fail/support](https://chaos.fail/support)
- Integration API: [`docs/integration-api-v1.md`](./docs/integration-api-v1.md)
- Webhooks: [`docs/webhooks-v1.md`](./docs/webhooks-v1.md)
- ChatGPT app: [`docs/chatgpt-app.md`](./docs/chatgpt-app.md)
- Claude and ChatGPT pages and plugin packages: [`docs/ai-integrations.md`](./docs/ai-integrations.md)
- Business teams and team-only content: [`docs/business-teams.md`](./docs/business-teams.md)
- Self-hosting: [`docs/self-hosting.md`](./docs/self-hosting.md)
- Search indexing (IndexNow): [`docs/indexnow.md`](./docs/indexnow.md)
- Data lifecycle and migrations: [`docs/data-lifecycle.md`](./docs/data-lifecycle.md), [`docs/migrations.md`](./docs/migrations.md)

## Contributing

Find planned work in [issues](https://github.com/omar-Suleiman14/chaos/issues) and [milestones](https://github.com/omar-Suleiman14/chaos/milestones). Use the issue chooser for bug reports and feature requests. Contributions are welcome. Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md), and please follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Report security problems privately as described in [`SECURITY.md`](./SECURITY.md), not in public issues.

## License

[GNU Affero General Public License v3.0 or later](./LICENSE). If you run a modified version for others over a network, you must offer them its source.

<!-- mcp-inventory:start -->
The public MCP registry currently exposes **119 tools**. See the [generated inventory](docs/mcp-tool-inventory.md) and [connection guide](https://chaos.fail/connect).
<!-- mcp-inventory:end -->
