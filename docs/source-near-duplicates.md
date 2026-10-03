# Uploaded source similarity

Exact SHA-256 private-file deduplication is unchanged. Near-duplicate detection is a separate, conservative review hint: a new source and its independent permissions are retained, with optional `nearDuplicateOf` pointing to one active source owned by the same uploader. It never copies grants, grants file access, shares storage, or merges content.

## Byte-level scope

`aligned-byte-chunks-v1` hashes complete aligned 512-byte chunks with a pair of noncryptographic 32-bit hashes. Files with at most 1,024 complete chunks use all chunks; larger files sample at most 1,024 evenly distributed chunks, reading at most 512 KiB for hashing. The final partial chunk is ignored. The sorted distinct hashes form the versioned fingerprint. These hashes are similarity hints, not an integrity or security mechanism; SHA-256 remains the exact identity mechanism.

Candidates must have the same owner, content type and active status. An indexed read examines only the newest 100 candidates. A candidate is flagged only when file sizes differ by no more than 2%, both fingerprints have at least 16 distinct chunks, and at least 90% of each fingerprint's distinct hashes are shared. The newest qualifying candidate is linked deterministically. Older files without fingerprints are skipped; no historical scan or backfill runs automatically.

The method is useful for largely unchanged byte layouts with small replacements, such as minor edits to uncompressed notes or files preserving most encoded bytes. It does **not** reliably identify equivalent PDFs, recompressed slides, re-encoded images, shifted layouts after insertion/deletion, or semantic paraphrases. Small files, repetitive content and changes outside sampled regions may be missed. Large common binary sections can produce false positives. The flag requires human review and must not be presented as proof of copying or infringement.

## Boundaries and contract

Fingerprints are computed after authenticated upload and signature validation, never accepted from the public upload request. `learnSources` gains optional `fingerprint` and `nearDuplicateOf` fields plus `by_ownerId_and_contentType_and_status`. No direct `schema.ts` edit is needed. The authenticated uploader's response may include `nearDuplicateOf`; public/shared source metadata excludes both fields. Other owners' files are never candidates, including exact matches.

All checks are bounded: 1,024 fingerprint hashes per file and 100 indexed candidates per registration. Publication, citations and downloads continue using existing source permission checks. A linked candidate can later be removed without changing the new source's lifecycle or access rights.

## Regression coverage

[Near-duplicate tests](../tests/integration/sourceNearDuplicates.test.ts) cover aligned edits, exact reuse, unrelated and repetitive files, other-owner isolation, server-side computation and redaction of private source metadata across MCP, API and default context. [Source upload tests](../tests/integration/learnSources.test.ts) exercise the 25 MiB boundary and streamed overflow cancellation before storage. This coverage verifies bounded local policy; deployed PDF/slide similarity, memory headroom and throughput require separate acceptance.
