# Chaos in ChatGPT: setup, testing and submission

The Chaos ChatGPT app is an MCP server at **`https://chaos.fail/mcp`**. It works with ChatGPT, Claude and other MCP clients, and it's free on every plan. People connect it with their Chaos account (OAuth) and the assistant can then create, edit and publish forms, quizzes, lessons, courses and flashcards, and read results and responses in that account. Chaos itself runs no AI; the assistant does the writing.

**Publishing.** Content created through MCP starts as a private draft the person can review: `create_form`, `create_game_draft`, `create_lesson`, `create_full_course` and `create_flashcard_set` publish only when the assistant passes `publish: true`, which it does only when the person explicitly asks (lessons, courses and flashcards then default to public). If publication is blocked (for example a quiz without answers), the item stays a draft and the problems are returned. Edits to existing content stay drafts until `publish_form`, `publish_lesson` or `publish_course`.

## How it fits together

The diagram and hosted-product setup below describe Clerk. Self-hosted Better Auth
deployments use the app's OAuth discovery/JWKS, a single MCP JWT resource audience
and an explicit client allowlist instead. Register approved connector clients
with exact redirects and PKCE; automatic DCR/CIMD registration is not supplied
by the Better Auth setup. See [Better Auth integration setup](./self-hosting.md#optional-integrations).

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
| Backend functions | `convex/mcp.ts`; MCP game wrappers in `convex/mcpGames.ts`; Learn lesson wrappers in `convex/mcpLearn.ts`; course wrappers in `convex/mcpCourses.ts`; flashcard wrappers in `convex/mcpFlashcards.ts`; assessment wrappers in `convex/mcpAssessments.ts`; organization/folder wrappers in `convex/mcpOrganization.ts`; advanced form wrappers in `convex/mcpAdvancedForms.ts`, `convex/mcpFormManagement.ts`; translation and validation in `convex/mcpContract.ts` |
| Theme presets for the tools (resolved on the Next.js side, because Convex cannot import `components/`) | `lib/mcp/themes.ts`, palettes in `components/forms/formThemes.ts` |
| Public pages | `app/[lang]/(site)/chatgpt/page.tsx` → https://chaos.fail/chatgpt and `app/[lang]/(site)/claude/page.tsx` → https://chaos.fail/claude (both `components/site/IntegrationView.tsx`) |
| Shared integration metadata (name, logo, URLs, version) | `lib/integrations/index.ts` |
| Downloadable Claude and ChatGPT plugin packages | `lib/integrations/packages.ts`, served by `app/api/plugins/[file]/route.tsx`; see [AI integrations](./ai-integrations.md) |
| Tests | `tests/unit/mcpContract.test.ts`, `tests/unit/mcpServer.test.ts`, `tests/unit/mcpGames.test.ts`, `tests/unit/mcpCourses.test.ts`, `tests/unit/mcpCommunity.test.ts`, `tests/integration/mcp.test.ts`, `tests/integration/mcpGames.test.ts`, `tests/integration/mcpCourses.test.ts`, `tests/integration/learnMcp.test.ts`, `tests/integration/learnOrganizationMcp.test.ts` |

### Tools

#### Form and quiz tools

| Tool | What it does | readOnly | destructive | openWorld |
|---|---|---|---|---|
| `search_forms` | List/search the person's forms, quizzes and classic quizzes | true | false | false |
| `get_form` | Questions, options, answer key, publish readiness, links | true | false | false |
| `get_results` | Counts, completion, averages, per-question distributions, quiz average | true | false | false |
| `list_responses` | Individual completed responses as text (paged, max 25) | true | false | false |
| `create_form` | New form/survey/quiz with all questions, as a draft; **published** only with `publish: true` | false | false | **true** |
| `update_form` | Edit a draft; a sent question list replaces the old one | false | **true** | false |
| `publish_form` | Publish the draft and return the public link | false | false | **true** |
| `list_themes` | The looks (presets) and the choices for fonts, buttons, start screens, backdrops, radius, layouts and sound packs | true | false | false |
| `set_form_theme` | Apply a preset by name and/or set individual theme properties on the draft | false | false | false |
| `set_form_sound` | Pick the sound pack respondents hear: soft (Glass), pop, wood, arcade, or off | false | false | false |
| `set_form_status` | Close, reopen, archive, restore (never delete) | false | false | false |

#### Advanced forms, collaboration and quiz forks

| Tool | What it does | readOnly | destructive | openWorld |
|---|---|---|---|---|
| `get_form_advanced_analytics` | Aggregate analytics: correct rates, completion times, score distribution | true | false | false |
| `export_form_responses` | Export responses as CSV/XLSX/JSON; returns a secure download link | false | false | **true** |
| `list_form_collaborators` | List collaborators and permissions on an owned form | true | false | false |
| `change_form_collaborator` | Invite, update role or remove a collaborator | false | **true** | **true** |
| `set_form_branching` | Configure question jump logic and conditional branches | false | **true** | false |
| `upsert_form_file_question` | Add or update file upload questions on an owned draft | false | false | false |
| `get_form_response_controls` | Inspect submission caps, closing dates, respondent limits | true | false | false |
| `set_form_response_controls` | Set submission caps, closing dates and access controls | false | **true** | false |
| `fork_quiz` | Fork a published quiz into a new owned draft | false | false | false |
| `get_quiz_fork_lineage` | Trace fork provenance and original author credit | true | false | false |
#### Advanced form tools

| Tool | What it does | readOnly | destructive | openWorld |
|---|---|---|---|---|
| `set_form_branching` | Replace or clear one field/ending visibility rule on the draft | false | false | false |
| `upsert_form_file_question` | Create or update a file-upload question in the draft | false | false | false |
| `get_form_response_controls` | Read owned form response controls and settings revision | true | false | false |
| `set_form_response_controls` | Change response access, dates, limits, retention, hidden fields | false | **true** | **true** |
| `get_form_advanced_analytics` | Owner-only aggregate analytics: correct rates, completion times, distributions | true | false | false |
| `export_form_responses` | Export responses as CSV/XLSX/JSON; returns a download link (24h) | false | false | **true** |
| `list_form_collaborators` | Owner-only collaborator list and membership snapshot | true | false | false |
| `change_form_collaborator` | Invite, change role or remove a collaborator | false | **true** | **true** |
| `fork_quiz` | Fork a published quiz into a new owned draft | false | false | false |
| `get_quiz_fork_lineage` | Read the fork lineage of a quiz | true | false | false |

#### Learn lesson tools

| Tool | What it does | readOnly | destructive | openWorld |
|---|---|---|---|---|
| `create_lesson` | Create a private lesson draft from Chaos blocks | false | false | false |
| `get_lesson` | Read up to 100 blocks of a draft, published or outline view | true | false | false |
| `list_lessons` | List owned lessons or search public published lessons | true | false | false |
| `search_lessons` | Alias for `list_lessons`; search owned or public lessons | true | false | false |
| `save_lesson_draft` | Revision-protected full draft replacement | false | **true** | false |
| `edit_lesson_blocks` | Atomic append/update/move/delete block operations | false | **true** | false |
| `add_lesson_blocks` | Append blocks to the draft | false | false | false |
| `update_lesson_blocks` | Replace named existing blocks only | false | **true** | false |
| `move_lesson_blocks` | Reorder blocks in the draft | false | false | false |
| `delete_lesson_blocks` | Remove blocks from the draft | false | **true** | false |
| `publish_lesson` | Owner-only explicit publication with visibility | false | false | **true** |
| `set_lesson_lifecycle` | Archive, unpublish or reactivate a lesson | false | **true** | **true** |
| `restore_lesson_version` | Restore a published version into the draft | false | **true** | false |
| `fork_lesson` | Copy a published version into a new private draft | false | false | false |
| `list_lesson_versions` | Inspect version metadata history | true | false | false |
| `get_lesson_version` | Read blocks from an immutable published version | true | false | false |
| `get_lesson_outline` | Read the outline of a draft or published lesson | true | false | false |
| `get_lesson_sources` | Read source metadata cited in a lesson | true | false | false |
| `get_learn_source_metadata` | Read independently authorized source metadata | true | false | false |
| `get_learn_capabilities` | Discover deployed schema, block/file limits | true | false | false |

#### Course tools

| Tool | What it does | readOnly | destructive | openWorld |
|---|---|---|---|---|
| `create_course` | Create an owned course draft | false | false | false |
| `get_course` | Read course metadata, ordered lesson summaries and revision | true | false | false |
| `update_course` | Edit course draft metadata (title, description, tags, cover, language) | false | false | false |
| `set_course_outline` | Replace the ordered lesson list (does not delete lessons) | false | **true** | false |
| `add_course_lesson` | Create a blank lesson draft at the end of the course | false | false | false |
| `publish_course` | Publish the course and its outlined lessons with visibility | false | **true** | **true** |

#### Assessment tools

| Tool | What it does | readOnly | destructive | openWorld |
|---|---|---|---|---|
| `attach_lesson_quiz` | Attach an owned quiz to an owned lesson | false | false | false |
| `get_lesson_quizzes` | List assessment references linked to a lesson | true | false | false |
| `create_lesson_live_game` | Create a live game room from a lesson's assessment | false | false | **true** |

#### Glossary tools

| Tool | What it does | readOnly | destructive | openWorld |
|---|---|---|---|---|
| `set_lesson_glossary` | Add or update look-up definitions, translations and explanations for terms in a lesson | false | false | false |
| `get_lesson_glossary` | Read a lesson's look-up glossary | true | false | false |

#### Organization tools

| Tool | What it does | readOnly | destructive | openWorld |
|---|---|---|---|---|
| `create_folder` | Create an owned private folder | false | false | false |
| `list_folders` | List owned folders under a parent | true | false | false |
| `move_folder` | Move a folder to a new parent | false | **true** | false |
| `list_folder_contents` | List folder membership references | true | false | false |
| `add_folder_member` | Add a form, quiz, lesson, source or collection to a folder | false | false | false |
| `list_curriculum_institutions` | Browse public curriculum institutions | true | false | false |
| `list_curriculum_programs` | Browse public curriculum programs | true | false | false |
| `list_curriculum_versions` | Browse public curriculum versions | true | false | false |
| `list_curriculum_nodes` | Browse public curriculum nodes | true | false | false |
| `search_curriculum_modules` | Find canonical modules by name, key or alias within a selected version (maximum 50 results) | true | false | false |
| `list_lesson_curriculum_mappings` | Page through owned draft mapping references and concept/block coverage (ownership required even for public lessons) | true | false | false |
| `create_lesson_curriculum_mapping` | Map a lesson draft to a curriculum node | false | false | false |

#### Community tools

| Tool | What it does | readOnly | destructive | openWorld |
|---|---|---|---|---|
| `save_lesson` | Save/unsave a public lesson to your library | false | false | false |
| `search_learn_directory` | Search public institutions, programs, creators or tags | true | false | false |


`create_form` also takes an optional `theme` (preset name) and `sound`. ChatGPT is told to pick a theme that suits the form; without one it uses the Google Forms style. Sound is on (Glass) unless `sound` is `off`. Forms made in Chaos itself start silent.

#### Live game tools

- `create_game_draft`: creates an ordinary quiz draft with 1–100 questions and publishes it only with `publish: true`. Each must be single choice, multiple choice or dropdown, with 2–4 distinct nonempty options and an explicit correct answer. Uses the same themes and builder as forms; default theme is Evergreen. Returns the `form_…` ID and links; never opens a room. Read-only: false; destructive: false; open-world: true; idempotent: false.
- `list_games`: lists only the signed-in account's hosted rooms, newest first, with cursor pagination (default 20, max 50). Includes ended rooms; use `search_forms` to find quiz drafts. Read-only and idempotent.
- `get_game`: gets the owned room's state, question index, timer, settings, source ID and host/join links. No question text, answer keys, participant names, player tokens or individual answers are returned, including after reveal. Read-only and idempotent.
- `host_game`: snapshots an owned, already published quiz into a joinable lobby. Takes the source `form_…` or `quiz_…` ID, optional language (`en`/`ar`), theme preset name, `timeLimitSec` (5–240), `showAnswerLabels` (default true), `autoAdvance` (default true), `breakSec` (3–60, default 5) and `startWhenPlayers` (0 = host starts). Closed/archived forms, drafts, non-quizzes, and quizzes without eligible graded choices are refused. Does not publish draft changes or start play. Opening a room is an open-world write, non-destructive and non-idempotent: do not retry automatically after an uncertain response.
- `set_game_settings`: theme, timer, answer labels and `startWhenPlayers` change only in the lobby; `autoAdvance` and `breakSec` change at any time (false pauses autoplay, true resumes it). Send at least one setting. The source quiz and published version are untouched. Open-world write, non-destructive and idempotent.
- `advance_game`: advances exactly one step using `from` and `questionIndex` from `get_game`. Lobby → question → reveal → leaderboard → next question/end. With autoplay on, only needed to start without the countdown or to skip ahead. Requires a joined player to start. Advancing from question ends that question early, so it requires the host's explicit request. Repeating the same state/index is harmless. Open-world write, destructive and idempotent.
- `end_game`: explicitly stops an owned room and uses the ordinary live-game result-saving workflow. Does not delete the source or collected responses. Returns aggregate save status/counts; repeating for an ended room is harmless. Open-world write, destructive and idempotent.

Creation makes a quiz draft (published only on request); hosting stays a separate action: **create_game_draft → host_game when asked**. Follow `hostUrl` to project the game and `joinUrl`/PIN for players. Games run themselves by default: each question closes on its timer, the answer and leaderboard each show for `breakSec`, and the next question starts. Pressing Start (or reaching `startWhenPlayers`) shows a 5-second countdown first. `get_game` returns `nextStepAt` and `startsAt`. When labels are hidden, players need to see the host screen to read their options.

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
   - Default scopes for dynamic clients: `openid profile email offline_access` (offline_access gives clients a refresh token, so connections do not lapse after a day).
   - Keep the **consent screen** on, so people see "ChatGPT wants to access your Chaos account".
   - If Clerk asks for allowed redirect URIs, add `https://chatgpt.com/connector_platform_oauth_redirect` (and allow `https://chatgpt.com/connector/oauth/*` if patterns are supported).
5. **Deploy:** merge the PR. With `CONVEX_DEPLOY_KEY` set in Vercel's Production environment, the production deploy runs `convex deploy` before building the site (`scripts/vercel-build.mjs`); without it, run `npx convex deploy` yourself. This adds the `admins` table and the MCP functions.
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
   # → the 69 tools
   ```
   You can also point the MCP Inspector at it: `npx @modelcontextprotocol/inspector` → Streamable HTTP → `https://chaos.fail/mcp` → Connect (it runs the OAuth flow).

## 2. Test it in ChatGPT on production (developer mode)

1. In ChatGPT web, open **Settings > Security and login** and enable **Developer mode** if your account and workspace policy allow it.
2. Open **Plugins**, choose the plus button, and create a connection named `Chaos` with public MCP URL `https://chaos.fail/mcp`.
3. Complete Chaos OAuth sign-in and review the discovered tools. Start a new conversation and add Chaos from the tools menu.
4. Try “Create a quiz about what we discussed using Chaos” or “Show my Chaos forms.” New valid content publishes by default; ask for a draft to keep it private.
5. After tool changes, open the connection and select **Refresh** before starting a new test conversation.

Interface labels vary by rollout. Current official instructions: [OpenAI connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).
If something fails, check Vercel logs for `/mcp` and the Convex logs for `mcp:*` functions. `NOT_CONFIGURED` means `CHAOS_MCP_SECRET` is missing in Vercel; `401 UNAUTHORIZED` from Convex means the two secrets differ.

## 2b. Connect and test in Claude Code (CLI)

The exact same Chaos MCP server (`https://chaos.fail/mcp`) works across ChatGPT, Claude Desktop, and Claude Code using the open Model Context Protocol standard.

1. **Add the remote MCP server in Claude Code**:
   Run the CLI command:
   ```bash
   claude mcp add --transport http chaos https://chaos.fail/mcp
   ```
2. **Authenticate with OAuth**:
   - Claude Code connects to `https://chaos.fail/mcp`.
   - Your browser will open the Clerk OAuth authorization screen for Chaos (`https://chaos.fail`).
   - Sign in to your Chaos account and click **Allow**.
   - Your OAuth grant is securely stored by Claude Code.
3. **Verify with the `/mcp` command**:
   - Inside any Claude Code session, type `/mcp`.
   - You will see `chaos` listed as connected with the public tool set (see [the inventory](./mcp-tool-inventory.md)).
   - Use `/mcp` to manage, inspect, or refresh available tools.
4. **Try commands across Forms, Quizzes, Lessons, and Courses**:
   - **Forms**: `"Create a Chaos feedback form for our workshop with a 1-5 rating and an open feedback question."`
   - **Quizzes**: `"Create a 10-question quiz about cellular respiration with explanations and point values in Chaos."`
   - **Lessons**: `"Create a lesson about portal hypertension with callouts, key takeaways and equations, and publish it in Chaos."`
   - **Courses**: `"Create a complete course on Human Biology with 3 lessons (Cardiovascular, Respiratory, Digestive) and publish it in Chaos."`

## 2c. Connect and test in Claude Desktop

The quickest path is **Add Chaos to Claude** on https://chaos.fail/claude, which opens the connector dialog with the name and URL filled in. The same page offers **Download Chaos for Claude**, a plugin ZIP generated from `lib/integrations` ([details](./ai-integrations.md)). By hand:


1. Open **Customize → Connectors → + Add → Add custom connector** in Claude or Claude Desktop.
2. Name the connection `Chaos`, enter `https://chaos.fail/mcp`, and continue through the detected OAuth settings.
3. Connect your Chaos account and enable Chaos for your conversation. Workspace owners may need to add it in organization settings before members connect.

Chaos serves Streamable HTTP. Use the remote connector UI rather than a bare URL in a local Desktop configuration file. In Claude Code, use `--transport http` and `/mcp` to authenticate; Chaos does not serve an SSE endpoint.

Current instructions: [Claude remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) and [Claude Code MCP](https://code.claude.com/docs/en/mcp).

## 2d. Auto-publishing rules and draft behavior

All assistants (ChatGPT, Claude Desktop, and Claude Code) share identical publication and draft semantics:
- **ChatGPT-created content starts as a draft**: When ChatGPT creates a form, quiz, game draft, lesson, course, or flashcard set, it stays a private draft for review. Ask ChatGPT to publish it when you want a working share link.
- **Claude-created content starts as a draft**: When Claude creates new content through MCP, it stays a private draft until you ask Claude to publish it.
- **Imported content still starts as draft**: Content imported into Chaos from outside sources (Google Forms imports, Microsoft Forms imports, CSV/spreadsheet uploads, or syncs from Max via `/connections/max`) always begins as an unpublished private draft in your library. You can review all questions, citations, and settings before publishing.
- **Subsequent edits remain drafts**: Any modifications to existing published forms, quizzes, lessons, or courses remain in draft mode until you explicitly run the respective publish action (`publish_form`, `publish_lesson`, `publish_course`, `publish_flashcard_set`).

## 3. Submission packet (OpenAI Platform → Plugins → Submit)

Before you start: the submitting account needs the **Apps Management: Write** role, and the organization needs a **verified individual or business identity**.

### Info
- **Plugin name:** Chaos
- **Short description:** Create quizzes, forms, lessons, and courses, and check the results, in your Chaos account.
- **Long description:**
  Chaos is a simple, beautiful form, quiz, and course builder. With the Chaos app, ChatGPT works in your own Chaos account: turn a conversation into a quiz with right answers and points, draft a survey or signup form, create lessons and courses, edit content, and publish when you're ready. Ask how a form is doing and get response counts, answer breakdowns and average quiz scores, or read individual responses when you need them. New things ChatGPT creates are published straight away unless you ask for a draft, edits stay drafts until you choose to publish, and nothing is ever deleted from ChatGPT. Works in English and Arabic. The Chaos app is included on every plan, including free Personal accounts.
- **Category:** Productivity (alternative: Education)
- **Logo:** `public/icon.svg` exported as a square PNG (at least 512×512, no transparency padding issues)
- **Website:** https://chaos.fail
- **Support:** https://chaos.fail/chatgpt (contact: khomod14@gmail.com)
- **Privacy policy:** https://chaos.fail/privacy (has a "Using Chaos in ChatGPT" section)
- **Terms:** https://chaos.fail/terms

### MCP
- **URL type:** Universal · **MCP Server URL:** `https://chaos.fail/mcp`
- **Authentication:** OAuth 2.1 (Clerk, DCR/CIMD, PKCE S256). Scopes: `openid profile email`.
- **Demo credentials:** create a dedicated reviewer account in the **production** Clerk instance with email + password, **no MFA, no email code**. Check in Clerk → Configure → Attack protection / Client Trust that new-device email verification is **off** for it, or reviewers will be blocked. Seed it with: 1 live form with 5+ responses, 1 quiz, 1 draft (see "Test cases"). Chaos MCP is available on every plan (no Pro tier requirement).
- **Content Security Policy:** none. The app has no UI component (text and structured results only).
- **Domain verification:** copy the token into Vercel as `OPENAI_APPS_CHALLENGE_TOKEN`, redeploy, check that `https://chaos.fail/.well-known/openai-apps-challenge` returns exactly the token, then verify.
- **Scan Tools:** should find the 69 tools above with titles, descriptions, input and output schemas, annotations and `securitySchemes`.

### Tool justifications (paste per tool)
- `search_forms`: read-only lookup of the signed-in person's own forms; no side effects, bounded to their account.
- `get_form`: read-only; returns one form's questions and answer key to the owner or collaborators.
- `get_results`: read-only aggregate statistics; contains no individual answers.
- `list_responses`: read-only; returns individual responses that the person already sees in Chaos. The description tells the model to use it only on request.
- `create_form`: creates a form draft and, with `publish: true`, publishes it (anyone with the link can respond), so `openWorldHint: true`.
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
4. **Prompt (Accessing another account's items):** "Show responses for quiz owned by another user." → returns `NOT_FOUND` or authorization error; the model explains that items from other accounts cannot be accessed.

### Global
Pick the countries where Chaos's terms and support apply (for example all available regions, or start with the ones you support).

### Release notes (initial submission)
Initial release of the Chaos app (available on every plan). Lets people create quizzes, forms, surveys, lessons, courses and flashcard sets, edit and publish them, change their status, host live games, and read results and responses in their own Chaos account. OAuth via Clerk (DCR/CIMD + PKCE). No UI component. Reviewer account: <email> / <password> (no MFA); it contains a live form "Workshop feedback" with responses, a live quiz "Chapter 3 review" and a draft "Empty draft".

## Limits and known gaps
- No inline UI widget yet; ChatGPT shows text with links. A card widget would need CSP and a dedicated widget domain for review.
- Classic quizzes (the old quiz editor) are read-only for editing/publication through ChatGPT; owners can host a published classic quiz with host_game.
- Themes: ChatGPT can pick presets and change colours, fonts, buttons, start screen, backdrop and layout, but cannot upload a logo or a background image. An existing logo is kept.
- File-upload questions and custom endings can't be created from ChatGPT; they are kept when editing.
- Each person's calls are limited to 120 per minute.
