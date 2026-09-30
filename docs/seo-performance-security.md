# Public indexing and deployment boundaries

Production crawlers may fetch public pages. Private dashboard, admin, API, MCP and print areas carry noindex headers and remain protected by server authentication and per-record authorization. Receipt, resume and embed URLs are noindex. Robots directives are indexing hints, never access controls.

Vercel development and preview deployments disallow all crawlers and send noindex headers through the request proxy. Private lesson drafts and source bytes must never enter sitemap or metadata output. Public Learn metadata remains disabled until a server query verifies a current, public, active, permitted published snapshot; browser-local publication is insufficient.

Canonical URLs use the configured validated site origin. Structured data escapes script delimiters. Public forms require creator indexing opt-in; respondent data is never a sitemap entry. A crawler's claimed user agent does not bypass authorization or source-download checks.

# Verified performance and security scope

Backend reads and edits enforce document/block/source limits, bounded pages, ownership, independent source metadata/content access, revision conflicts and rate limits. Public search uses a published-content index. Source retention preserves immutable lesson and collection references and moderation evidence. Webhook delivery rechecks selected scope and revocation before retries.

The development indexed-search baseline measured 100 successful requests at concurrency five, p95 201 ms. It used a nonrepresentative dataset and establishes no sustained production capacity guarantee. Forms, Live and authenticated agent bursts still need representative load experiments. See backend-load-testing.md and platform-slos.md.

The current content-security policy is report-only; do not describe it as enforced protection. Enforcing it requires signed-in browser checks covering Clerk, Convex, editor media and embeds. Formal accessibility, privacy lifecycle and operational compliance acceptance remain separate work.
