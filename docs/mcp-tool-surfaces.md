# Focused MCP tool surfaces

The canonical URL **`https://chaos.fail/mcp`** is unchanged, retains every authorized tool, and remains the default for existing ChatGPT, Claude, Codex and plugin connections.

For new connections that mostly do **one** kind of work, use a focused **remote MCP URL**:

| Surface | Connection URL | Includes |
| --- | --- | --- |
| All | `https://chaos.fail/mcp` | Complete public registry, plus admin tools only for verified admins |
| Forms and quizzes | `https://chaos.fail/mcp?surface=forms` | Create, edit, publish, themes, settings, summaries, responses |
| Lessons and courses | `https://chaos.fail/mcp?surface=learn` | Lessons, courses, study jobs, versions, flashcards, attached quizzes |
| Live classrooms | `https://chaos.fail/mcp?surface=live` | Find or create quiz, host room, progress rounds, results |
| Teams and folders | `https://chaos.fail/mcp?surface=teams` | Membership, sharing, folders |

These are **static, opt-in subsets**, not automatic task detection or dynamic tool expansion: use a different URL or the canonical `/mcp` if you need more capabilities. Clients may need to reconnect/refresh their tool inventory after switching URLs. Each focused endpoint uses the same account OAuth resource and authentication mechanism as `/mcp`; the user still signs into their Chaos account.

Each tool keeps its existing name, parameters, output, annotations and permission category. The MCP SDK disables tools outside the selected profile in **both** `tools/list` and `tools/call`; composed operations also check the profile. Profiles are only a discoverability optimization, **not** a substitute for the backend's ownership, account, role and permission checks.

Unrecognized surface names return HTTP 400 rather than silently receiving the full registry. The canonical `/mcp` URL cannot be changed by request headers or by an assistant asking for a different task.

## Verification before rollout

- `pnpm test:unit -- tests/unit/mcpSurfaces.test.ts` (or run the Vitest unit config with a file filter).
- `pnpm mcp:inventory:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- With test OAuth credentials, compare `tools/list` payload bytes on each profile and the full endpoint, and try a disabled tool via `tools/call` to verify it fails.
- Test actual ChatGPT and Claude connection and reconnect flows for two profiles; clients differ in URL query handling.
- Do not change the downloaded plugin packages to a narrower profile until a migration is planned.

Profiles are intentionally distinct from fine-grained **per-OAuth-client consent**. A profile hides unneeded tools but never grants a new permission.
