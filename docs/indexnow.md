# IndexNow

Chaos tells [IndexNow](https://www.indexnow.org/) engines (Bing, Yandex, Seznam, Naver and others) when a public, indexable page is published, changed, unpublished or deleted, so they recrawl it within minutes instead of waiting for the sitemap. Google does not use IndexNow; it keeps reading `/sitemap.xml`.

## Setup

1. Generate a key: `openssl rand -hex 16` (8-128 characters of `a-z`, `A-Z`, `0-9` and `-`).
2. Set `INDEXNOW_KEY` to the same value in both places:
   - the Next.js app (Vercel project env, or `.env` for Docker), which serves the key file;
   - the Convex deployment (`npx convex env set INDEXNOW_KEY <key>`; the Docker `convex-deploy` step copies it), which submits URLs.
3. Make sure Convex has `CHAOS_APP_URL` set to the public HTTPS origin (`https://chaos.fail`). Submission is off when it is `http://`, `localhost` or an IP address, so development and preview deployments never submit.
4. Deploy, then check `https://chaos.fail/<key>.txt` returns the key as plain text.

Leaving `INDEXNOW_KEY` empty turns the feature off. Nothing else changes.

## What is submitted

| Content | URL | Indexable when |
| --- | --- | --- |
| Lessons | `/learn/<id>` | published, public, active, not moderated, creator not restricted, and the author chose "index" |
| Courses | `/learn/courses/<id>` | published, public, not archived, not moderated, creator not restricted, not marked noindex |
| Forms, including quiz forms | `/f/<shareId>` | live, published, public access, the creator turned on search indexing, not held or restricted |
| Documentation | `/docs/<slug>`, `/ar/docs/<slug>` | an admin publishes a changed article (the URL of its language) |

A URL is queued when its page becomes indexable, when it stays indexable and its published content changes, and when it stops being indexable (unpublished, archived, deleted, moderated, made private or switched to noindex), so engines recrawl and drop it. Pages that were never indexable are never submitted.

Draft saves and autosaves change only drafts, which public pages never show, so they submit nothing. Republishing identical content submits nothing.

Not submitted: member cards (`/card/<username>`) have no publish step and stay in the sitemap only; contributor and collection pages are noindex. Account bans and suspensions hide a creator's pages but are not submitted; the sitemap and normal recrawls pick those up.

## How it works

- `convex/authorIndex.ts` `authorDb` already observes every publication-related write to forms, lessons and courses. It now compares each asset's indexable state before and after the write (`convex/indexNow.ts` `indexNowState`) and queues changed URLs. `convex/docs.ts` queues changed published articles.
- Queued URLs go into the `indexNowQueue` table, deduplicated. The first change schedules a flush 60 seconds later, so a burst (a course publishing its lessons) becomes one submission.
- The flush action takes up to 500 URLs, POSTs them to `https://api.indexnow.org/indexnow` with the key and `keyLocation`, and schedules itself again if more remain.
- Every URL is validated twice (when queued and before sending): it must be HTTPS on the configured site host, with no credentials or query string, and outside `/dashboard`, `/admin`, `/api`, `/mcp`, `/print`, `/auth`, `/homework`, `/sign-in`, `/sign-up` and `/play`.
- Failures are non-blocking. Publishing never waits for IndexNow; the request runs in a scheduled action with a 10 second timeout, and a rejected or failed batch is logged (`IndexNow rejected a submission` / `IndexNow submission failed` in Convex logs) and dropped. The sitemap remains the fallback.
- `/<key>.txt` is rewritten in `next.config.ts` to `app/api/indexnow/key/[key]/route.ts`, which answers only for the configured key and returns 404 for anything else.

Tests: `tests/unit/indexNow.test.ts` (URL validation, batching, payload, failure handling) and `tests/integration/indexNow.test.ts` (which writes queue which URLs, and the flush).
