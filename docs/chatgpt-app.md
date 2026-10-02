# Chaos in ChatGPT: setup, testing and submission

The Chaos ChatGPT app is an MCP server at **`https://chaos.fail/mcp`**. It works with ChatGPT, Claude and other MCP clients, and it's free on every plan. People connect it with their Chaos account (OAuth) and the assistant can then create, edit and publish forms, quizzes, lessons, courses and flashcards, and read results and responses in that account. Chaos itself runs no AI; the assistant does the writing.

**Publishing.** The owner chose that content created through MCP goes live straight away: `create_form`, `create_game_draft`, `create_lesson`, `create_full_course` and `create_flashcard_set` publish after creating (lessons, courses and flashcards as public) unless the assistant passes `publish: false`. If publication is blocked (for example a quiz without answers), the item stays a draft and the problems are returned. Edits to existing content stay drafts until `publish_form`, `publish_lesson` or `publish_course`.

## How it fits together

```
ChatGPT ──OAuth (PKCE, DCR/CIMD)──▶ Clerk (clerk.chaos.fail)
   │
   └─ MCP (Streamable HTTP, Bearer token) ─▶ Next.js  app/mcp/route.ts
                                               │ verifies the Clerk OAuth token
                                               │ (clerkClient.authenticateRequest, acceptsToken: oauth_token)
                                               ▼
                                   Convex  POST /api/mcp/v1  (convex/http.ts)
                                   Bearer CHAOS_MCP_SECRET + verified Clerk user id
                                               ▼
                                   convex/mcp.ts  (ownership, roles, plan limits, 120 calls/min per person)
```

| Piece | File |
|---|---|
| Tool definitions, descriptions, annotations, schemas | `lib/mcp/server.ts` |
| MCP endpoint + OAuth token check | `app/mcp/route.ts` |
| Protected resource metadata (RFC 9728) | `app/.well-known/oauth-protected-resource/route.ts` and `…/mcp/route.ts` |
| Authorization server metadata (Clerk mirror) | `app/.well-known/oauth-authorization-server/route.ts` |
| OpenAI domain verification | `app/.well-known/openai-apps-challenge/route.ts` |
| Backend functions | `convex/mcp.ts`; MCP game wrappers in `convex/mcpGames.ts`; translation and validation in `convex/mcpContract.ts` |
| Theme presets for the tools (resolved on the Next.js side, because Convex cannot import `components/`) | `lib/mcp/themes.ts`, palettes in `components/forms/formThemes.ts` |
| Public help page | `app/chatgpt/page.tsx` → https://chaos.fail/chatgpt |
| Tests | `tests/unit/mcpContract.test.ts`, `tests/unit/mcpServer.test.ts`, `tests/unit/mcpGames.test.ts`, `tests/integration/mcp.test.ts`, `tests/integration/mcpGames.test.ts` |

### Tools

| Tool | What it does | readOnly | destructive | openWorld |
|---|---|---|---|---|
| `search_forms` | List/search the person's forms, quizzes and classic quizzes | true | false | false |
| `get_form` | Questions, options, answer key, publish readiness, links | true | false | false |
| `get_results` | Counts, completion, averages, per-question distributions, quiz average | true | false | false |
| `list_responses` | Individual completed responses as text (paged, max 25) | true | false | false |
| `create_form` | New form/survey/quiz with all questions, **published** unless `publish: false` | false | false | **true** |
| `update_form` | Edit a draft; a sent question list replaces the old one | false | **true** | false |
| `publish_form` | Publish the draft and return the public link | false | false | **true** |
| `list_themes` | The looks (presets) and the choices for fonts, buttons, start screens, backdrops, radius, layouts and sound packs | true | false | false |
| `set_form_theme` | Apply a preset by name and/or set accent, page, card and text colours (hex), font, radius, buttons, start screen, backdrop, layout, fixed/auto dark mode on the draft | false | false | false |
| `set_form_sound` | Pick the sound pack respondents hear: soft (Glass), pop, wood, arcade, or off | false | false | false |
| `set_form_status` | Close, reopen, archive, restore (never delete) | false | false | false |

`create_form` also takes an optional `theme` (preset name) and `sound`. ChatGPT is told to pick a theme that suits the form; without one it uses the Google Forms style. Sound is on (Glass) unless `sound` is `off`. Forms made in Chaos itself start silent.

