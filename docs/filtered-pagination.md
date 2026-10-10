# Visibility-filtered pagination audit

Issue #138 reviewed the current `main` behavior after #132. No backend refill or cursor change is justified: an empty visible page is not exhaustion, and the scoped consumers already follow native continuations. Keep each request bounded by its source page rather than promising a full page of visible items through additional joined reads.

| Endpoint | Source page / filtering | Consumers and continuation |
| --- | --- | --- |
| `learnFrontend.listIndexableLessons` | 1–50 public/community-ok lessons, then active publication, creator moderation, version association, published indexing consent and version visibility | `lib/learn/server.ts` follows even empty pages until native `isDone`, with the existing 20,000-page sitemap discovery guard and truncation logging. #132 introduced this behavior. |
| `publicAuthors.browse` | 1–48 indexed public authors, then listing opt-out, moderation and valid username | `PublicAuthors` requests another 24 when results are empty and status is `CanLoadMore`. SSR lookup seeds the first page; the live consumer continues. `mcpCards` returns the same native pagination contract to clients. |
| `studentRoster.publicStudents` | At most 48 relationships / 500,000 source bytes, then account existence, moderation and explicit student consent | `StudentsRoster` requests another 24 near the end, including an empty roster. `StudentOrbit` requests another 48 near the end, including empty sides. Private `mine` / MCP roster retain all relationships and their private projections. |

All endpoints retain the source `continueCursor`, `isDone` and other native pagination metadata after filtering. Consumers must terminate on `isDone` (or Convex `Exhausted`), never on `page.length === 0`. MCP callers must follow the returned cursor; an empty page alone cannot establish that no public authors exist. No new frontend integration is needed.

Do not loop multiple `paginate` calls inside a Convex query, infer consent from legacy `publicVisible`, expose guest relationships, or refill by bypassing creator/version checks. Source bounds do not bound joined document sizes; adding backend refill would increase reads without fixing an observed consumer failure.

## Regression evidence

`tests/integration/filteredPagination.test.ts` follows one-row native source windows across consecutive filtered pages to a later eligible author, student and Arabic lesson. It checks advancing continuations, non-exhaustion before the eligible page, private roster-context removal, explicit student consent versus legacy flags, moderated accounts, and published metadata rather than draft titles. These tests pass on unchanged backend code.

Existing `authorListingVisibility`, `studentCards`, `learnFrontendBackend`, `publicAuthors`, `studentOrbit` and `learnServer` tests cover interleaved eligibility, listing restoration, moderation/privacy boundaries, empty-page automatic continuation and sitemap discovery/truncation. No visual components, styles, layouts, database schema or saved records were changed. Production and live provider verification require deployment credentials and were not performed.
