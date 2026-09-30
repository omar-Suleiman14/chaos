# Product implementation checklist

## Open-source readiness review and cleanup (2026-09-30)
Outcome: review the current source for correctness, security, maintainability and public-release hygiene; fix confirmed defects without changing stored content or deploying. Publish the cleaned snapshot as one initial commit on `main` in the new repository; preserve the original checkout and its history.
- [x] Establish baseline lint, app/backend typechecks and unit/integration tests: 0 lint errors / 32 warnings; 444 unit + 330 integration passed, 1 todo.
- [x] Review backend authorization, response privacy, integrations, uploads and live games; add regression coverage for confirmed fixes. Preserve saved content and historical completed scores; compatibility notes in `docs/migrations.md`.
- [x] Review frontend state, rendering, access boundaries and unused code; verify save/navigation/retry/timer fixes with regression tests.
- [x] Clean up SEO and public copy, canonical/share metadata, robots and sitemap; preserve indexing opt-in and private-route exclusions. Shared site/docs/workspace links prefetch after hover, focus or touch; test navigation semantics and configured-origin metadata.
- [x] Audit tracked files, dependency usage, environment examples, contributor setup, CI and container configuration. No credential matches in the tracked-file pattern scan; all runtime dependencies have source imports. Patched the dependency advisory; audit now reports zero vulnerabilities. Frozen-lockfile install, Compose config and mocked deployment-script checks pass.
- [x] Review final diff and verify the fresh publishing checkout: frozen-lockfile install; lint 0 errors / 1 existing indexed response-filter warning; both typechecks; 499 unit + 373 integration passed, 1 existing todo; production build generated 53 pages with placeholder keys and no local environment files.
- [x] Record remaining findings privately outside the repository. Limits: real Clerk/OAuth, webhook networking, multi-device gameplay and full Docker runtime unverified; Docker daemon unavailable. Local production-server launch rejected by automatic approval review, so browser acceptance remains unconfirmed. Larger legacy-query pagination and existing respondent-query expiry reactivity remain follow-up work.
- [x] Prepare and verify a separate fresh-history publishing checkout for the empty `omar-Suleiman14/chaos` repository. It contains the reviewed source and excludes local secrets, caches and previous Git history; publication uses one initial `main` commit.

## Game autoplay, start countdown, sound and less text (2026-09-30)
- [x] Autoplay (default on for new games): answer → leaderboard → next question on server-scheduled steps (`autoStep`), `breakSec` 3–60 (default 5). Host can pause/resume or change the break mid-game (`setAutoplay`); Next still skips; stale jobs do nothing. Old rooms keep manual play.
- [x] Start countdown: Start shows 5-4-3-2-1 on host and phones (`setCountdown`, `countdownDone`); optional `startWhenPlayers` starts it automatically. `advance` from the lobby still starts at once (API/MCP).
- [x] Games always play sound (silent themes fall back to arcade); mute button always shown.
- [x] MCP: `host_game`/`set_game_settings` take `autoAdvance`, `breakSec`, `startWhenPlayers`; `get_game` returns `nextStepAt`/`startsAt`. Instructions and docs (help EN/AR, `docs/chatgpt-app.md`) updated.
- [x] Thank-you screen centred on every screen size; receipt folded into one "Save receipt" button.
- [x] Shorter copy: landing page, Games, Library, Settings, builder (Settings, Share, Field, Logic, Team, Translate), host lobby. Help/legal pages untouched.
- [x] Verification: typechecks, ESLint 0 errors, unit 444, integration 330 + 1 todo, production build.
- [x] Deployed 2026-09-30: Convex prod `fortunate-pigeon-964` (schema validated, no indexes deleted), then merged #262; Vercel production succeeded. Smoke: upload preflight 204, invalid ticket 403, disallowed type 415, new landing copy live, /play 200. Also covers the #261 upload endpoint and ticket table.
- [ ] Not yet done: a real file upload on a live form, and a real multi-phone game with autoplay and the countdown.

## Chaos games, MCP and hardening (2026-09-30)
Outcome: readable answers and Chaos-themed game controls; direct form/game labels; clear creator, themes and settings; authenticated game tools in MCP; evidence-backed security/performance fixes and cleanup.
- [ ] Replace oversized fixed-colour player tiles, show answer text by default, and preserve projector controls, keyboard use, Arabic and theme contrast.
- [ ] Remove landing "Try an example", rename "A conversation", simplify creator/theme controls and add usable game settings.
- [ ] Add game MCP tools using existing draft/publish and host permission rules; test negative authorization and answer privacy.
- [ ] Audit public functions, auth, uploads, webhooks, live reactive reads and cleanup; fix confirmed issues, keep sensitive findings outside the public repo.
- [ ] Verify focused/full tests, app/Convex typechecks, lint/build, mobile/Arabic visuals and final diff. Preserve existing work and data.
- [x] Uploads: respondents now get a single-use, 10-minute ticket URL on `/forms/upload` (Convex HTTP). The endpoint checks the ticket, type and 10 MB limit, stores the file and records it in `formUploads`; failed records delete the file. `registerUpload` removed, so raw storage URLs can no longer be issued to respondents. Expired tickets are cleaned by the cleanup cron; legacy files and rows untouched. Tests in `tests/integration/respondentHardening.test.ts`.
- [x] Help centre (EN/AR): "Connect it" explains adding Chaos to ChatGPT as a custom app in developer mode (`https://chaos.fail/mcp`, OAuth) until it is listed; games added to what it can do.
- [x] ChatGPT app instructions ask for short, natural questions, plausible options, one-sentence explanations and brief chat replies.
- [x] Verification (2026-09-30): app/Convex typechecks, ESLint 0 errors, unit 56 files / 444 tests, integration 26 files / 327 + 1 todo, production build with placeholder keys.
- [ ] Needs a Convex deploy for the new `formUploadTickets` table and `/forms/upload` route; then upload a file on a live form. Visual items above (tiles, creator/theme, settings) were implemented by the earlier session but not re-checked in a browser here.