#### Live game tools

- `create_game_draft`: creates an ordinary quiz with 1–100 questions and publishes it unless `publish: false`. Each must be single choice, multiple choice or dropdown, with 2–4 distinct nonempty options and an explicit correct answer. Uses the same themes and builder as forms; default theme is Evergreen. Returns the `form_…` ID and links; never opens a room. Read-only: false; destructive: false; open-world: true; idempotent: false.
- `list_games`: lists only the signed-in account's hosted rooms, newest first, with cursor pagination (default 20, max 50). Includes ended rooms; use `search_forms` to find quiz drafts. Read-only and idempotent.
- `get_game`: gets the owned room's state, question index, timer, settings, source ID and host/join links. No question text, answer keys, participant names, player tokens or individual answers are returned, including after reveal. Read-only and idempotent.
- `host_game`: snapshots an owned, already published quiz into a joinable lobby. Takes the source `form_…` or `quiz_…` ID, optional language (`en`/`ar`), theme preset name, `timeLimitSec` (5–240), `showAnswerLabels` (default true), `autoAdvance` (default true), `breakSec` (3–60, default 5) and `startWhenPlayers` (0 = host starts). Closed/archived forms, drafts, non-quizzes, and quizzes without eligible graded choices are refused. Does not publish draft changes or start play. Opening a room is an open-world write, non-destructive and non-idempotent: do not retry automatically after an uncertain response.
- `set_game_settings`: theme, timer, answer labels and `startWhenPlayers` change only in the lobby; `autoAdvance` and `breakSec` change at any time (false pauses autoplay, true resumes it). Send at least one setting. The source quiz and published version are untouched. Open-world write, non-destructive and idempotent.
- `advance_game`: advances exactly one step using `from` and `questionIndex` from `get_game`. Lobby → question → reveal → leaderboard → next question/end. With autoplay on, only needed to start without the countdown or to skip ahead. Requires a joined player to start. Advancing from question ends that question early, so it requires the host's explicit request. Repeating the same state/index is harmless. Open-world write, destructive and idempotent.
- `end_game`: explicitly stops an owned room and uses the ordinary live-game result-saving workflow. Does not delete the source or collected responses. Returns aggregate save status/counts; repeating for an ended room is harmless. Open-world write, destructive and idempotent.

Creation publishes the quiz; hosting stays a separate action: **create_game_draft → host_game when asked**. Follow `hostUrl` to project the game and `joinUrl`/PIN for players. Games run themselves by default: each question closes on its timer, the answer and leaderboard each show for `breakSec`, and the next question starts. Pressing Start (or reaching `startWhenPlayers`) shows a 5-second countdown first. `get_game` returns `nextStepAt` and `startsAt`. When labels are hidden, players need to see the host screen to read their options.

Games use the existing account-wide OAuth grant (`openid profile email`), with no new external scope or client-supplied account identity. Next.js verifies Clerk OAuth, then the secret-protected Convex transport passes the verified user ID to internal-only MCP functions. Each game wrapper rechecks Pro entitlement; writes recheck moderation and source/host ownership. Shared nonregistered helpers from `convex/live.ts` enforce live eligibility, clock, grading, transition and result-saving rules. Public live mutations continue deriving identity from `ctx.auth`; MCP never fabricates auth or invokes registered handlers directly. Account Pro checks and the existing 120-calls/minute gate run before dispatch; lobby creation also uses the existing 30/hour live-create limit.

MCP hosting requires source ownership; being a source editor/viewer does not grant access to another person's rooms. Classic quizzes remain read-only for editing/publication, but their owner can host an already published classic quiz. The game tools intentionally omit player moderation, individual participant data, and results analysis; these stay in the host UI or the separately permissioned results tools.

#### Themes and sounds

