# Hosts

chaos.fail is split by what a visitor came to do. Each section has its own subdomain; the paths are the same everywhere.

| Host | Purpose | Paths it serves |
| --- | --- | --- |
| `chaos.fail` | Discover | Marketing pages, `/f/<id>` and `/<username>/<slug>` forms, `/card` |
| `play.chaos.fail` | Play | `/play`: players join live games with a PIN |
| `app.chaos.fail` | Create | `/dashboard`, `/admin`, `/print`, `/homework` |
| `learn.chaos.fail` | Learn | `/learn` and everything under it (lessons, courses, flashcards, people) |
| `docs.chaos.fail` | Understand and build | `/docs`, `/ar/docs` |

Every host also serves `/sign-in`, `/sign-up`, `/auth` (OAuth consent for MCP clients), `/api`, `/mcp`, `/.well-known`, `/robots.txt` and `/sitemap.xml`.

## How it works

- `lib/hosts.ts` maps a path to its section (`pathSection`) and a section to its origin.
- `proxy.ts` redirects a request on the wrong host to the right one (308, path and query kept), before authentication and language routing. A bare subdomain opens its home page with a 307: `app.chaos.fail` → `/dashboard`, `learn.chaos.fail` → `/learn`, `docs.chaos.fail` → `/docs`, `play.chaos.fail` → `/play` (with the query kept, so `play.chaos.fail/?pin=123456` works).
- Old links keep working: `chaos.fail/dashboard/forms` lands on `app.chaos.fail/dashboard/forms`, including links that Convex builds from `CHAOS_APP_URL`.
- `SiteLink`, `IntentLink` and `hostHref()` turn root-relative links into absolute ones on the right host. `next/link` still navigates client-side when that host is the current one, so links inside a section stay instant. A plain relative link to another section still works through the redirect, at the cost of one extra hop.
- Links people copy (form share links, lesson links, team invites, homework) use `linkOrigin(section)`.
- Canonical URLs, hreflang alternates, the sitemap and structured data use `absoluteUrl()`, so each page's canonical address is on its own host. `robots.txt` on every host points to the single sitemap on `chaos.fail`, which is how a sitemap may list URLs on other hosts.
- The `chaos-lang` cookie is set on `chaos.fail` (the parent domain), so the language follows a visitor between hosts.
- Sign-in: Clerk production instances share the session across subdomains of the primary domain. The first visit to a new subdomain may do one Clerk handshake redirect. Better Auth sessions are host-only; keep a single host with Better Auth unless you configure cross-subdomain cookies.

## Configuration

Set at build time (they are `NEXT_PUBLIC_` variables):

```
NEXT_PUBLIC_APP_URL=https://chaos.fail
NEXT_PUBLIC_DASHBOARD_ORIGIN=https://app.chaos.fail
NEXT_PUBLIC_LEARN_ORIGIN=https://learn.chaos.fail
NEXT_PUBLIC_DOCS_ORIGIN=https://docs.chaos.fail
NEXT_PUBLIC_PLAY_ORIGIN=https://play.chaos.fail
```

Each is optional. An unset origin keeps that section on `NEXT_PUBLIC_APP_URL`. With none set, nothing changes: local development, Vercel previews and self-hosted installs run on one host. On Vercel the section variables are set for Production only, so preview deployments stay on their own `*.vercel.app` address.

On Vercel, each subdomain is added to the `chaos` project as a domain (`vercel domains add app.chaos.fail chaos`). DNS for `chaos.fail` is on Vercel, so the records are created automatically.