## Production deployment (2026-09-30)
- [x] User authorized deployment. Confirmed Convex production `fortunate-pigeon-964` (`chaos-03e5a`) and Vercel production project `chaos`.
- [x] Convex dry run and production deploy passed schema validation and typechecking; generated bindings regenerated by the CLI.
- [x] Vercel deployment `dpl_5dBgaZxYpqj6kCSQxUZJPi4inwt5` is Ready and aliased to `https://chaos.fail`; production compilation, TypeScript and 53-page generation passed. Initial upload network failure resolved on retry.
- [x] Live health endpoint HTTP 200; public landing shows new demo and navigation, with verified 24px demo and 20px feature-button margins.
- [ ] Real signed-in game creation and multi-device gameplay still need an authenticated acceptance session. Deployment did not commit or push the working tree.

## Game creation and visual redesign (2026-09-29)
Outcome: remove landing section links, replace the cramped demo with an expressive interactive preview, redesign joining games, make game creation/hosting discoverable, reuse themes in live games, and expose collaboration, logic, translation and history.
- [x] Landing navigation, interactive conversation/game demo, feature coverage and sourced competitor comparison. Removed duplicate mobile language/signup controls and the visible "Try Chaos" demo label after screenshot feedback.
- [x] Games destination with quiz creation, 18 themes and existing-quiz hosting; quiz drafts open in the builder, with creation instructions and visible Logic/Translate/Team/History tabs. Shared viewers are excluded from hosting choices.
- [x] Optional theme snapshots for host/player sessions, retaining old rooms; redesigned join screen with creation link, mobile layout, Arabic and reduced-motion CSS.
- [x] Verification: app/Convex typechecks, ESLint (0 errors, 31 existing warnings), unit 52 files / 427 tests, integration 23 files / 286 passed + 1 todo, and production build (53 routes) with process-only placeholder auth/backend URLs. Creation/demo tests re-run after final permissions edits: 4 passed. Final diff checked.
- [x] Browser component preview with mocked auth/data: desktop/mobile landing and join; invalid-PIN error; Arabic/RTL; local game reveal and all 18 themes; mobile Games creation opens a themed quiz draft; host lobby uses the session theme; no page overflow in checked layouts. Final mobile menu has one language selector/signup action, and demo header only has the mode switch.
- [ ] Real signed-in builder and real multi-device room remain unverified; local Clerk keys were unavailable during implementation. Preview mocks stayed outside the repo. Production was subsequently deployed and smoke-checked as recorded above; no commit or push performed.

## Publication cleanup (2026-09-29)
- [x] Backed up all three review documents outside the repository in `C:/Users/Lenovo/chaos-private/publication-cleanup-2026-09-29/reviews`; verified SHA-256 hashes before removing `docs/reviews/`.
- [x] Closed #66–72, #101–113, #197, #198 and #207 as not planned, each with a one-line reason; verified all 23 GitHub states and reasons. AI issues were already closed. #108's old plugin proposal is superseded by standalone live games.
- [x] Confirmed webhook setup from `convex/webhookCrypto.ts` and the installed Convex CLI: generate a random secret of 32+ characters and set `CHAOS_WEBHOOK_KEY` on the intended Convex deployment.
- [ ] Publication limitation: review files remain accessible in Git history; working-tree deletion does not make the historical copies private.

## Live games (Kahoot-style, #108) (2026-09-29)
- [x] Convex `liveGames`/`livePlayers`/`liveAnswers` (`convex/liveModel.ts`), functions in `convex/live.ts`, pure rules in `convex/liveLogic.ts`; server clock (scheduled reveal at `questionEndsAt`, late answers refused), speed scoring 500–1000 + streak bonus, answer keys only after each reveal, token-hash player auth, kick, nickname rules + small profanity list, PIN unique among active games, 3 h idle expiry cron, join/answer rate limits, Free 100 players.
- [x] Results saved on end as form responses (`source: "live"`, `live: {gameId, nickname, rank, points}`, tag `live`) or old-quiz attempts (`source`, `liveGameId`); webhooks and counts as normal.
- [x] Host screen `/dashboard/live/<id>` (no sidebar), player screen `/play` (public, never framed; `play` reserved), Host live in builder header and library menu; en/ar, sounds with mute, haptics, reduced motion, keyboard 1–4, screen-reader announcements.
- [x] `/docs/live-games` (en + ar), landing feature line; tests `tests/integration/live.test.ts`, `tests/unit/liveGame.test.tsx`.
- [ ] Deploy: `npx convex dev` to regenerate `_generated` (edited by hand here).
- [ ] Manual: a real room with a projector and several phones (different browsers, one on slow 3G, one that sleeps mid-question), in both languages.