- **Presets** are the ones in the Design tab. `google-forms` is the default (looks like Google Forms; `microsoft-forms` looks like Microsoft Forms; `paper` is the plain card look). `chaos` is shown as Evergreen and both names work, as do "Typeform" (Spotlight), "Google Forms" (Google Forms style) and "Microsoft Forms" (Microsoft Forms style). Names ignore case, spaces and hyphens.
- **Where the data lives.** Preset palettes stay in `components/forms/formThemes.ts`. `lib/mcp/themes.ts` turns a name into the preset's full look and sends it to Convex, which validates every value again (hex colours, enum values, preset id) in `convex/mcpContract.ts`. The small WCAG contrast check is duplicated in `mcpContract.ts`, and a unit test asserts it matches `contrastIssues` in the app for every preset.
- **How edits are stored.** Theme and sound changes go through the same path as `update_form` (`convex/mcp.ts` `updateForm`): they change the draft only, need editor access, respect `expectedRevision`, refuse archived forms and read-only accounts, and count against the 120 calls per minute. On a published form the live version is unchanged until `publish_form`.
- **`preset` semantics.** Applying a preset sets `theme.preset` to its id. Overriding single properties keeps that id, so the app shows "Google Forms style · edited" and can reset it. Overriding properties on an older form without a preset makes it a full `custom` theme.
- **Kept on change:** the logo, and the sound unless `set_form_sound` (or `sound` on create) is used. Presets never switch sound on.
- **Contrast.** Unreadable colour pairs are saved but returned as `warnings` (text 4.5:1, accent on the page 3:1), and the tool description tells ChatGPT to fix them.
- `get_form` also returns the current `theme` (preset, colours, font, buttons, cover, backdrop, layout, appearance, sound), so "make it dark" starts from what is there.

Example prompts: "make it dark", "use the Typeform look", "change the accent to our brand blue #1a56db", "use a serif font with rounded buttons", "turn on arcade sounds", "make it silent again".


Rules the backend enforces (the theme and sound tools follow the `update_form` rules): available on every plan; create publishes unless told not to; owner or editor to edit/publish (approval rules respected); owner only for status; archived forms must be restored first; classic quizzes are read-only; banned or suspended accounts are read-only; nothing can be deleted.

## 1. One-time production setup

You do these steps; they change production.

1. **Generate the shared secret** (keep it private):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **Convex (production):**
   ```bash
   npx convex env set --prod CHAOS_MCP_SECRET <secret>
   npx convex env set --prod CHAOS_APP_URL https://chaos.fail
   ```
3. **Vercel → Project → Settings → Environment Variables (Production):** add `CHAOS_MCP_SECRET` with the **same** value. Check that `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are the **production** Clerk keys and `NEXT_PUBLIC_CONVEX_URL` is the production deployment.
4. **Clerk dashboard (production instance) → Configure → OAuth applications → Settings:**
   - Turn on **Dynamic client registration (DCR)** and require PKCE. Turn on **CIMD** support too if offered; ChatGPT prefers it.
   - Default scopes for dynamic clients: `openid profile email`.
   - Keep the **consent screen** on, so people see "ChatGPT wants to access your Chaos account".
   - If Clerk asks for allowed redirect URIs, add `https://chatgpt.com/connector_platform_oauth_redirect` (and allow `https://chatgpt.com/connector/oauth/*` if patterns are supported).
5. **Deploy:** merge the PR (Vercel deploys the site), then deploy Convex: `npx convex deploy`. This adds the `admins` table and the MCP functions.
6. **Restore your admin access.** Admins now live in the database, so run this once after the Convex deploy:
   ```bash
   npx convex run --prod admin:grantAdmin '{"email":"<your sign-in email>"}'
   ```
7. **Smoke test:**
   ```bash
   curl https://chaos.fail/.well-known/oauth-protected-resource/mcp
   # → {"resource":"https://chaos.fail/mcp","authorization_servers":["https://clerk.chaos.fail"],...}
   curl -s https://chaos.fail/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   # → the 18 tools
   ```
   You can also point the MCP Inspector at it: `npx @modelcontextprotocol/inspector` → Streamable HTTP → `https://chaos.fail/mcp` → Connect (it runs the OAuth flow).

## 2. Test it in ChatGPT on production (developer mode)

1. In ChatGPT (web), open **Settings → Apps** (called "Apps & Connectors" in some versions) **→ Advanced settings** and turn on **Developer mode**. Business and Enterprise workspaces need an admin to allow it.
2. Back in **Settings → Apps**, choose **Create app**:
   - Name: `Chaos` · Description: `Create quizzes and forms in Chaos` · Icon: `public/icon.svg` exported as a PNG
   - MCP server URL: `https://chaos.fail/mcp`
   - Authentication: **OAuth** (leave client ID/secret empty; ChatGPT registers itself through DCR/CIMD)
   - Tick "I trust this application" → **Create**.
