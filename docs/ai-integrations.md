# AI integrations: Claude and ChatGPT

Chaos is a hosted remote MCP server at **`https://chaos.fail/mcp`** (Streamable HTTP, OAuth). This page covers the public integration pages, the downloadable plugin packages and how they stay in sync. For the tools themselves and production setup see [chatgpt-app.md](./chatgpt-app.md); for permission categories see [mcp-permissions.md](./mcp-permissions.md).

## Pages

| Route | What it is |
|---|---|
| [`/claude`](https://chaos.fail/claude) | Chaos for Claude: one-click connector, plugin download, Claude Code command, manual settings, security notes |
| [`/chatgpt`](https://chaos.fail/chatgpt) | Chaos for ChatGPT: app setup, plugin download, manual settings, security notes |
| [`/connect`](https://chaos.fail/connect) | Integration cards for every platform plus the combined step-by-step guide |

Both platform pages render `components/site/IntegrationView.tsx` with a `platform` prop, so they share one layout (hero, connect, what it can do, manual setup, security) and differ only in copy. Styles live in `components/site/integrations.css`.

## One source of truth

`lib/integrations/index.ts` holds everything that describes Chaos to an assistant:

- name, id, version, tagline, short and long description, developer, licence, keywords
- the canonical logo path (`/icon.svg`) and brand colour
- the public site, MCP, docs, privacy, terms and support URLs (derived from `NEXT_PUBLIC_APP_URL`, so self-hosted instances advertise their own origin)
- the sign-in method (OAuth) and starter prompts
- `integrationPlatforms`: each platform's page, package file name and connect link

Everything else reads from it:

| Consumer | Uses |
|---|---|
| `lib/mcp/server.ts` | server name, version, title, website URL and icons |
| `components/site/IntegrationView.tsx` | URLs, logo, version, connect links, download paths |
| `components/site/ConnectView.tsx` | integration cards and connect links |
| `lib/integrations/packages.ts` | every file in both plugin packages |

The MCP server version and the package version are the same number (`chaosIntegration.version`). Bump it when tools or packages change.

## Downloadable packages

`app/api/plugins/[file]/route.tsx` builds these once per deploy (`force-static` with `generateStaticParams`), from the shared config and `public/icon.svg`:

| File | Contents |
|---|---|
| `/api/plugins/chaos-for-claude.zip` | Claude plugin: `.claude-plugin/plugin.json` (name, display name, version, description, author, homepage, licence, `icon`, documentation, support, privacy and terms URLs), `.mcp.json`, `skills/chaos/SKILL.md`, `assets/logo.svg`, `assets/logo.png`, `README.md` |
| `/api/plugins/chaos-for-chatgpt.zip` | OpenAI plugin (Codex format): `.codex-plugin/plugin.json` with the `interface` block (display name, descriptions, developer, category, capabilities, website/privacy/terms URLs, up to three starter prompts, brand colour, `composerIcon`, `logo`), `.mcp.json`, `skills/chaos/SKILL.md`, `assets/`, `README.md` |
| `/api/plugins/chaos-icon-512.png`, `chaos-icon-128.png` | PNG renders of `public/icon.svg` (via `next/og`), used in packages, the manual-setup section and the MCP `serverInfo.icons` |

`.mcp.json` is the same in both:

```json
{ "mcpServers": { "chaos": { "type": "http", "url": "https://chaos.fail/mcp" } } }
```

The ZIPs use a fixed timestamp so an unchanged config produces byte-identical files.

### What the packages never contain

No client secrets, tokens, `CHAOS_MCP_SECRET`, Convex, Clerk or Better Auth values, or any other environment variable. The only network address is the public MCP URL. `tests/unit/integrations.test.ts` checks this, checks that every manifest field matches the shared config, and checks the manifest shapes and limits (for example Codex's three starter prompts of at most 128 characters).

### Install paths

- **Claude (recommended):** the "Add Chaos to Claude" button opens claude.ai's "Add custom connector" dialog with the name and URL filled in. Connectors added there also appear in Claude Desktop and the mobile apps.
- **Claude plugin:** upload the ZIP in Claude's plugin settings, or unzip it and run `claude --plugin-dir <folder>` in Claude Code.
- **Claude Code:** `claude mcp add --transport http chaos https://chaos.fail/mcp`, then `/mcp` to sign in.
- **Claude Desktop extension (`.mcpb`):** not provided. Chaos is a hosted service; a local extension would only proxy the same remote server, and Desktop already picks up remote connectors.
- **ChatGPT:** add Chaos as an app in developer mode (name, URL, OAuth). ChatGPT has no prefill link, so the button opens its settings.
- **Codex:** unzip the ChatGPT package into `~/plugins/chaos` and add it to `~/.agents/plugins/marketplace.json` (the package README has the entry).

Every path ends in the same OAuth sign-in on Chaos, so the connection gets exactly the signed-in account's access.

## Security

- Only the user-facing tool surface is offered. Admin, CRM and documentation-authoring tools register only when the backend confirms the caller is an administrator (`app/mcp/route.ts`), and the server instructions that describe them are sent only to those connections.
- Every tool call is checked again in Convex as the connected account: ownership, collaborator role, plan, publication and moderation state.
- The packages reference the public endpoint only; installing one grants nothing until the person signs in.
- `tests/unit/integrations.test.ts` asserts that a non-admin server lists no admin or CRM tools and that its instructions do not mention them.

## Adding a platform

1. Add an entry to `integrationPlatforms` in `lib/integrations/index.ts`.
2. Add its package builder to `lib/integrations/packages.ts` (reuse `common()` for the MCP config, skill, logo and README).
3. Add its copy to `IntegrationView` and a page under `app/[lang]/(site)/<platform>/page.tsx`.
4. Register the route in `app/sitemap.ts`, `lib/locale.ts` (`SITE_PATHS`) and `convex/links.ts` (`RESERVED`), and link it from the footer and site map.
