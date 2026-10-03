# Public Learn discovery

`learnDiscovery.search({kind,text,paginationOpts,institutionId?,versionId?})` is a native public query. Kinds: institution, program, module, creator, tag. Module includes subject nodes. Text is NFKC-normalized and lowercased (1-200 characters). Institution/program/module and creator display-name matching use Convex full-text token/prefix semantics, not arbitrary substring matching. Creator matching defaults to indexed username prefixes; creatorMatch=name selects display-name search. Tags use full-text lesson candidates followed by substring matching against published tags. Program filters accept institutionId; module filters accept versionId. Other filter combinations are rejected.

Each request paginates at most 25 primary catalog/user/lesson candidates, plus bounded related-document checks. Creator checks inspect up to five newest active/public/community-ok lesson candidates per user; a creator with no valid snapshot in that window is omitted. This conservative bound prevents unbounded hydration but does not claim exhaustive recovery from stale stored candidates. It returns Convex pagination metadata; continue through empty pages until isDone. endCursor range expansion is explicitly rejected. Creator results are deduplicated per page; tag results are deduplicated per page and bounded by 25 lessons × the enforced 20 published tags (500 maximum). Deduplicate across pages in the consuming client. No global counts or relevance rank are claimed.

Canonical curricula are public directory data under the existing curricula contract. Orphan programs/nodes are skipped. Creator discovery requires a current active, public, community-ok lesson with a matching published snapshot and unrestricted creator. It exposes only username/display name. Authors appear by default and can turn off **Show me in author lists** in Settings; this removes them from the public author directory and creator search, including MCP/API search. Direct published links and member cards retain their existing access rules. Tags come from immutable published metadata, never draft tags. Native owner/editor grants do not broaden public discovery. Existing `learnSearch.searchPublic` remains the indexed lesson title/body search; this query adds the other entity kinds without changing its semantics.

Additive search_name indexes were added to curriculumModel.ts for institution/program/node names. An owner/visibility/community/status index was added to learnModel.ts to authorize creator discovery without scanning private lessons. No schema.ts or publication hooks changed. Creator display-name search uses the additive users search_name index, added surgically without changing table fields or schema spreads. Current username candidates are returned only after public-publication checks. Institution aliases remain available through existing `curricula.resolveAlias`; this query does not claim substring alias search.



## Explainable ranking

`learnCommunity.rank` accepts optional curriculumVersionId and nodeId. A supplied node must exist and match a supplied version. Filters match immutable published curriculumMappings, not current draft mappings. Candidate scope remains the newest 100 public/community-ok lessons; this is not a global leaderboard. Unmatched candidates are excluded. Results are bounded to 20.

Signals retain capped engagement, freshness and exploration. Curriculum match adds 2 when a filter is selected; current published-version quality review adds 1 for reviewed, subtracts 2 for needs_changes, otherwise 0. Open reports subtract 0.25 each, capped at five reports (1.25 total), using a lesson/status index. Reports are unconfirmed caution signals, not proof of wrongdoing; report text and reporter identities never appear in ranked cards. Verified identity contributes no quality points. Missing or non-public snapshots and restricted creators remain excluded. Quality/report effects are additive and inspectable in signals.

## MCP and integration API

`search_learn_directory` uses the same native query through an internal active-account adapter. It has read-only/non-destructive/idempotent annotations, enum entity/creator matching, bounded text and pagination (1–25), and no client actor field. MCP transport supplies the actor after input expansion. No native grants broaden results.

`GET /api/integrations/v2/community/directory?kind=institution&text=University&limit=20` accepts optional creatorMatch, institutionId, versionId and cursor. It requires an active bearer connection with community:read; unknown/duplicate parameters fail validation. Token ownership and scope are rechecked in the internal adapter. Responses are no-store, API version 2, with the same public result contract.

## Coverage and limits

Regression coverage lives in [native discovery](../tests/integration/learnDiscovery.test.ts), [ranking](../tests/integration/learnRanking.test.ts), [search](../tests/integration/learnSearch.test.ts), [transport](../tests/integration/learnDirectoryTransport.test.ts), and community permission tests. These exercise restricted snapshots, banned creators, saves, forks and stale publication candidates. Local tests do not establish production ranking quality, global coverage or deployed index availability.
