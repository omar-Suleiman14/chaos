# Source similarity indexed read-cost audit — issue #182

Baseline reviewed on `main` `43cc040` (2026-10-10).

The upload mutation already performs indexed, bounded lookups, not an unbounded `collect()`:
1. `by_ownerId_and_sha256_and_status` for exact SHA matches, `.take(100)`.
2. `by_ownerId_and_contentType_and_status`, descending `.take(SOURCE_SIMILARITY_LIMITS.candidates)` where `candidates === 100`, **only** when a fingerprint exists.

The loop then checks only candidates with fingerprints, nonempty sizes and different SHA values. In order, the first sufficiently similar entry is selected. No additional index on fingerprint chunks exists or is justified at this volume. Rate and storage admission and owner's private source boundaries remain unchanged.

`tests/integration/sourceSimilarityCost.test.ts` records the transaction's **actual convex-test read accounting** at 100 and 300 same-owner same-MIME active sources. It checks that reads and indexed query counts do not grow after the cap. Metrics are emitted to CI output. These are deterministic synthetic database costs, **not** real Vercel/Convex p95 latency or browser timings.

The existing `sourceNearDuplicates.test.ts` already covers exact SHA reuse, near duplicates, other-owner isolation, unrelated/small/repetitive fingerprints, storage limits and private metadata. No production query or similarity threshold should be changed without a measured regression. If CI reports growth or the invariant fails, investigate before merging.