3. ChatGPT opens the Clerk sign-in → approve the consent screen. The app shows as connected with 18 tools.
4. In a new chat, choose **+ → Developer mode → Chaos** (or just name Chaos in the prompt) and try:
   - *"Let's talk about the solar system for a bit"* … then *"Create me a quiz of what we discussed using Chaos"*
   - *"Show me my Chaos forms"*
   - *"How is that quiz doing?"* / *"Publish it"*
5. ChatGPT asks for confirmation before write tools. The new quiz appears in your Chaos library, published, with a history entry from "Connected app · ChatGPT".
6. After changing tools, use **Refresh** on the app in Settings → Apps so ChatGPT reloads the tool list.

If something fails, check Vercel logs for `/mcp` and the Convex logs for `mcp:*` functions. `NOT_CONFIGURED` means `CHAOS_MCP_SECRET` is missing in Vercel; `401 UNAUTHORIZED` from Convex means the two secrets differ.

## 3. Submission packet (OpenAI Platform → Plugins → Submit)

Before you start: the submitting account needs the **Apps Management: Write** role, and the organization needs a **verified individual or business identity**.

### Info
- **Plugin name:** Chaos
- **Short description:** Create quizzes, forms and surveys, and check the results, in your Chaos account.
- **Long description:**
  Chaos is a simple, beautiful form and quiz builder. With the Chaos app, ChatGPT works in your own Chaos account: turn a conversation into a quiz with right answers and points, draft a survey or signup form, edit questions, and publish when you're ready. Ask how a form is doing and get response counts, answer breakdowns and average quiz scores, or read individual responses when you need them. Everything ChatGPT creates starts as a draft you can review, and nothing is ever deleted from ChatGPT. Works in English and Arabic. The Chaos app is included with Chaos Pro; new accounts get a 30-day Pro trial.
- **Category:** Productivity (alternative: Education)
- **Logo:** `public/icon.svg` exported as a square PNG (at least 512×512, no transparency padding issues)
- **Website:** https://chaos.fail
- **Support:** https://chaos.fail/chatgpt (contact: khomod14@gmail.com)
- **Privacy policy:** https://chaos.fail/privacy (has a "Using Chaos in ChatGPT" section)
- **Terms:** https://chaos.fail/terms

### MCP
- **URL type:** Universal · **MCP Server URL:** `https://chaos.fail/mcp`
- **Authentication:** OAuth 2.1 (Clerk, DCR/CIMD, PKCE S256). Scopes: `openid profile email`.
- **Demo credentials:** create a dedicated reviewer account in the **production** Clerk instance with email + password, **no MFA, no email code**. Check in Clerk → Configure → Attack protection / Client Trust that new-device email verification is **off** for it, or reviewers will be blocked. Seed it with: 1 live form with 5+ responses, 1 quiz, 1 draft (see "Test cases"). **Give it Pro with a long expiry** (`/admin` → Users → Plan) — the app refuses Free accounts, so reviewers would otherwise be blocked once the trial ends.
- **Content Security Policy:** none. The app has no UI component (text and structured results only).
- **Domain verification:** copy the token into Vercel as `OPENAI_APPS_CHALLENGE_TOKEN`, redeploy, check that `https://chaos.fail/.well-known/openai-apps-challenge` returns exactly the token, then verify.
- **Scan Tools:** should find the 18 tools above with titles, descriptions, input and output schemas, annotations and `securitySchemes`.

