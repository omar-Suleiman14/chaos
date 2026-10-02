# Public Learn discovery (roadmap 45)

`learnDiscovery.search({kind,text,paginationOpts,institutionId?,versionId?})` is a native public query. Kinds: institution, program, module, creator, tag. Module includes subject nodes. Text is NFKC-normalized and lowercased (1-200 characters). Institution/program/module and creator display-name matching use Convex full-text token/prefix semantics, not arbitrary substring matching. Creator matching defaults to indexed username prefixes; creatorMatch=name selects display-name search. Tags use full-text lesson candidates followed by substring matching against published tags. Program filters accept institutionId; module filters accept versionId. Other filter combinations are rejected.

Each request paginates at most 25 primary catalog/user/lesson candidates, plus bounded related-document checks. Creator checks inspect up to five newest active/public/community-ok lesson candidates per user; a creator with no valid snapshot in that window is omitted. This conservative bound prevents unbounded hydration but does not claim exhaustive recovery from stale stored candidates. It returns Convex pagination metadata; continue through empty pages until isDone. endCursor range expansion is explicitly rejected. Creator results are deduplicated per page; tag results are deduplicated per page and bounded by 25 lessons × the enforced 20 published tags (500 maximum). Deduplicate across pages in the consuming client. No global counts or relevance rank are claimed.

Canonical curricula are public directory data under the existing curricula contract. Orphan programs/nodes are skipped. Creator discovery requires a current active, public, community-ok lesson with a matching published snapshot and unrestricted creator. It exposes only username/display name. Tags come from that immutable published metadata, never draft tags. Native owner/editor grants do not broaden public discovery. Existing `learnSearch.searchPublic` remains the indexed lesson title/body search; this query adds the other entity kinds without changing its semantics.

Additive search_name indexes were added to curriculumModel.ts for institution/program/node names. An owner/visibility/community/status index was added to learnModel.ts to authorize creator discovery without scanning private lessons. No schema.ts or publication hooks changed. Creator display-name search uses the additive users search_name index, added surgically without changing table fields or schema spreads. Current username candidates are returned only after public-publication checks. Institution aliases remain available through existing `curricula.resolveAlias`; this query does not claim substring alias search.

Verification is recorded in the final review evidence below; earlier test counts are superseded.


## Explainable ranking (roadmap 43)

`learnCommunity.rank` accepts optional curriculumVersionId and nodeId. A supplied node must exist and match a supplied version. Filters match immutable published curriculumMappings, not current draft mappings. Candidate scope remains the newest 100 public/community-ok lessons; this is not a global leaderboard. Unmatched candidates are excluded. Results are bounded to 20.

Signals retain capped engagement, freshness and exploration. Curriculum match adds 2 when a filter is selected; current published-version quality review adds 1 for reviewed, subtracts 2 for needs_changes, otherwise 0. Open reports subtract 0.25 each, capped at five reports (1.25 total), using a lesson/status index. Reports are unconfirmed caution signals, not proof of wrongdoing; report text and reporter identities never appear in ranked cards. Verified identity contributes no quality points. Missing or non-public snapshots and restricted creators remain excluded. Quality/report effects are additive and inspectable in signals.

## MCP and integration API

`search_learn_directory` uses the same native query through an internal active-account adapter. It has read-only/non-destructive/idempotent annotations, enum entity/creator matching, bounded text and pagination (1�25), and no client actor field. MCP transport supplies the actor after input expansion. No native grants broaden results.

`GET /api/integrations/v2/community/directory?kind=institution&text=University&limit=20` accepts optional creatorMatch, institutionId, versionId and cursor. It requires an active bearer connection with community:read; unknown/duplicate parameters fail validation. Token ownership and scope are rechecked in the internal adapter. Responses are no-store, API version 2, with the same public result contract.

Transport verification: two integration tests plus four native discovery tests passed; six existing MCP registration/community unit tests passed. Backend tsc and scoped lint passed. No deployment, commit or push; official codegen remains the coordinating agent�s next step.

## Final source review evidence (2026-10-01)

- Focused integration command: `pnpm exec vitest run --config vitest.integration.config.mts tests/integration/learnDiscovery.test.ts tests/integration/learnRanking.test.ts tests/integration/learnSearch.test.ts tests/integration/learnDirectoryTransport.test.ts tests/integration/learnCommunity.test.ts tests/integration/learnCommunityIntegrations.test.ts --maxWorkers=2`: **6 files / 28 tests passed**.
- MCP unit command: `pnpm exec vitest run --config vitest.unit.config.mts tests/unit/mcpCommunity.test.ts tests/unit/mcpServer.test.ts --maxWorkers=2`: **2 files / 6 tests passed**.
- Scoped ESLint passed for discovery/community/directory transports, MCP descriptor and reviewed integration tests.
- Confirmed permission defect fixed: native owner grants previously bypassed creator restrictions in community reads; community reads and save/fork authorization previously accepted restricted snapshots. Regression coverage rejects restricted snapshot reads/saves and banned-owner reads.
- Confirmed discovery defect fixed within an explicit bound: one stale creator lesson no longer hides a valid snapshot among five newest candidates. Ranking no longer repeats native grant lookup after its independent public checks.
- Ranking remains a newest-100 candidate window, not a global leaderboard. Indexed tag candidate coverage and five-snapshot creator checks are conservative; source tests do not establish production scale or deployed index availability.
- No deployment, codegen, commit or push in this review. Schema, learnFrontend and lib/learn/data/server were not edited.

Backend verification: `pnpm exec tsc --noEmit -p convex/tsconfig.json` passed. Repository-wide `git diff --check` reports pre-existing trailing blank lines in unrelated form/schema/webhook/MCP files; these were left untouched.
