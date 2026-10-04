# Public indexing and deployment boundaries

Production crawlers may fetch public pages. Private dashboard, admin, API, MCP and print areas carry noindex headers and remain protected by server authentication and per-record authorization. Receipt, resume and embed URLs are noindex. Robots directives are indexing hints, never access controls.

Vercel development and preview deployments disallow all crawlers and send noindex headers through the request proxy. Private lesson drafts and source bytes must never enter sitemap or metadata output. Public Learn metadata remains disabled until a server query verifies a current, public, active, permitted published snapshot; browser-local publication is insufficient.

Canonical URLs use the configured validated site origin. Structured data escapes script delimiters. Public forms require creator indexing opt-in; respondent data is never a sitemap entry. A crawler's claimed user agent does not bypass authorization or source-download checks.

# Verified performance and security scope

Backend reads and edits enforce document/block/source limits, bounded pages, ownership, independent source metadata/content access, revision conflicts and rate limits. Public search uses a published-content index. Source retention preserves immutable lesson and collection references and moderation evidence. Webhook delivery rechecks selected scope and revocation before retries.

The development indexed-search baseline measured 100 successful requests at concurrency five, p95 201 ms. It used a nonrepresentative dataset and establishes no sustained production capacity guarantee. Forms, Live and authenticated agent bursts still need representative load experiments. See backend-load-testing.md and platform-slos.md.

The current content-security policy is report-only; do not describe it as enforced protection. Enforcing it requires signed-in browser checks covering Clerk, Convex, editor media and embeds. Formal accessibility, privacy lifecycle and operational compliance acceptance remain separate work.

# Canonical host, share images and IndexNow

`chaos.fail` is the only canonical host. `next.config.ts` answers any request for `www.chaos.fail` with a permanent 308 to the same path on `chaos.fail`; a Vercel domain-level redirect (www → chaos.fail, 308) does the same earlier and is preferred where available.

Every page built with `pageMetadata()` carries the default share card (`app/opengraph-image.tsx`) in Open Graph and Twitter tags. Lessons and courses with a photo cover use the cover instead; SVG covers fall back to the default card because social networks cannot render them.

IndexNow submissions for published, changed and removed public content are described in indexnow.md.

# Languages, URLs and caching

Pages live under `app/[lang]` and the root layout takes the language from that segment, never from cookies, so it can render statically.

- **Marketing pages** (`app/[lang]/(site)`: `/`, `/pricing`, `/compare`, `/docs` and every guide, `/learn`, `/chatgpt`, `/connect`, `/support`, `/privacy`, `/terms`, `/copyright`) have an address per language. English is unprefixed and is the `x-default`; Arabic lives under `/ar` (`/ar`, `/ar/docs`, `/ar/learn`). Both prerender at build time; guides revalidate every five minutes and show edits sooner through the live docs subscription. Each page sets its canonical, `hreflang` `en`/`ar`/`x-default` alternates and Arabic titles and descriptions, and the sitemap lists both addresses with their alternates.
- **Everything else** (`app/[lang]/(app)`: dashboard, admin, public forms, Learn readers, member cards, Live) keeps one address. `proxy.ts` rewrites it to the segment of the `chaos-lang` cookie, and `(app)/layout.tsx` calls `connection()`, so these pages render per request with live data exactly as before.
- **Routing** (`lib/localeRouting.ts`, used by both proxy branches): `/pricing` is served from the internal `/en/pricing`; `/ar/pricing` is served as is and sets the cookie to Arabic; an Arabic reader who opens `/pricing` is redirected (307) to `/ar/pricing`; `/en/...` permanently redirects (308) to the unprefixed address; `/ar/<single-address page>` redirects to the unprefixed page and sets the cookie. Route handlers (`/api`, `/mcp`, `/.well-known`, `/opengraph-image`, robots and sitemap) stay outside the segment.
- **Switching language** on a marketing page loads the other address; elsewhere it switches in place and the cookie picks the segment for later requests. Links built with `SiteLink` or `IntentLink` point marketing pages at the reader's language.
- Unmatched URLs use `app/global-not-found.tsx`, since no layout exists above `app/[lang]`.

Usernames are at least three characters, so `/ar/...` and `/en/...` can never be custom form links; `lib/embed.ts` reserves both segments.