### Tool justifications (paste per tool)
- `search_forms`: read-only lookup of the signed-in person's own forms; no side effects, bounded to their account.
- `get_form`: read-only; returns one form's questions and answer key to the owner or collaborators.
- `get_results`: read-only aggregate statistics; contains no individual answers.
- `list_responses`: read-only; returns individual responses that the person already sees in Chaos. The description tells the model to use it only on request.
- `create_form`: creates the form and publishes it (anyone with the link can respond) unless `publish: false`, so `openWorldHint: true`.
- `update_form`: `destructiveHint: true` because a sent question list replaces the draft's questions (removed questions leave the draft; collected responses are kept and the live version is unchanged until publishing).
- `publish_form`: `openWorldHint: true` because it makes the form reachable by anyone with its link.
- `list_themes`: read-only, static list of looks and options; no data from the account.
- `set_form_theme`: changes only the draft's colours, fonts and layout; reversible in Chaos and not visible to respondents until publishing. Nothing is deleted.
- `set_form_sound`: changes only the draft's sound pack (opt-in, default off); reversible and not visible to respondents until publishing.
- `set_form_status`: reversible state change (close/reopen/archive/restore); cannot delete.

### Starter prompts
- Make a quiz about what we just discussed, using Chaos.
- Create a Chaos feedback form for my workshop with a rating and one open question.
- How are my Chaos forms doing this week?
- Summarize the results of my latest Chaos quiz.
- Make my Chaos workshop form dark, and turn on arcade sounds.

### Test cases — positive (5)
1. **Prompt:** "We talked about photosynthesis. Create me a 5-question quiz of what we discussed using Chaos." → `create_form` with `quizMode: true`, single-choice questions with `correctAnswers` and points → returns a draft with `readyToPublish: true` and an edit link. *Fixture:* none.
2. **Prompt:** "List my Chaos forms." → `search_forms` → the reviewer account's items with status and response counts. *Fixture:* seeded forms.
3. **Prompt:** "How is 'Workshop feedback' doing?" → `search_forms` then `get_results` → response count, rating average, option breakdown. *Fixture:* live form "Workshop feedback" with 5+ responses.
4. **Prompt:** "Add a question 'Would you come again?' (Yes/No) to my Workshop feedback draft and publish it." → `get_form`, `update_form` (full list with ids), `publish_form` → public `shareUrl`. *Fixture:* same form.
5. **Prompt:** "Close my quiz 'Chapter 3 review'." → `search_forms`, `set_form_status` `close` → status `closed`. *Fixture:* live quiz "Chapter 3 review".

### Test cases — negative (3)
1. **Prompt:** "Delete all my Chaos forms." → No delete tool exists; the model explains it can archive them instead and that deleting happens in Chaos. *Why:* permanent deletion is intentionally not available from ChatGPT.
2. **Prompt:** "Show me the responses to someone else's form, id form_abc123." → `get_form`/`list_responses` returns `NOT_FOUND`; the model says it can't access it. *Why:* tools are scoped to the signed-in account.
3. **Prompt:** "Publish my 'Empty draft' form." (a draft with no questions) → `publish_form` returns `PUBLICATION_BLOCKED: Add at least one question.`; the model offers to add questions first. *Why:* incomplete forms can't go live. *Fixture:* draft "Empty draft" with no questions.

### Test case — negative (extra, optional)
4. **Prompt (Free account):** "Show my Chaos forms." → every tool returns `PRO_REQUIRED: Chaos in ChatGPT is part of Chaos Pro…`; the model explains the app needs Pro. *Why:* the app is a paid feature.

### Global
Pick the countries where Chaos's terms and support apply (for example all available regions, or start with the ones you support).

### Release notes (initial submission)
Initial release of the Chaos app (requires Chaos Pro; new accounts get a 30-day trial, and the reviewer account has Pro). Lets people create quiz, form and survey drafts, edit and publish them, change their status, and read results and responses in their own Chaos account. OAuth via Clerk (DCR/CIMD + PKCE). No UI component. Reviewer account: <email> / <password> (no MFA); it contains a live form "Workshop feedback" with responses, a live quiz "Chapter 3 review" and a draft "Empty draft".

## Limits and known gaps
- No inline UI widget yet; ChatGPT shows text with links. A card widget would need CSP and a dedicated widget domain for review.
- Classic quizzes (the old quiz editor) are read-only for editing/publication through ChatGPT; owners can host a published classic quiz with host_game.
- Themes: ChatGPT can pick presets and change colours, fonts, buttons, start screen, backdrop and layout, but cannot upload a logo or a background image. An existing logo is kept.
- File-upload questions and custom endings can't be created from ChatGPT; they are kept when editing.
- Each person's calls are limited to 120 per minute.
