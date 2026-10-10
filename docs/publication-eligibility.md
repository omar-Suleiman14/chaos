# Public publication eligibility audit

Issue #140 compared the actual predicates before consolidation. `convex/publicationEligibility.ts` shares only two synchronous facts: lessons must be active, community-ok and have a publication pointer; courses must be unarchived, community-ok and have a publication pointer. Neither helper grants access or fetches documents. Callers retain indexed visibility constraints and all creator/audience/version checks.

| Reader | Additional policy retained |
| --- | --- |
| `learnFrontend.publicLesson` / `publicLessonsBatch` | Public visibility or a verified team audience; restricted creator denial; existing associated version; public/legacy version visibility unless team-authorized. Single returns null; batch omits denied entries and preserves input order/duplicates. |
| `learnFrontend.listIndexableLessons` | Public/community index, restricted creator denial, associated immutable version, public/legacy version visibility and explicit published `indexing: index`. Draft metadata and authenticated ownership cannot establish indexing consent. |
| `learnSearch.searchPublic` | Public/community/active indexed candidates, restricted creator denial and associated public/legacy published version. Search discoverability does not require sitemap indexing consent. Existing author fallback and pagination remain unchanged. |
| `courseDirectory.browse`, `courses.listPublic`, `courses.listIndexable` | Public indexed candidates, restricted creator denial and associated collection version. Directory filters language/topic against published metadata. Each retains its own bounds, ordering and response projection. Collection versions have no visibility field; do not impose lesson-version rules on them. |
| `lessons.lessonAccessForActor` | Owner access precedes grant/team/public access. Grants and team editing have their own moderation rules, and edit access does not require publication. Preserve the existing short-circuit sequence of audience lookups; this helper is not replaced by the catalogue predicate. |
| `courses.getPublic` | Owner and authorized team reads differ from anonymous discovery. Owner review-state handling and per-lesson ownership/team/version checks remain separate. |

The predicates deliberately exclude asynchronous moderation, audience resolution, version association/visibility, indexing, projection and caching. These operations have different caller policies or ordering and cannot be safely collapsed into one public-access helper. Existing legacy version support and truthiness of course archive/publication fields are unchanged.

`tests/integration/publicationEligibility.test.ts` characterized unchanged `main` before extraction and passes after it: four lesson reader surfaces agree on archive/private/hidden/unpublished/private-version/creator-ban denial, support legacy published versions, and distinguish noindex discoverability from sitemap consent. Three course catalogue surfaces agree on archive/private/review/unpublished/missing-version denial. Existing targeted lesson, directory, discovery, frontend and team-content tests exercise owner/editor/team and immutable version boundaries.

No API/schema, errors, query limits/cursors, authentication path, UI or stored content changes. No performance improvement is claimed. Open #173/#135 and #136/#137 also touch frontend/search readers; when those PRs are rebased, retain these predicates in their optimized readers without discarding their caches or managed cursor changes.
