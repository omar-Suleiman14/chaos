# Lesson search pagination

`learnSearch.searchPublic` and the community integration adapter keep their existing
arguments and published result fields. Full-text results retain Convex relevance
order. After that stream finishes, author matches follow directory creation order
and each author's lesson creation order. Author matching retains case-insensitive
substring matching against display name/username, matching any supplied word.

The opaque continuation includes each source's native cursor, at most 20 queued
directory IDs, one current author and one pending deduplication probe. It never
accumulates returned lesson IDs. Cursors are UTF-8 encoded, bound to the trimmed
search text, validated and limited to 20,000 encoded bytes. They convey pagination
positions, not access grants. Every resumed candidate rechecks current owner,
publication, creator restrictions and version association/visibility.

Full-text pages inspect at most 20 primary candidates; author processing inspects
at most 20 lesson candidates and up to five 20-row directory pages per request.
Each source read has a 1 MB byte bound. Convex allows one pagination call per
function, so the source steps run as internal queries under the public read.
Each author candidate is checked against the same full-text engine, scoped by
owner and `_creationTime`, then filtered by its exact ID. Even timestamp collisions
continue in bounded 20-row probe pages. No tokenizer approximation or growing
global deduplication set is used.

Continue through empty filtered pages until `isDone`. `numItems` is a requested
maximum, not a promise to fill a page. Existing native full-text cursors remain
usable for that stream; restarting a search after deployment is recommended for
clients retaining pages produced by the old mixed-source implementation. Optional
`endCursor` ranges remain supported within the full-text stream. Cross-stream
ranges are rejected; no split hints are advertised for mixed-source pages.

The existing `usePublicLessons` hook continues filtered pages until its current
20-result window fills or search finishes. It retains its array contract. Claude
can expose subsequent pages for a larger search interface by using the existing
pagination metadata; this change adds no layout or visual components.

Author discovery continues through the full directory using its native cursor,
including authors beyond the historical first-100-user ceiling. The 100-row limit
applies per request, not to the entire search. No unbounded collection or prefix
index replaces substring matching. Existing author continuations at the old
boundary remain valid. No `hideFromAuthorLists` policy changes are introduced:
this is lesson search, distinct from the public author-directory endpoint.

Adding `_creationTime` to the existing search index's filter fields requires the
normal Convex schema/function deployment and index backfill before using the new
probe. It adds no table fields and rewrites no lessons, versions, courses, responses,
scores or connector records. No deployment/backfill was run against production.

Regression coverage is in `tests/integration/learnSearchPagination.test.ts` and
`tests/unit/publicSearchContinuation.test.tsx`, alongside the existing Learn search
and community integration tests. Local `convex-test` costs do not establish deployed
latency or index-backfill duration.
