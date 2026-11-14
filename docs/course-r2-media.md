# PR 06/32 — Private Cloudflare R2 course-media foundation

This is an **opt-in, unshipped infrastructure layer**, not a migration of existing
Convex source files. Until the follow-up source migration and direct form/quiz
guards are shipped, **do not mark course media or the full course-security
feature ready for production**.

## Configuration (Convex server environment ONLY)

- CHAOS_R2_ACCOUNT_ID — 32-hex-character Cloudflare account ID
- CHAOS_R2_BUCKET — the **private** R2 bucket for course media
- CHAOS_R2_ACCESS_KEY_ID — R2 S3 access key scoped to this bucket
- CHAOS_R2_SECRET_ACCESS_KEY — R2 S3 secret for that key

Never set a public R2 domain, r2.dev access, or a bucket-wide public
read policy. Do not put secrets in NEXT_PUBLIC_ variables. Credentials are
read only by trusted Convex actions, not in mutations, queries, responses or
the browser. Use a separate least-privilege bucket credential where possible.

For direct browser uploads, configure bucket CORS for the actual app origins,
PUT only, request headers Content-Type and If-None-Match. CORS is **not**
authentication. The storage service requires a signed URL for each request.

## API lifecycle

1. Authenticated doctor calls courseMedia.reserveUpload with the exact course
   and lesson, expected byte length and supported MIME. The server verifies
   ownership, lesson association, rate limit and a 25 MiB cap.
2. Doctor calls courseMedia.getUploadTarget for a short-lived presigned PUT.
   Send exactly the returned headers and file body to R2. The signed
   If-None-Match: * means the URL cannot overwrite an existing object.
3. Doctor calls courseMedia.completeUpload. Server-side HEAD verifies size,
   MIME and ETag; a conditional range GET checks a supported file signature.
   Only then is status changed from pending to ready.
4. Read courseMedia.getContentUrl and GET the same-origin Convex-site
   /learn/course-media/content?mediaId=... with a Convex Bearer JWT, as a
   no-credentials/no-cache fetch. The route checks current approval and
   publication **on every request**, then proxies an ETag-pinned R2 GET.
   No signed R2 download URL is returned to the browser.
5. Doctor may remove a media record to immediately revoke subsequent reads.
   Physical object purge, aged pending uploads and storage accounting remain
   future cleanup tasks. Do not enable broad production uploads without them.

## Boundaries and release blockers

- This layer serves its own courseMediaObjects only. Existing learnSources
  storageId-based image, PDF and MCP paths are **not migrated or gated by it**.
- Existing published shareId form/quiz routes are not gated by this PR.
- Course membership backfill, PR #381 screenshots, operational bucket setup,
  end-to-end browser upload smoke tests and an orphan-object cleanup job are
  required before production use.
- Short-lived PUT URLs are bearer capabilities. ETag pinning and conditional
  first-write-only PUT protect against replay/replacement. Object access after
  a user is removed is denied by the server proxy; bytes already received
  cannot be recalled.
- Course discovery still shows public course metadata only; no media object
  keys or download URLs are exposed there.
