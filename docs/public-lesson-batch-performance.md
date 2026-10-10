# Batched public lesson read cost

`learnFrontend.publicLessonsBatch` keeps its existing full-publication contract:
ordered results, repeated IDs, at most the first 50 input IDs, and omission of
invalid or unavailable records. It still returns the complete immutable version,
including document blocks. It is not a compact card or metadata endpoint.

The handler now runs bounded lesson projections concurrently. Request-local
promises share repeated creator-restriction and display-profile lookups. The
existing `creatorRestricted` policy remains authoritative, and each lesson,
version and team audience is checked independently. Nothing is cached across
requests, so moderation and team-membership revocation apply on the next read.

## Reproducible synthetic measurements

Measured using real handlers and convex-test transaction accounting, with the
fixtures in `tests/integration/publicLessonBatch.test.ts`, against main
`77ba616` and the optimized handler. Run:

```sh
pnpm exec vitest run --config vitest.integration.config.mts tests/integration/publicLessonBatch.test.ts
```

| Lessons | Authors | Document reads / queries before | After | Bytes read before | After | Response bytes (unchanged) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 4 | 4 | 1,152 | 1,152 | 577 |
| 10 | 1 | 40 | 22 | 10,908 | 7,740 | 5,373 |
| 50 | 1 | 200 | 102 | 54,348 | 37,100 | 26,802 |
| 10 | 10 | 40 | 40 | 11,028 | 11,028 | 5,373 |

For 50 lessons by one author, reads and queries fall by 49%, and bytes read by
31.7%. Each request still uses one read-only transaction. Distinct-author pages
retain their existing read cost. Regression assertions enforce the shared- and
distinct-author query budgets and preserve snapshot, ordering, privacy and legacy
contracts.

These are synthetic database costs, not production latency or capacity claims.
Full lesson documents remain in the payload, and team membership reads are not
memoized. Concurrency removes the serial dependency between unrelated lessons;
its deployed latency effect requires a provisioned nonproduction measurement.
