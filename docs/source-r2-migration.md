# PR 08/32 — Existing teaching-source R2 migration (opt-in)

Draft, stacked on #384. This is a guarded **copy and read-parity slice**, not authorization certification or production rollout.

## How it works

- `sourceR2Migration.migrate({ sourceId })` is **owner-only** and copies one existing legacy `learnSources.storageId` file from Convex to the **private** R2 bucket on the server. No public URLs or browser-supplied keys. It does **not** run automatically and never grants new access.
- Same private bucket credentials from `docs/course-r2-media.md` are required, with a distinct `learn-sources/<sourceId>` namespace. A first-write-only signed PUT rejects overwrites. Interrupted retries inspect and verify an existing object.
- Both copies must match the recorded byte count, MIME, magic signature and entire SHA-256 digest. HEAD, conditional GET and a pinned ETag are required before an atomic `r2` marker becomes readable.
- `/learn/sources/content` checks the **existing live source permission policy** for every GET and proxies R2 when an `r2` marker exists; MCP `studySourceUploads.readContent` uses the same R2 object with conditional byte ranges. Neither exposes an R2 GET capability. **R2 failure fails closed** for migrated records (no legacy bypass).
- Existing nonmigrated files continue to work via Convex, so this PR itself does not force clients to switch transport. `sourceR2Migration.rollback` (owner-only) restores the Convex read selector; keep legacy bytes until an audited deletion plan is complete.

## Release blockers — not yet solved

1. **Course source authorization parity is not certified.** Existing `canReadSourcePart` public/restricted grants, independently shared lesson sources, course source attachments and MCP/third-party source grants still need a full access-link audit and historic backfill. A public source remains public even when it is referenced by a protected course. Do not imply that only approved course students can access all legacy source bytes.
2. Real private R2 bucket, scoped credentials, real migration/retry/rollback and mobile/MCP range smoke tests, interrupted retry and corruption drills have not been performed. No new source uploads are routed to R2 yet.
3. Legacy Convex storage is intentionally **not deleted**. Existing historical storage URLs, usage/quota accounting, orphan R2 cleanup, bucket lifecycle and regulated retention holds must be audited before cutover. Count both copies separately during dual-write/dual-storage operations.
4. Race-safe per-account migration rate limits, background batching, progress and operational monitoring are not shipped. Run a bounded manual migration only after review.
5. Form/quiz access-code-gated images, #381/#384 screenshot requirements, and separate direct form/quiz/course source audit remain blockers to a secure production release. No merge/deploy from this draft.

## Safety invariants

- Database marker points to R2 only after verification; no silent fallback from R2 to Convex on denied/unavailable reads.
- GET does not change source status or permission and keeps the same public proxy URL.
- Rollback only changes the read selector; it does not remove a bucket object or alter author permissions.
- Deleted/removed sources and restricted creators still cannot be read through the new R2 proxy.
