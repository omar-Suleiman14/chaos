# Preview environments

Every pull request gets a Vercel preview. With the setup below, each branch
also gets its own Convex preview backend with a seeded workspace, and the PR
gets a comment with direct links into it.

## How it works

1. `scripts/vercel-build.mjs` sees a Convex preview deploy key on a non-production
   build and runs `convex deploy`. That creates or updates the branch's preview
   deployment, never production.
2. After the functions are deployed, `scripts/preview-seed.ts` creates the
   workspace through the real MCP server and the Convex MCP backend, the same
   path ChatGPT uses: a feedback form, a quiz, a public lesson, a two-lesson
   course, a flashcard set and a card named `preview`. Pushing again reuses the
   branch's previous workspace while it still exists.
3. The links are written to `/preview/links.json` in the build.
   `.github/workflows/preview-links.yml` reads that file when Vercel reports
   the deployment and keeps one PR comment up to date with links to the
   dashboard, form editor, form, quiz, lesson, lesson editor, course,
   flashcards, `/card` and admin.

A failed seed never fails the build. The preview just has no workspace and the
comment says so.

## Setup

| Where | Name | Value |
|---|---|---|
| Vercel, Preview | `CONVEX_DEPLOY_KEY` | a Convex **preview** deploy key (`preview:…`). A production key is refused for previews. |
| Vercel, Preview | `CHAOS_MCP_SECRET` | any long random string |
| Convex, default env for preview deployments | `CHAOS_MCP_SECRET` | the same value |
| Vercel, Preview (optional) | `PREVIEW_OWNER_ID` | the auth user id (`user_…`) of your account in the development auth instance, so you own the seeded workspace |
| Vercel, Preview (optional) | `PREVIEW_ADMIN_EMAIL` | made a preview admin on each build after that account has signed in to the preview once |
| GitHub secret (optional) | `VERCEL_AUTOMATION_BYPASS_SECRET` | needed when Vercel deployment protection is on |

Preview deployments need the same auth configuration as development (Clerk
development keys, or Better Auth with `BETTER_AUTH_URL` left to Vercel's URL).