## Security, privacy and integration reviews (#62, #212, #213) (2026-09-29)
- [x] Written security, privacy and integration reviews (kept privately by the maintainers, not in the public repo).
- [x] Fixed: public `getUserByUsername` removed; respondent account linked only on signed-in forms; leaderboard/percentile withheld with results; `/print` behind sign-in; secondary small-group suppression; address-like `source.label` refused; connection webhooks need `webhooks:manage` and an unrestricted owner; malformed API paths 404. Tests in `tests/integration/securityReview.test.ts`.
- [ ] Owner decisions: Clerk issuer fallback (S-5), CSP enforcement plan (S-6, #202), MCP token audience (S-7), access-code guessing (S-8), per-IP limits (S-10), analytics consent (P-5), account deletion process (P-6), policy wording (P-8).

## Issue #164: public embedding without exposing creator authentication (2026-09-29)
- [x] Per-form "Allow embedding" (off by default) with up to 20 https origins or "Any site"; `forms.embed` in Convex, `convex/embed.ts`, Share tab panel with snippet, copy and live preview.
- [x] Enforced `frame-ancestors` per request in `proxy.ts` (asks `embed.getEmbedPolicy`); `next.config.ts` keeps DENY on everything else; drafts, archived, never-published, signed-in-only and non-embeddable forms get `'none'`.
- [x] `?embed=1` sizes to content and posts `{ type: "chaos:embed:height", height }`; `FrameGuard` reloads on client navigation inside a frame so the server check always applies.
- [x] Unit (`tests/unit/embed.test.ts`, incl. Next's own route compilers) and Convex (`tests/integration/embed.test.ts`) tests; headers checked against `next dev` with a stubbed Convex endpoint.
- [ ] Not run: `tests/e2e/embed.spec.ts` (no browsers here; the completion test needs a real deployment and `E2E_EMBED_SHARE_ID`).
## Integration API hardening (#169–#175)
- [x] `docs/integration-api-v1.md`: preview status, stability rules, 6-month deprecation policy (Deprecation/Sunset headers), transport rationale, v1 exclusions, rate limits, idempotency, source metadata, import degradation rules.
- [x] Token rotation (dashboard **New token**, `POST /connection/rotate`), 24 h grace, early stop, `Chaos-Token-Expires` header; recent activity per connection.
- [x] Read/write rate limits per connection (300/60 default; `globalConfig` or `CHAOS_API_*_RATE_PER_MINUTE`), `RateLimit-*` headers, 429 + Retry-After.
- [x] Idempotency: 24 h retention enforced at read time, canonical JSON comparison, `Idempotent-Replayed` header.
- [x] Structured `source` {type,id,url,title,fetchedAt} validated (paths/private hosts rejected, 4 KiB cap), stored with drafts, shown in builder, never to respondents.
- [x] Tests: `tests/integration/integrationApi.test.ts`.
- [ ] Deploy: `npx convex dev` to regenerate `_generated/server.d.ts` (env types edited by hand). Design approval by Astra (#169, #174) still needed.

## Webhooks (#176, #177, #178, Chaos side of #184)
- [x] Events response.completed (forms, classic quizzes), response.graded (classic quiz manual grading), form.published/closed/reopened, webhook.test; payload version 1 in `docs/webhooks-v1.md`; answers only on opt-in.
- [x] Signed (`Chaos-Signature: t=…,v1=…`), per-webhook secrets shown once and stored AES-GCM encrypted (`CHAOS_WEBHOOK_KEY`), 24 h rotation overlap, test delivery.
- [x] Node delivery action: DNS checked and pinned, private/metadata/reserved ranges refused, no redirects, 10 s timeout; backoff 30 s ×4 up to 6 h, 8 attempts; auto-off after 25 failures with a notification; history, resend, retention cron.
- [x] Connections → Webhooks UI (English and Arabic), `/docs/webhooks` guide, integration API `webhooks:manage` endpoints for any connected app.
- [ ] Deploy: set `CHAOS_WEBHOOK_KEY` (32+ random characters) before creating webhooks; run `npx convex dev` once to regenerate `_generated` (edited by hand here).
- [ ] Manual: point a webhook at a real endpoint, trigger each event, break and fix the endpoint, resend.

## Current request (2026-09-29, evening): docs, search, pricing, Arabic, glass, MCP themes
Branch `feat/chatgpt-mcp`, continued on `claude/festive-albattani-4hqw21`.
- [x] Glass blurs again: the overlay faded in with an opacity animation, which made it the backdrop root, so the palette blurred only the flat dim. Now fades by colour.
- [x] Sign in / create account from the landing page goes to /dashboard (forced redirect on the buttons and Clerk fallbacks).
- [x] Phones: a plain "Sign out" row in the drawer (Clerk's popover opened outside the drawer and closed it).
- [x] New forms and templates default to Paper (Google Forms look); the old "Chaos" preset is shown as "Evergreen" (id stays `chaos`).
- [x] Shared language layer `lib/i18n.tsx` (cookie `chaos-lang`, `<html lang dir>` from the server), Arabic in Max's faces (Cairo, IBM Plex Sans Arabic).
- [x] Sidebar "Docs" entry (replaces the Help mail link).
- [x] PostHog per its JS guide: `defaults: "2026-05-30"`; signed-in creators identified by Clerk user id (never email/name), `reset()` on sign-out; respondents stay anonymous; still no URLs, autocapture or replays; CSP `worker-src` allows `data:`; privacy policy says so.
- [x] /docs: 30 guides in English and Arabic (sidebar, search with Ctrl+K or /, On this page, previous/next), Anthropic faces when installed with Source Serif 4 and Inter as stand-ins; every guide in the sitemap; `tests/unit/docs.test.ts` checks links and that both languages match.
- [x] Ctrl+K search indexes words inside forms and quizzes (`forms.searchIndex`, needs Convex deploy; falls back to titles), settings (`lib/settingsIndex.ts`), archive and docs; ranking in `lib/search.ts` (16 unit tests), Arabic normalization, "how do I…" retry. Legacy quizzes: titles only.
- [x] Settings rows carry `settings-…` ids; a search result scrolls to the row and highlights it, also when Settings is already open.
- [x] Clerk sign-in and account screens in Arabic (`@clerk/localizations` arSA) when the language is Arabic.
- [x] Landing: "Works with" section redesigned with the ChatGPT mark; theme selector redesigned (landing and Settings); Docs and Pricing in the header; Arabic.
- [x] /pricing: Free for now (real Free limits from convex/plans.ts); Pro 20 EGP a month, not for sale yet, 30-day trial CTA; no buy button (no payment code).
- [x] MCP: `list_themes`, `set_form_theme` (preset by id or name incl. "Evergreen"/"Chaos", per-property overrides, contrast warnings, keeps logo and sound), `set_form_sound`; `create_form` takes `theme`/`sound` (default Paper, silent). Draft-only via `updateForm`. Needs Convex deploy.
- [x] Workspace in Arabic: shell, library, archive, connections, settings, search palette, builder tabs, responses, old quiz editor and results. Validation and server messages: see below.
- [x] Closed 32 GitHub issues with evidence: 10 completed (#5, #7, #8, #9, #10, #12, #17, #18, #20, #21), 22 not planned as AI work (#30–#33, #138–#149, #151–#155, #196). #150 reopened (needs scope decision). 191 left open; partial ones noted (#4, #6 README outdated, #11 trial sets isElevated, #13–#16 missing tests, #37 window.confirm, #77/#82/#83/#86/#87 field gaps).
- [x] Cleanup: 12 unused UI components, gsap/@gsap/react/vaul, duplicate plural helpers (now `lib/locale.ts`), unused labels and imports, pnpm_install.log; lint allows `_name` for deliberate omissions (58 warnings → 29, all `any` or old quiz page hooks).
- [x] Fixed: every page crashed on the server because the root layout called `isLocale` from a client module; server-safe helpers live in `lib/locale.ts`.
- [ ] Found, not fixed: the old quiz editor's "Half marks from" setting is saved but not used when grading (`convex/quizFunctions.ts`).
- [ ] Not verified in a browser: signed-in pages (need real Clerk/Convex keys). Public pages, docs and pricing were checked in English, Arabic, dark mode and phone width.


## Current request (2026-09-29, afternoon): ChatGPT app (MCP), upgrades, admin in DB, SEO/security, UI polish
Branch `feat/chatgpt-mcp`. Setup, developer-mode testing and the submission packet: `docs/chatgpt-app.md`.
- [x] MCP server at `/mcp` (Streamable HTTP, stateless) with 8 tools: search_forms, get_form, get_results, list_responses, create_form (drafts only; quiz mode with answer keys), update_form, publish_form, set_form_status (no delete). Annotations, output schemas and OAuth securitySchemes on every tool.
- [x] Clerk OAuth: protected resource metadata (`/.well-known/oauth-protected-resource` and `/mcp`), Clerk authorization server mirror; bad tokens answer 401 with WWW-Authenticate; anonymous tool calls return `mcp/www_authenticate`. The first ChatGPT sign-in creates the Chaos account.
- [x] The ChatGPT app is Pro-only: every call checks the plan (the 30-day trial counts); Free and expired plans get `PRO_REQUIRED`. Mentioned on /chatgpt, the landing band, the app instructions and the submission doc.
- [x] Convex backend `convex/mcp.ts` behind `POST /api/mcp/v1` with the `CHAOS_MCP_SECRET` shared secret: owner/collaborator roles, plan limits, read-only for restricted accounts, 120 calls/min per person.
- [x] OpenAI domain verification route (`OPENAI_APPS_CHALLENGE_TOKEN`), `/chatgpt` help page, landing "Works in ChatGPT" band, footer link, privacy policy section.
- [x] Dependencies upgraded (Next 16.3, React 19.3, Convex 1.46, Clerk 7.9, and others); deprecated `@clerk/clerk-react` removed; explicit table names in every db call (Convex codemod); `middleware.ts` → `proxy.ts`; typed Convex env (`convex/convex.config.ts`). TypeScript 7 and ESLint 10 left for later.
- [x] Admins live in the `admins` table; grant/revoke only with `npx convex run admin:grantAdmin` / `admin:revokeAdmin`. No admin email or `CHAOS_ADMIN_USER_IDS` in code.
- [x] robots, sitemap, metadata and OG image, JSON-LD, noindex on private areas, security headers (CSP report-only), security.txt, new error pages.
- [x] Command palette without the blue outline, Max-style key-hint footer; Glass setting (popup opacity, default 85%) for menus and popups.
- [x] Notion-style tabs (icon + label, text-colour underline, hairline) in the builder, results, admin and library filter.
- [ ] Owner: set `CHAOS_MCP_SECRET` (Convex + Vercel), enable Clerk DCR/CIMD, deploy Convex, run `admin:grantAdmin`, then test in ChatGPT developer mode.
- [ ] Not verified: the real OAuth flow with ChatGPT and Clerk (needs production secrets); pages in a browser.

## Current request (2026-09-29): table-header sorting, archive, iOS-style Settings
Branch `feat/app-settings-archive`.
- [x] Library list sorts from its column headers (Name, Status, Responses, Edited; natural direction first, click again to reverse; aria-sort). Gallery keeps the Sort menu.
- [x] Archive / Restore in the row menu for owned forms, with an Undo toast; archived forms hide from the library (Status → Archived shows them) and from respondents; Restore returns published forms as Closed and unpublished ones as Draft.
- [x] Settings rebuilt iOS-style: profile and account (Clerk), username, appearance (Light/Dark/Auto), reduce motion, new-form defaults (theme, layout, language, sounds), library defaults, connections, keyboard shortcuts, old quiz editor defaults (auto-saved), help and legal, sign out. Preferences apply instantly and are kept on this device.
- [x] createForm records an import source only when one is named (needs Convex deploy); until then custom new-form defaults are sent only when changed.

## Current request (2026-09-29): library sort and filter, sidebar sections dock
Branch `feat/library-sort-filter`.
- [x] Library: Status filter (Live, Draft, Closed, Archived; replaces Show archived) and Sort (Last edited, Name, Most responses), quiet at defaults and tinted when changed, remembered on this device.
- [x] Sidebar: open sections show a quiet header with a fold chevron and "Show N more"; folded sections dock at the bottom as "Recent (12) ——".
- [x] Max integration: production API is live (unauthenticated requests answer 401 UNAUTHORIZED); Max needs only a connection token from Dashboard → Connections plus the API address shown there.

## Current request (2026-09-29): custom links, Max-like sidebar, scannable screens
Branch `feat/max-and-scannable`. Merge when checks pass.
- [x] Custom links `chaos.fail/<username>/<slug>` (convex/links.ts): off by default; turning on in Settings asks for a username only if it was generated (userNNNNN); links follow username changes; reserved names and duplicate links refused; old quiz links at the same shape still work. A chosen username is no longer overwritten by the sign-in nickname. Share tab and Settings show the custom link.
- [x] Sidebar: Ctrl/Cmd+B hides it entirely (show again from the top bar); real library icon; Pinned and Recent sections fold like a list header with a count; pin from a hover button, the library row menu or the builder menu (pins are kept on this device).
- [x] Settings rebuilt as receipt-style rows (name left, control right), defaults quiet and changed values in ink, status coloured by state, rarely used settings under More settings.
- [x] Library list: sticky header no longer covers the first row; numbers right-aligned; status colour from data; archived and closed rows muted; Pin in the row menu.
- [x] History is a timeline grouped by day with who published; fixed publisher showing as an account id.
- [x] Tooltips for icon-only controls; one-step-at-a-time getting started for unpublished forms; Works with Max band with the Max mark on the landing page.
- [ ] Needs a Convex deploy (new `slug` field and index, `usernameChosen`, links functions) before custom links work in production; until then the app falls back to /f/ links and old quiz links.
- [ ] Pins are per device (local storage), not synced across devices.

## Current request (2026-09-28, night): reset themes, undo everywhere, themed loading, Max sidebar
Branch `feat/reset-and-undo`. Merge when checks pass.
- [x] Themes remember their preset when edited ("Paper · edited") and offer "Reset to Paper"; logo and sound choice survive a reset. Older fully custom themes have nothing to reset to.
- [x] Undo: Undo/Redo buttons always visible in the builder header (Ctrl+Z / Ctrl+Y outside text fields). Deleting questions, switching or resetting a theme and applying a saved theme show a toast with Undo, and each of those (plus moves, duplicates, bulk edits, tile clicks) is its own undo step.
- [x] Settings: saving shows "Settings saved · Undo" (restores the previous settings; a changed access code cannot be undone); Close/Reopen/Archive/Restore show Undo; "Discard changes" for unsaved edits.
- [x] Respondent loading screen uses the form's own theme, fetched on the server with the page, and a quiet spinner that only appears after 400 ms (retry after 8 s). No more default-Chaos flash before the form's look.
- [x] Sidebar like Max: panel icon beside the logo and Ctrl/Cmd+B fold it into an icon rail (with tooltips); drag the edge to resize (200–420 px, arrow keys, double-click resets); state and width are remembered. Phones keep the drawer; Ctrl+B toggles it there.
- [ ] Not undoable yet: publishing, team changes, response deletion and deleting a whole form from the library.

## Current request (2026-09-28, evening): simpler builder, Typeform feel, landing fixes
Branch `feat/simpler-builder-typeform`. Merge when checks pass.
- [x] Landing: hero copy "Ask better questions. Get better answers." with "Create something" / "Try an example"; no eyebrow lines; the example's native theme dropdown (broken OS popup in dark mode) replaced by themed colour swatches.
- [x] Typeform mode: start screens rebuilt in Typeform's order (title, line, Start + press Enter, time); split start screen is copy + calm accent panel (no giant number or orbs). Questions move as one continuous scroll (answered question lifts out while the next rises in, pinned in place, no overlap); chosen answers blink twice before moving on.
- [x] Fixed: every start screen applied its style class twice (section and inner block), doubling padding and halving the split layout.
- [x] Sound is opt-in: a visible "Play sounds" switch in Design (pack choice appears when on); new forms start silent; choosing a theme never turns sound back on. Server-created forms pick up the silent default only after the Convex functions are deployed.
- [x] Builder: Settings is a main tab; response limit and open/close dates are the first thing in Settings and are shown under the form title (for example "12 of 100 responses · Closes 3 Oct"); other settings are under "More settings".
- [x] Questions: six everyday types with "More types" for the rest; the editor shows the question, options and a Required switch; description on request; type, limits, scores, images and piping under "More options"; move/duplicate/delete in a "…" menu.
- [x] Checks: see verification in the PR. Browser: start screens (split, classic, poster), transition frames sampled at fixed times, question editor, landing light/dark and phone.
- [ ] Not verified: signed-in builder against a deployed backend; real iPhone Safari.

## Current request (2026-09-28): intentional UI polish
Branch `feat/ui-polish` from `main` (started by Astra, finished and merged by Claude).
Outcome: a calm, cohesive landing and creator experience, expressive but restrained form themes, accessible keyboard interactions and comfortable mobile layouts.
- [x] Landing rebuilt around one hierarchy: hero, an interactive example form with a theme picker, three modes, six theme samples, details, one closing call to action. No ticker, stickers, chips or looping motion.
- [x] Workspace: focus rings, 44px touch targets on phones, 16px inputs (no iOS zoom), no hover lift/zoom, no pulsing live dots, save state shown as text, status without dots. Max tokens kept (`#3595e3`, Notion neutrals, Cairo); an interim darker blue and system font were reverted.
- [x] Modals (`components/workspace/useModal.ts`): focus trap, inert background, Escape, nested layers, focus return (also under React StrictMode). Used by dialogs, command palette, full preview and the phone sidebar drawer.
- [x] Menus portal out of clipped cards and support arrows, Home/End, typeahead, Escape and return focus; palette has an active descendant in rendered order; tabs support Home/End and RTL.
- [x] Respondent renderer: choosing the final answer never submits by itself; Submit, Enter in a final text answer or Ctrl+Enter do. Shortcuts and radio names are scoped per renderer; focus moves with each step; swipe keeps native radio arrow keys; reduced motion is honoured.
- [x] Themes: per-preset motion duration/distance/stagger, one-shot entrances only (no typewriter, caret, marquee, floating orbs, blinking "press start"), "Pill" buttons renamed "Rounded" and no longer fully round.
- [x] Sound: mute is kept in memory when storage is blocked; audio set-up failures never break the page; unmuting plays the form's own pack; the mute button is hidden for silent themes; packs rebalanced.
- [x] Checks: tsc (app, convex), ESLint 0 errors, unit 13 files / 83 tests, integration 7 files / 37 tests, `next build` with CI placeholder env. Browser: landing desktop and iPhone 12 Pro (no horizontal overflow, light overscroll), menu/dialog keyboard flows, terminal cover and dark workspace on a temporary component page (removed).
- [ ] Not verified: signed-in dashboard and a live `/f/...` form against a deployed backend; real iPhone Safari; audio on devices.
Constraints: preserve content and existing backend behavior; no deployment required for this frontend pass.

## Current request (2026-09-28, after deploy): simplify, legal pages, Notion-style landing
Branch `fix/simplify-ui-legal`.
- [x] Landing rebuilt on Notion's layout with Chaos's soul (theme "doodle" circles, live product window, pastel feature cards, theme ticker, column footer). No eyebrow pill, no gradient word; simple fade on the headline chip. No invented customer logos or stats.
- [x] Real logo (`public/icon.svg`) everywhere via `components/Logo.tsx`; the "c" mark is gone.
- [x] No sounds in the creator app or landing; sounds remain only in forms/quizzes (plus the sound-pack audition tile).
- [x] Privacy policy (`/privacy`) and terms (`/terms`), written from how the app actually works; linked from the site footer and respondent pages.
- [x] Workspace bigger and calmer: larger type and targets; sidebar trimmed; library with one New (menu: blank/template/import), three tabs, view menu; cards show one status line; builder has Questions/Design/Share + More, actions in "…"; hover-revealed row controls; Design tab advanced options collapsed; status shown as text, not pills.
- [x] Fixed: dialogs' dark backdrop trapped inside the page (animation fill kept a transform); library thumbnails falling back to a serif font.
- [x] Checks: tsc, ESLint 0 errors, unit 48, integration 37, `next build`; headless screenshots of landing (light/dark), library, builder, privacy.
- [ ] Legal text is a plain-language draft based on the codebase, not reviewed by a lawyer; it names no legal entity or governing law.

## Current request (2026-09-28): Max look, themes, modes, sound
Branch `feat/max-look-themes-modes` from `main`. Merge when checks pass.
- [x] Creator workspace uses Max's tokens (blue accent, Notion neutrals, `#121212` dark, Cairo font) with a Max-style sidebar, recent items, Ctrl+K palette and page/list motion.
- [x] One "New" action (no separate new form / new quiz); quiz mode is a switch in the builder header.
- [x] Library as a Notion-style database: gallery and list views, type tabs, theme thumbnails, row menus, template/import/delete dialogs.
- [x] Presentation modes: Classic (page), Sections, Typeform (one at a time, letter/number keys, auto-advance, slide animations) and Swipe (full-screen vertical cards, touch/wheel/arrow gestures, validation blocks).
- [x] Themes: 8 new original presets (15 total, all above WCAG contrast minimums), per-theme start screen, backdrops, button styles, 6 fonts, derived dark palette ("follow device"), sound pack. New forms start on the Chaos preset.
- [x] Theme studio: visual tiles, palette shuffle, contrast warnings, desktop/phone preview, full-screen preview with sample quiz score.
- [x] Sounds rebuilt: synthesized packs (glass, pop, wood, arcade), compressor and short reverb, respondent mute toggle.
- [x] Landing page redesigned; dark/light toggle with circular reveal; respondent toggle hidden when a theme has fixed colours; closed/code/sign-in screens use the form's theme.
- [x] Fixed: sticky sidebar/top bar broken by `overflow-x` on html+body; preview type sized to the frame via container queries.
- [x] Checks: tsc (app, convex), ESLint 0 errors, unit 9 files / 48 tests, integration 7 files / 37 tests, `next build` (real Convex URL) pass. Browser walkthrough through a temporary stub-data harness (removed): library, builder Design tab, Typeform flow with keyboard, Swipe on phone with validation, landing, light/dark.
- [ ] Not verified: signed-in flows against a deployed backend. The dev Convex deployment has none of the forms functions deployed; deploying remains an operator decision.

## Current request (2026-09-27)
- [x] Replace separate creator Forms and Quizzes navigation with one library and a quiz mode in the form builder, while keeping legacy quiz records, responses, scores and links accessible.
- [x] Add selectable Google Forms, Microsoft Forms and Typeform inspired respondent themes, several original themes, custom editing and reusable saved themes; keep existing published form versions stable.
- [x] Verify grading privacy with unit tests; verify typecheck, lint, unit/integration tests and production build (with a valid build-time Convex URL).
- [x] Review the final diff, pass remote CI and merge the Chaos and Max work to main (Chaos #246; Max #234).
- [ ] Deploy the new Convex schema and functions to the intended production deployment after an operator approves and verifies the target; then run the live acceptance journey. Merging code did not deploy Convex.

Requested outcome: AI-free Chaos as the dedicated forms, surveys and quizzes product, connected to independently usable Max. Chaos retains responses; Max receives selected definitions and permitted aggregate summaries only.

Completion checks: preserve existing quizzes/questions/scores/URLs; verify private drafts and publication validation; test form validation, versioned responses, interrupted submission recovery and authorization; test versioned integration creation/linking/retries/revocation; typecheck, lint, tests and production build; inspect UI where access permits. No feature is complete merely because it is listed here.

First release target (from the request): safe drafts and publication, complete core fields, accessible Arabic/English forms, branching, reliable submissions, response management, Max creation/linking/summary cards. Acceptance journey: select content in Max → preview → create Chaos draft → edit and publish → collect while Max is closed → reopen Max, see status and permitted summary → open detailed results in Chaos.

## Done (implemented; verification noted)
- [x] AI backend retired to `AI_FEATURE_RETIRED` tombstones; AI modal, admin AI settings, PDF/OCR dependencies removed; legacy `aiJobs`/`isAiGenerated` data retained. Admin `aiQuizCount` and `aiLimitPopupText` argument removed. Covered by `tests/integration/aiRetirement.test.ts`.
- [x] Quiz drafts: new quizzes start private; incomplete questions can be saved; publication validated server-side (`publishQuiz`); respondents get `publishedSnapshot`; sessions snapshot the version they answered.
- [x] `saveQuizDraft` saves metadata, settings and ordered questions atomically with revision conflict detection.
- [x] Quiz editor rewrite: all four question types, local recovery, undo/redo, conflict banner, offline state, bulk actions, publish / publish changes / unpublish, publication checklist.
- [x] Manual grading keeps `originalPointsEarned`, reviewer and time; results page shows the automatic grade with "Restore"; grading keywords shown correctly.
- [x] Quiz question pools (`poolSize`, drawn per attempt) and held results (`resultRelease: "manual"`, release/hold from Results; respondents see results on the same device once released).
- [x] Quiz results export: CSV (formula-safe) and real `.xlsx`.
- [x] Forms data model (`convex/formModel.ts`) and shared pure logic (`convex/formLogic.ts`): 18 field types, branching with section rules, calculated score, piping, multiple endings, publication checks (later/missing references, impossible rules), answer validation that drops hidden answers, aggregates, small-group suppression, formula-safe CSV.
- [x] Form lifecycle (`convex/forms.ts`): drafts with revisions and conflict detection, immutable published versions, restore version into draft, approval for editors, status (live/closed/archived), duplicate, delete with batched purge, collaborators (editor/viewer, invite by email), comments, activity log, templates (6 bilingual built-ins + own), portable export.
- [x] Respondent backend (`convex/respond.ts`): idempotent submissions keyed by client key, partial responses only when enabled, access (public/signed-in/code), open/close dates, response caps that refuse rather than discard, one-per-person for signed-in only, edit-after-submit via private token hash, private 30-day resume links, controlled uploads (type/size allowlist), rate limits, spam flagging (honeypot, too fast) that never discards.
- [x] Results backend (`convex/formResults.ts`): paginated inbox with status/reviewed/tag/spam/search filters, response detail with answered/skipped/not-shown states and file links, bulk reviewed/tags/spam/delete with exact counters, saved views, analysis (distributions, averages, matrix tables, completion rate, average/median time, per-day, branch-aware abandonment, endings, languages), paginated export.
- [x] Notifications (in-app, deduplicated) for responses, rule matches, 80%/100% of limit, approvals, comments; bell in the dashboard header.
- [x] Scheduled jobs (`convex/crons.ts`): retention deletion, orphaned uploads, expired resume copies, idempotency and rate-limit rows.
- [x] Forms UI: list with folders/search/archive, templates, importer (Chaos, Typeform, Google Forms, pasted text for Microsoft Forms/documents) with preview; builder (Build, Logic + debugger, Translate, Design + live preview, Settings, Share, Team, History), autosave with undo/redo, recovery and conflict resolution; respondent page `/f/[shareId]` (Arabic/English switch with RTL, three presentations, local progress, resume link, receipts, edit link, embed mode, noindex by default); responses page (inbox, analysis, CSV/XLSX/JSON export).
- [x] Integration API v1 (`convex/integrations.ts`, `convex/http.ts`, `convex/integrationContract.ts`) per `docs/integration-api-v1.md`: hashed scoped tokens, selected/all access, idempotency with replay and reuse detection, `If-Match` revisions, draft-only updates, summaries with suppression, definitions with dropped-feature report, rate limit. Connections page in the dashboard.
- [x] Admin: platform per-form response limit for non-elevated owners.
- [x] Max (`C:/Users/Lenovo/max`, branch `feat/chaos-linked-items`): connection settings with OS-encrypted token outside the database, linked cards with cached status/summary and fetch time, link existing, create draft from explicit fields or database properties with exact preview, edit and "Update Chaos draft" with change preview and conflict comparison, pending request retry/discard with the same idempotency key, unlink without deleting, template copy with compatibility report, migration 19.

## Verification (this session)
- Chaos: `tsc --noEmit` (app and convex) pass; ESLint 0 errors (warnings pre-existing style); unit 7 files / 36 tests pass; integration 7 files / 35 tests pass; `next build` passes when `NEXT_PUBLIC_CONVEX_URL` is a real URL (see blockers).
- Max: `tsc -b`, `eslint . --max-warnings=0`, unit 63 files / 361 tests, integration 35 files / 337 tests all pass.
- Not verified: live browser walkthrough of the acceptance journey against a deployed Convex backend (no deployment performed by agreement).

## Blockers and follow-ups
- `.env.production.local` contains Vercel placeholders (`"[SENSITIVE]"`) for public keys, so a local `next build` fails until real values are exported; CI/Vercel builds use real values.
- Custom domains need DNS/certificate work by the operator; the Share tab explains this. Email delivery (receipts, invitations, notifications) has no provider; notifications are in-app only and receipts are on-screen/downloadable.
- `convex/_generated/api.d.ts` was regenerated by hand to list the new modules; run `npx convex dev` (or `codegen`) once against the dev deployment to confirm.
- Deploying adds new tables, indexes, crons and HTTP routes; existing quiz data is untouched.

## Current request (2026-09-29): admin, moderation, plans and PostHog
Outcome: admin-only user/content controls, operational analytics, 30-day Pro grants reverting to Free, support contact and PostHog integration.
- [x] Verified-email admin access, suspensions/bans, durable content holds and audit history.
- [x] 30-day renewable plan grants, scheduled expiry and entitlement enforcement.
- [x] Admin UI for users/forms/quizzes and bounded operational analytics.
- [x] PostHog client (posthog-js) with privacy-conscious screen tracking; support email khomod14@gmail.com.
- [ ] PostHog needs NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST set on Vercel (the interactive wizard was not run); admin, plans and holds need a Convex deploy.
- [x] Verify authorization, moderation and expiry tests; typecheck, lint, build, browser and final diff.
- [x] Checks after merging main: tsc, ESLint 0 errors, unit 105, integration 51.

## Current request (2026-09-29): results page rebuild and our own dropdown
- [x] Results page: summary header (responses, completion, time, last response, 30-day sparkline; quiz average/median/50%+), Summary tab first with per-question cards (bars, number stats + histogram, date spread, searchable written answers, quiz % correct and most common wrong answer), Responses tab (search, Status/Reviewed/Tag/Folder chips, sort, saved views menu, keyboard list, reading pane or sheet with previous/next, reviewed, tags, print, in-app delete), Export cards. Keeps edit history and scale labels.
- [x] Backend: getAnalysis adds median/histogram, dates, written answers, quiz stats, lastResponseAt; listResponses takes an optional order (convex/formAnalysis.ts, tests).
- [x] components/workspace/Select.tsx replaces every native select in the workspace and builder; FormRenderer keeps the native select for respondents.
- [x] Thank-you screen centred on phones; "More" tab button uses one chevron; workspace hides the body grain layer that caused scroll seams.
- [ ] Manual check in a signed-in browser: scroll the results page on Chrome/Safari to confirm the seams are gone; print a response.

## Sol Learn backend and contract delivery (2026-09-30)
Outcome: Chaos owns durable assets, permissions, versions, sources, learning evidence and versioned client contracts. Work in Documents/chaos on main; preserve Opus UI/lib/learn changes and existing APIs/data.
Completion checks: validated Chaos block schema; immutable publication and recoverable revision-checked drafts; negative ownership/source-access tests; safe generic folders and versioned curricula; existing backend regression checks; explicit accounting of remaining roadmap work.
- [ ] Implement lesson/source schema and lifecycle, publication/reference validation, restore, forks and bounded reads.
- [ ] Implement generic folder membership and cycle-safe nesting (parallel bounded worker).
- [ ] Implement canonical versioned curriculum graph and coverage mappings (parallel bounded worker).
- [ ] Add source permission separation, provenance and secure content access.
- [ ] Verify backend lifecycle/security tests, typechecks, existing integration tests and final diff.
- [ ] Continue community/learning/MCP/API layers and record remaining roadmap phases accurately; do not present all 170 items as complete.
### Learn MCP and v2 integration delivery
- [x] Extract shared actor-based lesson create/save/publish/restore/lifecycle/fork/read/block helpers; preserve existing public handlers and API semantics.
- [x] Add Learn MCP tools and secret-protected internal dispatch with active account validation, stable IDs, bounded reads/search, metadata-only sources and explicit publication.
- [x] Validate publication metadata, source/media/quiz access, stable concept IDs and bounded curriculum mappings; freeze curriculum mappings and audience in immutable versions.
- [x] Mount v2 Learn integration routes before v1 fallback and mount authenticated source upload and guarded content download handlers.
- [x] API worker delivered v2 scoped lesson reads/draft writes/block edits/link-only unlink and native owner setLessonSelection; explicit selections remain required even for legacy access:all.
- [x] Verify 97 tests in eight targeted integration suites, including 14 Learn MCP tests; scoped ESLint and diff whitespace checks passed. No deployment or commit.
- [x] Add exact roadmap MCP names for search, outline, selected lesson source metadata and separate add/update/move/delete block tools.
- [ ] Folder/curriculum MCP tools remain pending.
- [ ] Complete parent-wide verification and remaining roadmap phases; an earlier Convex typecheck passed, but the latest run encountered concurrent circular-inference errors in mcpOrganization.ts:17-20. Full-project typecheck has errors outside this worker's owned files; see delivery report.

### e2e delivery update
- [x] Durable lesson/source lifecycle, validation, immutable versions/recovery/forks, independent source access, generic folders and curriculum versions/mappings.
- [x] Community/moderation, concept evidence/adaptive question references, bounded permitted context, BlockNote translation, MCP lessons/folders/curricula and draft-only integration v2.
- [x] Official development codegen and app/backend typechecks; integration regression 478 passed, one todo (two workers). MCP registration regression fixed.
- [ ] Nine concurrent Learn UI lint errors; UI backend wiring and live acceptance remain unverified.
- [ ] Complete later/external roadmap phases; do not claim all 170 complete.
- [ ] Push scoped backend/contracts snapshot to e2e before main; keep shared main checkout and Opus changes intact.
